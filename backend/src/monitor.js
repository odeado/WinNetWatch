import { config } from './config.js';
import { query, withTransaction } from './db.js';
import { broadcast } from './wsHub.js';
import { expandCidr, probeWindowsHost } from './network.js';
import { sendAlert } from './notifier.js';
import { pushDeviceToFirebase, pushEventToFirebase, pushAnomalyToFirebase } from './firebaseSync.js';

let running = false;
let criticalRunning = false;

function logScan(message) {
  console.log(message);
  broadcast('scan-log', message);
}

// ============================================================
// Funciones de Detección de Anomalías
// ============================================================

/**
 * Detecta ciclos rápidos de encendido/apagado.
 * Si un equipo pasa de online a offline (o viceversa) en muy poco tiempo,
 * es síntoma de un reinicio rápido que el scanner no capturó en el medio.
 */
function detectRapidCycle(device, probe) {
  if (!device.last_seen || !device.status) return null;

  const secondsSinceLastSeen = (Date.now() - new Date(device.last_seen).getTime()) / 1000;

  // Estaba online pero ahora está offline y hace poco lo vimos
  if (device.status === 'online' && !probe.reachable && secondsSinceLastSeen < 30) {
    return {
      type: 'rapid_offline',
      durationSeconds: Math.round(secondsSinceLastSeen),
      severity: secondsSinceLastSeen < 5 ? 'critical' : 'warning',
      message: `Se apagó después de ${Math.round(secondsSinceLastSeen)}s desde el último scan`
    };
  }

  // Estaba offline y ahora está online en poco tiempo (reinicio rápido)
  if (device.status === 'offline' && probe.reachable && secondsSinceLastSeen < 60) {
    return {
      type: 'rapid_reboot',
      durationSeconds: Math.round(secondsSinceLastSeen),
      severity: 'info',
      message: `Se encendió después de solo ${Math.round(secondsSinceLastSeen)}s offline`
    };
  }

  return null;
}

/**
 * Detecta señales de reinicio comparando TTL y hostname anteriores vs actuales.
 * Un cambio en el TTL o en el hostname es un fuerte indicador de reinicio.
 */
function detectRebootSignals(previous, probe) {
  if (!config.detectRebootsViaTTL) return null;

  const signals = [];

  // Cambio de TTL (reinicio del stack TCP/IP)
  if (previous.ping_ttl && probe.ttl && previous.ping_ttl !== probe.ttl) {
    signals.push({
      type: 'ttl_change',
      previous: previous.ping_ttl,
      current: probe.ttl,
      severity: 'warning'
    });
  }

  // Cambio de hostname (puede indicar reinstalación o reinicio)
  if (previous.hostname && probe.hostname && previous.hostname !== probe.hostname) {
    signals.push({
      type: 'hostname_change',
      previous: previous.hostname,
      current: probe.hostname,
      severity: 'warning'
    });
  }

  // Cambio de MAC (muy raro, puede indicar reemplazo de tarjeta o spoofing)
  if (previous.mac && probe.mac && previous.mac !== probe.mac) {
    signals.push({
      type: 'mac_change',
      previous: previous.mac,
      current: probe.mac,
      severity: 'critical'
    });
  }

  return signals.length > 0 ? signals : null;
}

/**
 * Verifica si un equipo tuvo más de 3 reinicios en la última hora.
 */
async function checkFrequentReboots(deviceId) {
  try {
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const { rows } = await query(
      `SELECT COUNT(*)::int AS reboot_count
       FROM device_anomalies
       WHERE device_id = $1
         AND type = 'rapid_reboot'
         AND detected_at > $2`,
      [deviceId, oneHourAgo]
    );
    const rebootCount = rows[0]?.reboot_count || 0;
    if (rebootCount > 3) {
      return {
        type: 'frequent_reboots',
        rebootCount,
        severity: rebootCount > 5 ? 'critical' : 'warning',
        message: `${rebootCount} reinicios detectados en la última hora`
      };
    }
  } catch { /* No bloquear el scan por este check */ }
  return null;
}

// ============================================================
// Monitor principal
// ============================================================

export function startMonitor() {
  void scanAll();
  setInterval(() => void scanAll(), config.scanIntervalSeconds * 1000);

  // Escaneo crítico más frecuente (cada 10s por defecto)
  setInterval(() => void scanCriticalDevices(), config.criticalScanIntervalSeconds * 1000);
}

export async function scanAll() {
  if (running) return;
  running = true;
  try {
    logScan(`Scan started for ${config.subnets.join(', ')}`);
    for (const subnet of config.subnets) {
      await scanSubnet(subnet);
    }
    const summary = await getSummary();
    logScan(
      `[${new Date().toLocaleTimeString()}] Equipos:${summary.total} Online:${summary.online} Offline:${summary.offline} RDP:${summary.rdp}`
    );
    broadcast('summary', summary);
    logScan('Scan finished');
  } catch (error) {
    logScan(`[ERROR] Scan error: ${error.message || error}`);
  } finally {
    running = false;
  }
}

export async function scanSubnet(subnet) {
  logScan(`Scanning subnet ${subnet}`);
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
  logScan(`Finished subnet ${subnet}`);
}

/**
 * Escanea solo máquinas marcadas como críticas o managed.
 * Se ejecuta más frecuentemente para detectar apagados/encendidos rápidos.
 */
async function scanCriticalDevices() {
  if (criticalRunning || running) return;
  criticalRunning = true;
  try {
    const { rows: criticalDevices } = await query(
      `SELECT ip, subnet FROM devices
       WHERE (critical = true OR managed = true)
       AND status IN ('online', 'slow')
       LIMIT 30`
    );
    if (criticalDevices.length === 0) return;
    logScan(`[CRITICAL SCAN] Escaneando ${criticalDevices.length} dispositivos críticos/managed...`);
    for (const device of criticalDevices) {
      await scanHost(device.ip, device.subnet);
    }
    logScan(`[CRITICAL SCAN] Completado`);
  } catch (error) {
    logScan(`[ERROR] Critical Scan Error: ${error.message || error}`);
  } finally {
    criticalRunning = false;
  }
}

export async function scanHost(ip, subnet) {
  const previous = (await query('SELECT * FROM devices WHERE ip = $1', [ip])).rows[0];
  const probe = await probeWindowsHost(ip);
  const online = probe.reachable;
  const rdpAvailable = probe.rdpAvailable;
  const hostname = probe.hostname || previous?.hostname;
  const mac = probe.mac || previous?.mac;
  const status = !online
    ? 'offline'
    : probe.latencyMs && probe.latencyMs > config.slowThresholdMs
      ? 'slow'
      : 'online';

  // Automatic OS detection
  const isWindows = probe.openPorts && probe.openPorts.some(port => [3389, 445, 135, 139, 5985, 5986].includes(port));
  const detectedOs = isWindows ? 'Windows' : null;

  if (online && probe.latencyMs && probe.latencyMs > 300) {
    console.log(`LATENCIA ALTA ${ip}: ${probe.latencyMs} ms`);
  }

  if (!previous && probe.confidence < config.newDeviceMinConfidence) {
    return;
  }

  // ============================================================
  // Análisis de anomalías (solo si hay registro previo)
  // ============================================================
  let rapidCycle = null;
  let rebootSignals = null;
  let frequentReboots = null;
  let wasRebooted = false;

  if (previous) {
    rapidCycle = detectRapidCycle(previous, probe);
    rebootSignals = detectRebootSignals(previous, probe);
    wasRebooted = !!(rebootSignals && rebootSignals.length > 0);

    // Solo calcular reinicios frecuentes si hubo uno nuevo ahora
    if (rapidCycle?.type === 'rapid_reboot') {
      frequentReboots = await checkFrequentReboots(previous.id);
    }
  }

  // Calcular uptime estimado desde last_reboot
  let estimatedUptimeSeconds = null;
  if (previous?.last_reboot) {
    estimatedUptimeSeconds = Math.floor((Date.now() - new Date(previous.last_reboot).getTime()) / 1000);

    if (online && estimatedUptimeSeconds < config.uptimeAnomalyThresholdSeconds) {
      console.warn(`⚡ UPTIME ANÓMALO: ${ip} (${hostname}) lleva solo ${estimatedUptimeSeconds}s encendido`);
    }
  }

  // ============================================================
  // Transacción: insertar o actualizar dispositivo + anomalías
  // ============================================================
  const result = await withTransaction(async (client) => {
    let device;

    if (!previous) {
      device = (await client.query(
        `INSERT INTO devices(hostname, ip, mac, status, rdp_available, latency_ms, subnet, os, last_seen, ping_ttl, last_reboot, boot_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, now(), 0)
         RETURNING *`,
        [hostname, ip, mac, status, rdpAvailable, probe.latencyMs, subnet, detectedOs, probe.ttl]
      )).rows[0];

      await client.query(
        `INSERT INTO events(device_id, type, severity, message, metadata)
         VALUES ($1, 'device.new', 'info', $2, $3)`,
        [device.id, `Nuevo equipo detectado en ${ip}`, {
          ip, subnet, confidence: probe.confidence,
          evidence: probe.evidence, openPorts: probe.openPorts,
          packetLossPct: probe.packetLossPct
        }]
      );
      return { device, event: 'device.new', anomalies: [] };
    }

    // Auto-limpieza de fantasmas de red (falsos positivos de ping/ARP)
    const isGhost = !online && 
                    (!hostname || hostname === ip) && 
                    (!previous.mac || previous.mac === '') && 
                    !previous.responsible_user && 
                    !previous.department && 
                    !previous.employee_id && 
                    !previous.switch_id;
    
    if (isGhost) {
      await client.query('DELETE FROM devices WHERE id = $1', [previous.id]);
      return { device: null, event: 'device.deleted_ghost', anomalies: [] };
    }

    // Actualizar equipo existente con nuevas columnas de monitoreo
    device = (await client.query(
      `UPDATE devices
       SET hostname               = COALESCE($1, hostname),
           mac                    = COALESCE($2, mac),
           status                 = $3,
           rdp_available          = $4,
           latency_ms             = $5,
           subnet                 = $6,
           os                     = COALESCE(os, $7),
           ping_ttl               = $8,
           estimated_uptime_seconds = $9,
           last_reboot            = CASE WHEN $10 THEN now() ELSE last_reboot END,
           boot_count             = CASE WHEN $10 THEN boot_count + 1 ELSE boot_count END,
           last_seen              = CASE WHEN $11 THEN now() ELSE last_seen END,
           updated_at             = now()
       WHERE id = $12
       RETURNING *`,
      [hostname, mac, status, rdpAvailable, probe.latencyMs, subnet, detectedOs,
       probe.ttl, estimatedUptimeSeconds,
       wasRebooted, online, previous.id]
    )).rows[0];

    // ============================================================
    // Registrar anomalías en device_anomalies
    // ============================================================
    const anomaliesLogged = [];

    if (rapidCycle) {
      await client.query(
        `INSERT INTO device_anomalies(device_id, type, severity, duration_seconds, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [device.id, rapidCycle.type, rapidCycle.severity, rapidCycle.durationSeconds, {
          message: rapidCycle.message,
          previousStatus: previous.status,
          currentStatus: status
        }]
      );
      anomaliesLogged.push(rapidCycle);
    }

    if (rebootSignals) {
      for (const signal of rebootSignals) {
        await client.query(
          `INSERT INTO device_anomalies(device_id, type, severity, metadata)
           VALUES ($1, 'reboot_signal', $2, $3)`,
          [device.id, signal.severity, { signalType: signal.type, details: signal }]
        );
        anomaliesLogged.push({ type: 'reboot_signal', severity: signal.severity, ...signal });
      }
    }

    if (frequentReboots) {
      await client.query(
        `INSERT INTO device_anomalies(device_id, type, severity, metadata)
         VALUES ($1, $2, $3, $4)`,
        [device.id, frequentReboots.type, frequentReboots.severity, {
          rebootCount: frequentReboots.rebootCount,
          message: frequentReboots.message
        }]
      );
      anomaliesLogged.push(frequentReboots);
    }

    // ============================================================
    // Detectar y registrar cambios de estado
    // ============================================================
    let eventType = null;
    if (previous.status !== status) {
      logScan(`🔄 CAMBIO: ${ip} ${previous.status} → ${status}`);
      eventType = status === 'offline' ? 'device.offline' : 'device.online';

      await client.query(
        `INSERT INTO events(device_id, type, severity, message, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          device.id,
          eventType,
          status === 'offline' ? 'critical' : 'info',
          `${device.hostname || ip} cambio de ${previous.status} a ${status}`,
          {
            previousStatus: previous.status, status,
            rapidCycle: rapidCycle?.type || null,
            rebootDetected: wasRebooted,
            evidence: probe.evidence, openPorts: probe.openPorts,
            packetLossPct: probe.packetLossPct
          }
        ]
      );
    }

    return { device, event: eventType, anomalies: anomaliesLogged };
  });

  // ============================================================
  // Sincronizar con Firebase (Optimizado: solo en cambios o cada 4 horas)
  // ============================================================
  if (result.device) {
    const lastSeenTime = previous?.last_seen ? new Date(previous.last_seen).getTime() : 0;
    const now = Date.now();
    const needsHeartbeat = (now - lastSeenTime) > 4 * 60 * 60 * 1000; // 4 horas

    const hasChanged = !previous ||
      previous.status !== result.device.status ||
      previous.hostname !== result.device.hostname ||
      previous.mac !== result.device.mac ||
      previous.os !== result.device.os ||
      previous.rdp_available !== result.device.rdp_available ||
      previous.switch_id !== result.device.switch_id ||
      previous.switch_port !== result.device.switch_port ||
      previous.boot_count !== result.device.boot_count;

    if (hasChanged || needsHeartbeat) {
      // Sincronizar en segundo plano para no demorar la respuesta local ni el socket
      pushDeviceToFirebase(result.device).catch(err => 
        console.error('[FirebaseSync] Falló sincronización con Firebase:', err)
      );
    }
  }

  // Log de anomalías detectadas
  if (result.device && result.anomalies && result.anomalies.length > 0) {
    logScan(`⚡ ANOMALÍAS EN ${ip} (${hostname || 'sin nombre'}):`);
    for (const anomaly of result.anomalies) {
      logScan(`   - ${anomaly.type} [${anomaly.severity}]`);
      if (anomaly.message) logScan(`     ${anomaly.message}`);
      if (anomaly.durationSeconds) logScan(`     Duración: ${anomaly.durationSeconds}s`);
    }

    // Subir cada anomalía a Firestore
    for (const anomaly of result.anomalies) {
      await pushAnomalyToFirebase({
        device_id: result.device.id,
        hostname: result.device.hostname || ip,
        ip,
        ...anomaly,
        detected_at: new Date().toISOString()
      });
    }
  }

  if (result.event === 'device.deleted_ghost') {
    broadcast('device-event', { device: null, event: 'device.deleted_ghost', previousId: previous.id });
  } else if (result.event && result.device) {
    broadcast('device-event', result);
    await sendAlert(result.event, result.device);

    const severity = result.event === 'device.offline' ? 'critical' : 'info';
    await pushEventToFirebase({
      device_id: result.device.id,
      type: result.event,
      severity,
      message: `${result.device.hostname || result.device.ip} está ${result.event === 'device.offline' ? 'OFFLINE' : 'online'}`,
      anomalies: result.anomalies?.map(a => a.type) || [],
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
