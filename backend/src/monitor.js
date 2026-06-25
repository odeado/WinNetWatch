import { config } from './config.js';
import { query, withTransaction } from './db.js';
import { broadcast } from './wsHub.js';
import { expandCidr, probeWindowsHost } from './network.js';
import { sendAlert } from './notifier.js';
import { pushDeviceToFirebase, pushEventToFirebase } from './firebaseSync.js';

let running = false;

export function startMonitor() {
  void scanAll();
  setInterval(() => void scanAll(), config.scanIntervalSeconds * 1000);
}

export async function scanAll() {
  if (running) return;

  running = true;

  try {
    console.log(`Scan started for ${config.subnets.join(', ')}`);

    for (const subnet of config.subnets) {
      await scanSubnet(subnet);
    }

    const summary = await getSummary();

    console.log(
  `[${new Date().toLocaleTimeString()}] Equipos:${summary.total} Online:${summary.online} Offline:${summary.offline} RDP:${summary.rdp}`
);

    broadcast('summary', summary);

    console.log('Scan finished');
  } catch (error) {
    console.error('Scan error', error);
  } finally {
    running = false;
  }
}

export async function scanSubnet(subnet) {
  console.log(`Scanning subnet ${subnet}`);
  const hosts = expandCidr(subnet);
  const concurrency = config.scanConcurrency;
  let hostIndex = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (hostIndex < hosts.length) {
      const currentIndex = hostIndex++;
      if (currentIndex >= hosts.length) break;
      await scanHost(hosts[currentIndex], subnet);
    }
  });
  await Promise.all(workers);
  console.log(`Finished subnet ${subnet}`);
}



export async function scanHost(ip, subnet) {

 


  const previous = (await query('SELECT * FROM devices WHERE ip = $1', [ip])).rows[0];
  const probe = await probeWindowsHost(ip);
  const online = probe.reachable;
  const rdpAvailable = probe.rdpAvailable;
  const hostname = probe.hostname || previous?.hostname;
  const mac = probe.mac || previous?.mac;
  const status = !online ? 'offline' : probe.latencyMs && probe.latencyMs > config.slowThresholdMs ? 'slow' : 'online';

  // Automatic OS detection based on open Windows ports (3389, 445, 135, 139, 5985, 5986)
  const isWindows = probe.openPorts && probe.openPorts.some(port => [3389, 445, 135, 139, 5985, 5986].includes(port));
  const detectedOs = isWindows ? 'Windows' : null;

  if (
    online &&
    probe.latencyMs &&
    probe.latencyMs > 300
  ) {
    console.log(
      `LATENCIA ALTA ${ip}: ${probe.latencyMs} ms`
    );
  }

  if (
    previous &&
    previous.status === 'online' &&
    status === 'offline'
  ) {
    console.log(
      `POSIBLE CORTE VPN: ${ip}`
    );
  }




  if (!previous && probe.confidence < config.newDeviceMinConfidence) {
    return;
  }

  const result = await withTransaction(async (client) => {
    let device;
    if (!previous) {
      device = (await client.query(
        `INSERT INTO devices(hostname, ip, mac, status, rdp_available, latency_ms, subnet, os, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         RETURNING *`,
        [hostname, ip, mac, status, rdpAvailable, probe.latencyMs, subnet, detectedOs]
      )).rows[0];
      await client.query(
        `INSERT INTO events(device_id, type, severity, message, metadata)
         VALUES ($1, 'device.new', 'info', $2, $3)`,
        [device.id, `Nuevo equipo detectado en ${ip}`, { ip, subnet, confidence: probe.confidence, evidence: probe.evidence, openPorts: probe.openPorts, packetLossPct: probe.packetLossPct }]
      );
      return { device, event: 'device.new' };
    }

    device = (await client.query(
      `UPDATE devices
       SET hostname = COALESCE($1, hostname),
           mac = COALESCE($2, mac),
           status = $3,
           rdp_available = $4,
           latency_ms = $5,
           subnet = $6,
           os = COALESCE(os, $7),
           last_seen = CASE WHEN $8 THEN now() ELSE last_seen END,
           updated_at = now()
      WHERE id = $9
       RETURNING *`,
      [hostname, mac, status, rdpAvailable, probe.latencyMs, subnet, detectedOs, online, previous.id]
    )).rows[0];

    if (previous.status !== status) {

      await client.query(
        `INSERT INTO events(device_id, type, severity, message, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          device.id,
          status === 'offline' ? 'device.offline' : 'device.online',
          status === 'offline' ? 'critical' : 'info',
          `${device.hostname || ip} cambio de ${previous.status} a ${status}`,
          { previousStatus: previous.status, status, confidence: probe.confidence, evidence: probe.evidence, openPorts: probe.openPorts, packetLossPct: probe.packetLossPct }
        ]
      );
      return { device, event: status === 'offline' ? 'device.offline' : 'device.online' };
    }
    return { device, event: null };
  });

  if (result.device) {
    await pushDeviceToFirebase(result.device);
  }

  if (result.event) {
    broadcast('device-event', result);
    await sendAlert(result.event, result.device);

    const severity = result.event === 'device.offline' ? 'critical' : 'info';
    await pushEventToFirebase({
      device_id: result.device.id,
      type: result.event,
      severity,
      message: `${result.device.hostname || result.device.ip} está ${result.event === 'device.offline' ? 'desconectado' : 'online'}`,
      created_at: new Date().toISOString()
    });
  }
}

export async function getSummary() {
  const { rows } = await query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'online')::int AS online,
      count(*) FILTER (WHERE status = 'offline')::int AS offline,
      count(*) FILTER (WHERE status = 'slow')::int AS slow,
      count(*) FILTER (WHERE rdp_available)::int AS rdp,
      count(*) FILTER (WHERE critical)::int AS critical,
      count(*) FILTER (WHERE managed)::int AS managed
    FROM devices
  `);
  return rows[0];
}
