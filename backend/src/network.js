import dns from 'node:dns/promises';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const execFileAsync = promisify(execFile);

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
    packetLossPct
  };
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

export async function resolveHostname(ip) {
  try {
    const names = await dns.reverse(ip);
    return names[0] || null;
  } catch {
    return null;
  }
}

export async function lookupMac(ip) {
  try {
    const { stdout } = await execFileAsync(process.platform === 'win32' ? 'arp' : 'ip', process.platform === 'win32' ? ['-a', ip] : ['neigh', 'show', ip], { timeout: 1000 });
    const match = stdout.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
    return match?.[0]?.toUpperCase() || null;
  } catch {
    return null;
  }
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
  const latencies = [...output.matchAll(/time[=<]\s*(\d+(?:\.\d+)?)\s*ms/gi)].map((match) => Number(match[1]));
  const winPackets = output.match(/Packets:\s*Sent\s*=\s*(\d+),\s*Received\s*=\s*(\d+),\s*Lost\s*=\s*(\d+)/i);
  const unixPackets = output.match(/(\d+)\s+packets transmitted,\s+(\d+)\s+(?:packets )?received/i);
  const winAvg = output.match(/Average\s*=\s*(\d+)\s*ms/i);
  const unixAvg = output.match(/(?:round-trip|rtt).*?=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i);
  const sent = winPackets ? Number(winPackets[1]) : unixPackets ? Number(unixPackets[1]) : config.pingAttempts;
  const received = winPackets ? Number(winPackets[2]) : unixPackets ? Number(unixPackets[2]) : latencies.length;
  const packetLossPct = sent > 0 ? Math.round(((sent - received) / sent) * 100) : 100;
  const avgLatencyMs = winAvg ? Number(winAvg[1]) : unixAvg ? Math.round(Number(unixAvg[2])) : average(latencies);
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
  const win = output.match(/time[=<]\s*(\d+)ms/i);
  if (win) return Number(win[1]);
  const unix = output.match(/time=(\d+(?:\.\d+)?)\s*ms/i);
  if (unix) return Math.round(Number(unix[1]));
  return null;
}
