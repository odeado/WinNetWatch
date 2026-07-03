import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export function expandCidr(cidr) {
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

export async function pingHost(ip) {
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
        // Capturar TTL si aun no tenemos uno
        if (capturedTtl === null) {
          capturedTtl = extractTTL(stdout);
        }
      }
    } catch {
      // Keep retrying; many Windows networks drop an occasional ICMP probe.
    }
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

/**
 * Extrae el TTL del output de ping.
 * Windows: "TTL=128" | Linux/Mac: "ttl=64"
 */
function extractTTL(stdout) {
  if (!stdout) return null;
  const match = stdout.match(/[Tt][Tt][Ll]=([0-9]+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function checkPort(ip, port = 3389, timeout = config.rdpTimeoutMs) {
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

export function getRdpHostname(targetIp) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isDone = false;
    
    const done = (val) => {
      if (isDone) return;
      isDone = true;
      socket.destroy();
      resolve(val);
    };

    // Timeout duro de 3 segundos para prevenir bloqueos de TLS handshake
    const hardTimeout = setTimeout(() => {
      done(null);
    }, 3000);

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
            if (secureSocket.destroyed || isDone) return;
            if (cert && cert.subject && cert.subject.CN) {
              const cn = cert.subject.CN.split('.')[0].trim();
              clearTimeout(hardTimeout);
              done(cn);
            } else {
              clearTimeout(hardTimeout);
              done(null);
            }
            secureSocket.destroy();
          });

          secureSocket.on('error', () => {
            clearTimeout(hardTimeout);
            done(null);
          });
        } catch {
          clearTimeout(hardTimeout);
          done(null);
        }
      } else {
        clearTimeout(hardTimeout);
        done(null);
      }
    });

    socket.on('timeout', () => { clearTimeout(hardTimeout); done(null); });
    socket.on('error', () => { clearTimeout(hardTimeout); done(null); });

    socket.connect(3389, targetIp);
  });
}

export async function resolveHostname(ip) {
  // 1. Try DNS reverse first with 2 seconds timeout to prevent hanging on misconfigured DNS/VPN
  try {
    const dnsPromise = dns.reverse(ip);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
    const names = await Promise.race([dnsPromise, timeoutPromise]);
    if (names && names[0]) {
      return names[0].split('.')[0].trim();
    }
  } catch {}

  // 2. Try RDP TLS Handshake Certificate CN extraction (Very reliable for RDP-enabled hosts over VPN)
  try {
    const rdpName = await getRdpHostname(ip);
    if (rdpName) return rdpName;
  } catch {}

  // 3. Try NetBIOS node status query (Windows host status on UDP port 137)
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 2500 });
      const lines = stdout.split('\n');
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

  // 4. Try ping -a reverse name lookup (native Windows DNS/LLMNR resolver helper)
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

export async function lookupMac(ip) {
  // 1. Try standard system ARP table lookup first
  try {
    const { stdout } = await execFileAsync(process.platform === 'win32' ? 'arp' : 'ip', process.platform === 'win32' ? ['-a', ip] : ['neigh', 'show', ip], { timeout: 1000 });
    const match = stdout.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
    if (match?.[0]) {
      return match[0].toUpperCase().replace(/-/g, ':');
    }
  } catch {}

  // 2. Fallback to NetBIOS status table if platform is Windows (nbtstat output prints the target MAC)
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 2000 });
      const lines = stdout.split('\n');
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

export async function probeWindowsHost(ip) {



  const [ping, ports] = await Promise.all([
    pingHost(ip),
    probePorts(ip, config.windowsProbePorts)
  ]);

if (ip === '172.30.100.35') {
  console.log('PUERTOS DETECTADOS:', ports);
}

  const [hostname, mac] = await Promise.all([
    resolveHostname(ip),
    lookupMac(ip)
  ]);
  const openPorts = Object.entries(ports)
    .filter(([, open]) => open)
    .map(([port]) => Number(port));
  const rdpAvailable = Boolean(ports[3389]);
  const confidence = scoreEvidence({ ping, openPorts, hostname, mac });

  console.log(
  ip,
  'ping.received=',
  ping.received,
  'ping.online=',
  ping.online,
  'openPorts=',
  openPorts,
  'confidence=',
  confidence
);

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

export async function probePorts(ip, ports) {
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

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseLatency(output) {
  const win = output.match(/(?:time|tiempo)[=<]\s*(\d+)ms/i);
  if (win) return Number(win[1]);
  const unix = output.match(/(?:time|tiempo)=(\d+(?:\.\d+)?)\s*ms/i);
  if (unix) return Math.round(Number(unix[1]));
  return null;
}
