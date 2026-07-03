/**
 * =================================================================
 * COLECTOR AUTÓNOMO DE RED - WIN NETWATCH
 * =================================================================
 * Este script se ejecuta en segundo plano en un equipo de trabajo (24/7).
 * Realiza escaneos periódicos de subredes, detecta equipos activos,
 * resuelve sus hostnames/direcciones MAC y actualiza Firebase en la nube.
 * 
 * Sin dependencias externas. Ejecutar con: node colector.mjs
 */

import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------
// 1. CARGA DE CONFIGURACIÓN (.env)
// -----------------------------------------------------------------
function loadEnv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.error('[Config] Error al leer el archivo de entorno:', err);
  }
}

// Cargar .env local si existe
loadEnv(path.join(__dirname, 'colector.env'));

const config = {
  projectId: process.env.FIREBASE_PROJECT_ID || 'network-monitor-36186',
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyAptyWP56e5m8nxprmxNQpETfWwHOlvBkY',
  email: process.env.COLLECTOR_EMAIL || 'admin@mg.cl',
  password: process.env.COLLECTOR_PASSWORD || '123456',
  subnets: (process.env.SCAN_SUBNETS || '172.30.100.0/24,172.30.101.0/24,172.30.102.0/24,172.30.110.0/24,172.30.112.0/24')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  scanIntervalSeconds: Number(process.env.SCAN_INTERVAL_SECONDS || 120),
  criticalScanIntervalSeconds: Number(process.env.CRITICAL_SCAN_INTERVAL_SECONDS || 10),
  uptimeAnomalyThresholdSeconds: Number(process.env.UPTIME_ANOMALY_THRESHOLD_SECONDS || 30),
  detectRebootsViaTTL: (process.env.DETECT_REBOOTS_VIA_TTL || 'true') === 'true',
  scanConcurrency: Number(process.env.SCAN_CONCURRENCY || 50),
  pingTimeoutMs: Number(process.env.PING_TIMEOUT_MS || 3000),
  pingAttempts: Number(process.env.PING_ATTEMPTS || 2),
  rdpTimeoutMs: Number(process.env.RDP_TIMEOUT_MS || 700),
  tcpTimeoutMs: Number(process.env.TCP_TIMEOUT_MS || 1500),
  slowThresholdMs: Number(process.env.SLOW_THRESHOLD_MS || 250),
  newDeviceMinConfidence: Number(process.env.NEW_DEVICE_MIN_CONFIDENCE || 2),
  windowsProbePorts: (process.env.WINDOWS_PROBE_PORTS || '3389,445,135,139,5985,5986')
    .split(',')
    .map(Number)
    .filter(Boolean)
};

console.log('[Collector] Configuración cargada:');
console.log(`  - Proyecto Firebase: ${config.projectId}`);
console.log(`  - Subredes: ${config.subnets.join(', ')}`);
console.log(`  - Concurrencia: ${config.scanConcurrency}`);
console.log(`  - Intervalo de escaneo: ${config.scanIntervalSeconds} segundos`);
console.log(`  - Intervalo de escaneo crítico: ${config.criticalScanIntervalSeconds} segundos`);

// -----------------------------------------------------------------
// 2. CONEXIÓN API REST FIREBASE (AUTENTICACIÓN Y CRUD)
// -----------------------------------------------------------------
let cachedToken = null;
let tokenExpiryTime = 0;

let isCloudQuotaExceeded = false;
let cloudQuotaExceededTime = 0;
const CLOUD_COOLDOWN_PERIOD = 30 * 60 * 1000; // 30 minutos

function shouldSkipCloudWrites() {
  if (isCloudQuotaExceeded) {
    if (Date.now() - cloudQuotaExceededTime < CLOUD_COOLDOWN_PERIOD) {
      return true;
    } else {
      isCloudQuotaExceeded = false;
    }
  }
  return false;
}

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 32,
  keepAliveMsecs: 15000
});

function requestJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      agent: keepAliveAgent,
      ...options
    };
    const req = https.request(url, requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          if (data) json = JSON.parse(data);
        } catch (err) {}
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(json);
        } else {
          const errMsg = data || res.statusMessage || '';
          if (res.statusCode === 429 || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota exceeded') || errMsg.includes('quota')) {
            if (!isCloudQuotaExceeded) {
              isCloudQuotaExceeded = true;
              cloudQuotaExceededTime = Date.now();
              console.warn(`\n[Collector] [⚠️] LÍMITE DE CUOTA FIRESTORE EXCEDIDO. Pausando escrituras a la nube por 30 minutos para evitar spam de errores.\n`);
            }
          }
          reject(new Error(`HTTP ${res.statusCode}: ${errMsg}`));
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function getAuthToken() {
  if (cachedToken && Date.now() < tokenExpiryTime - 120000) {
    return cachedToken;
  }
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`;
    const res = await requestJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: config.email,
      password: config.password,
      returnSecureToken: true
    });
    cachedToken = res.idToken;
    tokenExpiryTime = Date.now() + Number(res.expiresIn) * 1000;
    return cachedToken;
  } catch (err) {
    console.error('[Auth] Error al iniciar sesión en Firebase Auth:', err.message);
    throw err;
  }
}

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

function stringToUUID(str) {
  if (!str) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) return str;
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

async function fetchCloudDevices() {
  const token = await getAuthToken();
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/devices?pageSize=1000`;
  const res = await requestJson(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const map = {};
  if (res && res.documents) {
    for (const doc of res.documents) {
      const parts = doc.name.split('/');
      const id = parts[parts.length - 1];
      const fields = doc.fields || {};
      const ip = fields.ip && fields.ip.stringValue;
      if (ip) {
        map[ip] = {
          id,
          hostname: fields.hostname?.stringValue || '',
          mac: fields.mac?.stringValue || '',
          status: fields.status?.stringValue || 'offline',
          os: fields.os?.stringValue || '',
          subnet: fields.subnet?.stringValue || 'unknown',
          critical: fields.critical?.booleanValue || false,
          managed: fields.managed?.booleanValue || false,
          ping_ttl: fields.ping_ttl ? Number(fields.ping_ttl.integerValue || fields.ping_ttl.doubleValue || 0) : null,
          boot_count: fields.boot_count ? Number(fields.boot_count.integerValue || fields.boot_count.doubleValue || 0) : 0,
          last_reboot: fields.last_reboot?.stringValue || null
        };
      }
    }
  }
  return map;
}

async function pushDeviceToFirestore(deviceId, deviceData, fieldsToUpdate = null) {
  if (shouldSkipCloudWrites()) return;
  const token = await getAuthToken();
  let url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/devices/${deviceId}`;
  
  if (fieldsToUpdate && fieldsToUpdate.length > 0) {
    const queryParams = fieldsToUpdate.map(k => `updateMask.fieldPaths=${k}`).join('&');
    url += `?${queryParams}`;
  }

  const payload = toFirestoreFields(deviceData);
  await requestJson(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }, payload);
}

async function pushEventToFirestore(eventId, eventData) {
  if (shouldSkipCloudWrites()) return;
  const token = await getAuthToken();
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/events/${eventId}`;
  const payload = toFirestoreFields(eventData);
  await requestJson(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }, payload);
}

async function pushAnomalyToFirestore(anomalyId, anomalyData) {
  if (shouldSkipCloudWrites()) return;
  const token = await getAuthToken();
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/device_anomalies/${anomalyId}`;
  const payload = toFirestoreFields(anomalyData);
  await requestJson(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }, payload);
}

// -----------------------------------------------------------------
// 3. UTILIDADES DE RED Y RESOLUCIÓN (PING, RDP, DNS, MAC)
// -----------------------------------------------------------------
function expandCidr(cidr) {
  const [base, maskText] = cidr.split('/');
  const mask = Number(maskText);
  if (mask !== 24) throw new Error(`Solo se incluye expansion /24 en esta version: ${cidr}`);
  const parts = base.split('.').map(Number);
  const hosts = [];
  for (let last = 1; last <= 254; last += 1) {
    hosts.push(`${parts[0]}.${parts[1]}.${parts[2]}.${last}`);
  }
  return hosts;
}

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePingStats(output) {
  const lowercaseOutput = output.toLowerCase();
  const latencies = [...output.matchAll(/(?:time|tiempo)[=<]\s*(\d+(?:\.\d+)?)\s*ms/gi)].map((match) => Number(match[1]));
  
  const winPackets = output.match(/(?:Packets|Paquetes):\s*(?:Sent|enviados)\s*=\s*(\d+),\s*(?:Received|recibidos)\s*=\s*(\d+),\s*(?:Lost|perdidos)\s*=\s*(\d+)/i);
  const unixPackets = output.match(/(\d+)\s+packets transmitted,\s+(\d+)\s+(?:packets )?received/i);
  const winAvg = output.match(/(?:Average|Media)\s*=\s*(\d+)\s*ms/i);
  const unixAvg = output.match(/(?:round-trip|rtt).*?=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i);
  
  const sent = winPackets ? Number(winPackets[1]) : unixPackets ? Number(unixPackets[1]) : config.pingAttempts;
  let received = winPackets ? Number(winPackets[2]) : unixPackets ? Number(unixPackets[2]) : latencies.length;
  
  // CORRECCIÓN FALSO POSITIVO EN WINDOWS:
  // Si no hay latencias reales medidas en el output (tiempo=Xms) o si contiene palabras de error,
  // el host de destino está offline (ignorar respuesta ICMP del router/gateway intermedio).
  const isUnreachable = lowercaseOutput.includes('inaccesible') || 
                        lowercaseOutput.includes('unreachable') || 
                        lowercaseOutput.includes('agotado') || 
                        lowercaseOutput.includes('timed out') ||
                        latencies.length === 0;

  if (isUnreachable) {
    received = 0;
  }

  const packetLossPct = sent > 0 ? Math.round(((sent - received) / sent) * 100) : 100;
  const avgLatencyMs = received > 0 ? (winAvg ? Number(winAvg[1]) : unixAvg ? Math.round(Number(unixAvg[2])) : average(latencies)) : null;
  
  return {
    sent,
    received,
    packetLossPct,
    minLatencyMs: latencies.length ? Math.round(Math.min(...latencies)) : null,
    avgLatencyMs
  };
}

async function pingHost(ip) {
  const latencies = [];
  let received = 0;
  let capturedTtl = null;
  for (let attempt = 1; attempt <= config.pingAttempts; attempt += 1) {
    const args = process.platform === 'win32'
      ? ['-n', '1', '-w', String(config.pingTimeoutMs), ip]
      : ['-c', '1', '-W', String(Math.ceil(config.pingTimeoutMs / 1000)), ip];
    const started = Date.now();
    try {
      const { stdout } = await execFileAsync('ping', args, { timeout: config.pingTimeoutMs + 1200 });
      const stats = parsePingStats(stdout);
      if (stats.received > 0) {
        received += 1;
        latencies.push(stats.avgLatencyMs || stats.minLatencyMs || Date.now() - started);
        if (capturedTtl === null && stdout) {
          const match = stdout.match(/[Tt][Tt][Ll]=([0-9]+)/);
          if (match) capturedTtl = parseInt(match[1], 10);
        }
      }
    } catch (err) {}
    if (attempt < config.pingAttempts) {
      await delay(120);
    }
  }
  const packetLossPct = Math.round(((config.pingAttempts - received) / config.pingAttempts) * 100);
  return {
    online: received > 0,
    latencyMs: average(latencies),
    sent: config.pingAttempts,
    received,
    packetLossPct,
    ttl: capturedTtl
  };
}

function checkPort(ip, port, timeout = config.rdpTimeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (open) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, ip);
  });
}

function getRdpHostname(targetIp) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);

    socket.once('connect', () => {
      const req = Buffer.from([
        0x03, 0x00, 0x00, 0x13, // TPKT
        0x0e, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, // X.224 Connection Request
        0x01, 0x00, 0x08, 0x00, // NegReq
        0x01, 0x00, 0x00, 0x00  // PROTOCOL_SSL only (0x01)
      ]);
      socket.write(req);
    });

    socket.once('data', (data) => {
      if (data.length >= 19 && data[15] === 0x01) {
        try {
          const secureSocket = tls.connect({
            socket: socket,
            rejectUnauthorized: false,
            servername: targetIp,
            minVersion: 'TLSv1',
            ciphers: 'DEFAULT@SECLEVEL=0'
          }, () => {
            const cert = secureSocket.getPeerCertificate();
            if (secureSocket.destroyed) return;
            if (cert && cert.subject && cert.subject.CN) {
              const cn = cert.subject.CN.split('.')[0].trim();
              resolve(cn);
            } else {
              resolve(null);
            }
            secureSocket.destroy();
          });

          secureSocket.on('error', () => {
            resolve(null);
            socket.destroy();
          });
        } catch {
          resolve(null);
          socket.destroy();
        }
      } else {
        resolve(null);
        socket.destroy();
      }
    });

    socket.on('timeout', () => { resolve(null); socket.destroy(); });
    socket.on('error', () => { resolve(null); socket.destroy(); });

    socket.connect(3389, targetIp);
  });
}

async function resolveHostname(ip) {
  // 1. DNS reverse
  try {
    const names = await dns.reverse(ip);
    if (names && names[0]) {
      return names[0].split('.')[0].trim();
    }
  } catch {}

  // 2. RDP TLS Cert CN (muy fiable en equipos windows con RDP)
  try {
    const rdpName = await getRdpHostname(ip);
    if (rdpName) return rdpName;
  } catch {}

  // 3. NetBIOS Node Status (Windows UDP 137)
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 2500 });
      const lines = stdout.split(/\r?\n/);
      for (let line of lines) {
        line = line.trim();
        const match = line.match(/^([A-Za-z0-9\-]+)\s+<[0-9A-Fa-f]{2}>\s+UNIQUE/i);
        if (match) {
          const possibleName = match[1].trim();
          if (possibleName && possibleName !== 'IS~' && !possibleName.startsWith('__MSBROWSE__')) {
            return possibleName;
          }
        }
      }
    } catch {}
  }

  // 4. Ping -a
  try {
    const cmd = process.platform === 'win32' ? `ping -a -n 1 -w 1000 ${ip}` : `ping -c 1 -W 1 ${ip}`;
    const { stdout } = await execAsync(cmd, { timeout: 3000 });
    const regex = process.platform === 'win32'
      ? /(?:Pinging|Haciendo ping a)\s+([A-Za-z0-9\-\.]+)\s+\[/i
      : /from\s+([A-Za-z0-9\-\.]+)\s+\(/i;
    const match = stdout.match(regex);
    if (match && match[1]) {
      return match[1].split('.')[0].trim();
    }
  } catch {}

  return null;
}

async function lookupMac(ip) {
  // 1. ARP Table lookup
  try {
    const cmd = process.platform === 'win32' ? 'arp' : 'ip';
    const args = process.platform === 'win32' ? ['-a', ip] : ['neigh', 'show', ip];
    const { stdout } = await execFileAsync(cmd, args, { timeout: 1000 });
    const match = stdout.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
    if (match?.[0]) {
      return match[0].toUpperCase().replace(/-/g, ':');
    }
  } catch {}

  // 2. NetBIOS fallback
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 2000 });
      const lines = stdout.split(/\r?\n/);
      for (let line of lines) {
        line = line.trim();
        if (line.toLowerCase().includes('mac address') || line.toLowerCase().includes('dirección mac') || line.toLowerCase().includes('direccion mac')) {
          const parts = line.split('=');
          if (parts[1]) {
            const cleanMac = parts[1].trim().replace(/-/g, ':').toUpperCase();
            const match = cleanMac.match(/([0-9A-F]{2}:){5}[0-9A-F]{2}/i);
            if (match?.[0]) return match[0];
          }
        }
      }
    } catch {}
  }

  return null;
}

async function probePorts(ip, ports) {
  const checks = await Promise.all(ports.map(async (port) => [port, await checkPort(ip, port, config.tcpTimeoutMs)]));
  return Object.fromEntries(checks);
}

function scoreEvidence({ ping, openPorts, hostname, mac }) {
  let score = 0;
  if (ping.received >= 2) score += 3;
  else if (ping.received === 1) score += 1;
  for (const port of openPorts) {
    if ([3389, 445, 135].includes(port)) score += 2;
    else score += 1;
  }
  if (mac) score += 2;
  if (hostname) score += 1;
  return score;
}

function buildEvidence({ ping, openPorts, hostname, mac }) {
  const evidence = [];
  if (ping.received > 0) evidence.push(`icmp:${ping.received}/${ping.sent}`);
  if (openPorts.length) evidence.push(`tcp:${openPorts.join('|')}`);
  if (hostname) evidence.push('dns:reverse');
  if (mac) evidence.push('arp:mac');
  return evidence;
}

async function probeWindowsHost(ip) {
  const [ping, ports] = await Promise.all([
    pingHost(ip),
    probePorts(ip, config.windowsProbePorts)
  ]);
  const [hostname, mac] = await Promise.all([
    resolveHostname(ip),
    lookupMac(ip)
  ]);
  const openPorts = Object.entries(ports)
    .filter(([, open]) => open)
    .map(([port]) => Number(port));
  const rdpAvailable = Boolean(ports[3389]);
  const confidence = scoreEvidence({ ping, openPorts, hostname, mac });

  return {
    online: confidence >= config.newDeviceMinConfidence || ping.received >= 2,
    reachable: ping.online || openPorts.length > 0,
    confidence,
    ping,
    latencyMs: ping.latencyMs,
    packetLossPct: ping.packetLossPct,
    ttl: ping.ttl,
    openPorts,
    ports,
    rdpAvailable,
    hostname,
    mac,
    evidence: buildEvidence({ ping, openPorts, hostname, mac })
  };
}

// -----------------------------------------------------------------
// 4. LÓGICA DE ESCANEO DE SUBRED Y ACTUALIZACIÓN EN FIRESTORE
// -----------------------------------------------------------------
let cloudDevicesMap = {};

async function scanHost(ip, subnet) {
  try {
    const previous = cloudDevicesMap[ip];
    const probe = await probeWindowsHost(ip);
    const online = probe.reachable;
    const rdpAvailable = probe.rdpAvailable;
    const hostname = probe.hostname || previous?.hostname;
    const mac = probe.mac || previous?.mac;
    const status = !online ? 'offline' : (probe.latencyMs && probe.latencyMs > config.slowThresholdMs ? 'slow' : 'online');

    const isWindows = probe.openPorts && probe.openPorts.some(port => [3389, 445, 135, 139, 5985, 5986].includes(port));
    const detectedOs = isWindows ? 'Windows' : (previous?.os || '');

    // Descartar si el equipo es nuevo y no tiene suficiente confianza
    if (!previous && probe.confidence < config.newDeviceMinConfidence) {
      return;
    }

    // ============================================================
    // Detección de anomalías (solo si hay registro previo)
    // ============================================================
    let rapidCycle = null;
    let rebootSignals = [];
    let wasRebooted = false;

    if (previous) {
      // 1. Ciclos rápidos (online/offline en poco tiempo)
      if (previous.last_seen && previous.status) {
        const secondsSinceLastSeen = (Date.now() - new Date(previous.last_seen).getTime()) / 1000;
        if (previous.status === 'online' && !probe.reachable && secondsSinceLastSeen < 30) {
          rapidCycle = {
            type: 'rapid_offline',
            durationSeconds: Math.round(secondsSinceLastSeen),
            severity: secondsSinceLastSeen < 5 ? 'critical' : 'warning',
            message: `Se apagó después de ${Math.round(secondsSinceLastSeen)}s`
          };
        } else if (previous.status === 'offline' && probe.reachable && secondsSinceLastSeen < 60) {
          rapidCycle = {
            type: 'rapid_reboot',
            durationSeconds: Math.round(secondsSinceLastSeen),
            severity: 'info',
            message: `Se encendió después de ${Math.round(secondsSinceLastSeen)}s`
          };
          wasRebooted = true;
        }
      }

      // 2. Señales de reinicio por cambio de TTL o Hostname
      if (config.detectRebootsViaTTL) {
        if (previous.ping_ttl && probe.ttl && previous.ping_ttl !== probe.ttl) {
          rebootSignals.push({
            type: 'ttl_change',
            previous: previous.ping_ttl,
            current: probe.ttl,
            severity: 'warning',
            message: `Cambio en TTL de ping: ${previous.ping_ttl} -> ${probe.ttl}`
          });
          wasRebooted = true;
        }
        if (previous.hostname && probe.hostname && previous.hostname !== probe.hostname) {
          rebootSignals.push({
            type: 'hostname_change',
            previous: previous.hostname,
            current: probe.hostname,
            severity: 'warning',
            message: `Cambio en hostname: ${previous.hostname} -> ${probe.hostname}`
          });
          wasRebooted = true;
        }
      }
    }

    // Calcular uptime estimado
    let estimatedUptimeSeconds = null;
    if (previous?.last_reboot) {
      estimatedUptimeSeconds = Math.floor((Date.now() - new Date(previous.last_reboot).getTime()) / 1000);
      if (wasRebooted) estimatedUptimeSeconds = 0;
    }

    if (!previous) {
      // 1. CREAR EQUIPO NUEVO EN FIRESTORE
      const newId = stringToUUID(`device_${ip}`);
      console.log(`[Collector] [+] Nuevo equipo detectado en ${ip}. Registrando con ID: ${newId}`);
      
      const newDevice = {
        hostname: hostname || '',
        ip: ip,
        mac: mac || '',
        os: detectedOs,
        status: status,
        rdp_available: rdpAvailable,
        latency_ms: probe.latencyMs || null,
        subnet: subnet,
        city: '',
        branch: '',
        department: '',
        responsible_user: '',
        phone: '',
        email: '',
        notes: '',
        brand: '',
        model: '',
        serial_number: '',
        critical: false,
        managed: false,
        employee_id: null,
        cpu: '',
        ram: '',
        storage: '',
        gpu: '',
        motherboard: '',
        image_url: '',
        device_type: 'PC',
        location: 'Matta',
        last_seen: new Date().toISOString(),
        office: '',
        antivirus: '',
        switch_id: null,
        switch_port: null,
        // Nuevos campos
        ping_ttl: probe.ttl || null,
        boot_count: 0,
        last_reboot: new Date().toISOString(),
        estimated_uptime_seconds: 0
      };

      await pushDeviceToFirestore(newId, newDevice);
      cloudDevicesMap[ip] = {
        id: newId,
        hostname,
        mac,
        status,
        os: detectedOs,
        subnet,
        ping_ttl: probe.ttl || null,
        boot_count: 0,
        last_reboot: newDevice.last_reboot,
        critical: false,
        managed: false,
        last_seen: newDevice.last_seen
      };
      
      // Registrar evento de equipo nuevo
      const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const eventData = {
        device_id: newId,
        type: 'device.new',
        severity: 'info',
        message: `Nuevo equipo detectado en ${ip}`,
        metadata: {
          ip,
          subnet,
          confidence: probe.confidence,
          evidence: probe.evidence,
          openPorts: probe.openPorts,
          packetLossPct: probe.packetLossPct
        },
        created_at: new Date().toISOString()
      };
      await pushEventToFirestore(eventId, eventData);
    } else {
      // 2. ACTUALIZAR EQUIPO EXISTENTE EN FIRESTORE
      const now = Date.now();
      const lastSeenTime = previous.last_seen ? new Date(previous.last_seen).getTime() : 0;
      const needsHeartbeat = (now - lastSeenTime) > 4 * 60 * 60 * 1000; // Solo escribir latido/last_seen a la nube cada 4 horas

      const diff = 
        previous.status !== status ||
        previous.hostname !== (hostname || '') ||
        previous.mac !== (mac || '') ||
        previous.os !== detectedOs ||
        previous.ping_ttl !== probe.ttl ||
        wasRebooted;

      if (diff || needsHeartbeat) {
        const updatePayload = {
          status: status,
          latency_ms: probe.latencyMs || null,
          rdp_available: rdpAvailable,
          ping_ttl: probe.ttl || previous.ping_ttl || null,
          estimated_uptime_seconds: estimatedUptimeSeconds
        };

        const fieldsToUpdate = ['status', 'latency_ms', 'rdp_available', 'ping_ttl', 'estimated_uptime_seconds'];

        if (online) {
          const nowStr = new Date().toISOString();
          updatePayload.last_seen = nowStr;
          fieldsToUpdate.push('last_seen');
          previous.last_seen = nowStr;
        }
        if (hostname && hostname !== previous.hostname) {
          updatePayload.hostname = hostname;
          fieldsToUpdate.push('hostname');
        }
        if (mac && mac !== previous.mac) {
          updatePayload.mac = mac;
          fieldsToUpdate.push('mac');
        }
        if (detectedOs && detectedOs !== previous.os) {
          updatePayload.os = detectedOs;
          fieldsToUpdate.push('os');
        }
        if (wasRebooted) {
          const nowStr = new Date().toISOString();
          updatePayload.last_reboot = nowStr;
          updatePayload.boot_count = (previous.boot_count || 0) + 1;
          fieldsToUpdate.push('last_reboot', 'boot_count');

          // Actualizar caché local
          previous.last_reboot = nowStr;
          previous.boot_count = updatePayload.boot_count;
        }

        await pushDeviceToFirestore(previous.id, updatePayload, fieldsToUpdate);
        
        // Actualizar caché local
        previous.status = status;
        previous.hostname = hostname || previous.hostname;
        previous.mac = mac || previous.mac;
        previous.os = detectedOs;
        previous.ping_ttl = probe.ttl || previous.ping_ttl;

        console.log(`[Collector] [*] IP ${ip}: Estado=${status} Latencia=${probe.latencyMs || 0}ms Hostname=${hostname || '—'}`);
      }

      // ============================================================
      // Subir Anomalías detectadas a Firestore
      // ============================================================
      if (rapidCycle) {
        const anomalyId = `anom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await pushAnomalyToFirestore(anomalyId, {
          device_id: previous.id,
          hostname: hostname || previous.hostname || ip,
          ip,
          type: rapidCycle.type,
          severity: rapidCycle.severity,
          duration_seconds: rapidCycle.durationSeconds,
          message: rapidCycle.message,
          detected_at: new Date().toISOString(),
          resolved_at: null
        });
        console.log(`[Collector] [⚡ ANOMALÍA] ${rapidCycle.type.toUpperCase()}: ${ip} (${hostname || '—'})`);
      }

      for (const signal of rebootSignals) {
        const anomalyId = `anom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await pushAnomalyToFirestore(anomalyId, {
          device_id: previous.id,
          hostname: hostname || previous.hostname || ip,
          ip,
          type: 'reboot_signal',
          severity: signal.severity,
          message: signal.message,
          detected_at: new Date().toISOString(),
          resolved_at: null
        });
        console.log(`[Collector] [⚡ REINICIO] ${signal.message} detectado en ${ip}`);
      }
    }
  } catch (err) {
    console.error(`[Collector] [x] Error al procesar IP ${ip}:`, err.message);
  }
}

async function scanSubnet(subnet) {
  console.log(`[Collector] Escaneando subred ${subnet}...`);
  const hosts = expandCidr(subnet);
  const concurrency = config.scanConcurrency;
  let index = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (index < hosts.length) {
      const ip = hosts[index];
      index += 1;
      await scanHost(ip, subnet);
    }
  });

  await Promise.all(workers);
  console.log(`[Collector] Subred ${subnet} completada.`);
}

async function runScanCycle() {
  const start = Date.now();
  console.log('\n=================================================================');
  console.log(`[${new Date().toLocaleString()}] CICLO DE ESCANEO INICIADO`);
  console.log('=================================================================');
  
  try {
    // 1. Refrescar el caché de dispositivos en Firestore antes de escanear
    console.log('[Collector] Descargando inventario actual de Firestore...');
    try {
      cloudDevicesMap = await fetchCloudDevices();
      console.log(`[Collector] Cargados ${Object.keys(cloudDevicesMap).length} equipos desde la nube.`);
    } catch (fetchErr) {
      console.warn(`[Collector] [⚠️] No se pudo descargar el inventario de Firestore (${fetchErr.message}).`);
      if (Object.keys(cloudDevicesMap).length === 0) {
        console.warn('[Collector] [⚠️] El caché local de equipos está vacío. Abortando ciclo para evitar registrar duplicados.');
        return;
      }
      console.log(`[Collector] Usando el caché local actual (${Object.keys(cloudDevicesMap).length} equipos).`);
    }

    // 2. Ejecutar escaneo para cada subred configurada
    for (const subnet of config.subnets) {
      await scanSubnet(subnet);
    }

    const duration = Math.round((Date.now() - start) / 1000);
    console.log(`[Collector] Ciclo terminado con éxito en ${duration} segundos.`);
  } catch (err) {
    console.error('[Collector] [x] Fallo en el ciclo de escaneo:', err.message);
  }
}

let generalScanRunning = false;
let criticalScanRunning = false;

async function runCriticalScanCycle() {
  const criticalDevices = Object.values(cloudDevicesMap).filter(d => (d.critical || d.managed) && d.status === 'online');
  if (criticalDevices.length === 0) return;

  console.log(`\n⚡ [Collector] [CRITICAL SCAN] Escaneando ${criticalDevices.length} dispositivos críticos...`);
  for (const device of criticalDevices) {
    const ip = Object.keys(cloudDevicesMap).find(k => cloudDevicesMap[k].id === device.id);
    if (ip) {
      await scanHost(ip, device.subnet);
    }
  }
  console.log(`[Collector] [CRITICAL SCAN] Completado.`);
}

// -----------------------------------------------------------------
// 5. INICIO DE EJECUCIÓN CONTINUA
// -----------------------------------------------------------------
async function start() {
  console.log('[Collector] Iniciando colector autónomo...');
  try {
    // Verificar autenticación inicial
    await getAuthToken();
    
    // Ejecutar escaneo inicial completo
    generalScanRunning = true;
    try {
      await runScanCycle();
    } finally {
      generalScanRunning = false;
    }

    // Programar escaneo adaptativo de equipos críticos cada 10s (por defecto)
    setInterval(async () => {
      if (!criticalScanRunning && !generalScanRunning) {
        criticalScanRunning = true;
        try {
          await runCriticalScanCycle();
        } catch (err) {
          console.error('[Collector] Error en ciclo crítico:', err.message);
        } finally {
          criticalScanRunning = false;
        }
      }
    }, config.criticalScanIntervalSeconds * 1000);

    // Programar escaneo general periódico
    setInterval(async () => {
      if (!generalScanRunning) {
        generalScanRunning = true;
        try {
          await runScanCycle();
        } catch (err) {
          console.error('[Collector] Error en ciclo general:', err.message);
        } finally {
          generalScanRunning = false;
        }
      }
    }, config.scanIntervalSeconds * 1000);

  } catch (err) {
    console.error('[Collector] [x] Error crítico al iniciar. Deteniendo ejecución:', err.message);
    process.exit(1);
  }
}

start();
