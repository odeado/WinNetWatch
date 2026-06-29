-- ============================================================
-- MIGRACIÓN: Detección de Anomalías y Monitoreo Adaptativo
-- WinNetWatch - Scanner Mejorado v2.0
-- ============================================================

-- 1. Agregar columnas nuevas a devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ping_ttl INTEGER;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_reboot TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS estimated_uptime_seconds INTEGER;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS boot_count INTEGER NOT NULL DEFAULT 0;

-- 2. Crear tabla de anomalías
CREATE TABLE IF NOT EXISTS device_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('rapid_offline', 'rapid_reboot', 'frequent_reboots', 'uptime_anomaly', 'reboot_signal')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  duration_seconds INTEGER,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  notes TEXT
);

-- 3. Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_device_anomalies_device_id   ON device_anomalies(device_id);
CREATE INDEX IF NOT EXISTS idx_device_anomalies_type        ON device_anomalies(type);
CREATE INDEX IF NOT EXISTS idx_device_anomalies_severity    ON device_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_device_anomalies_detected_at ON device_anomalies(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_anomalies_unresolved  ON device_anomalies(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_devices_boot_count           ON devices(boot_count DESC);

-- 4. Vista: anomalías activas
CREATE OR REPLACE VIEW active_device_anomalies AS
SELECT
  a.id,
  a.device_id,
  d.hostname,
  d.ip,
  d.status,
  a.type,
  a.severity,
  a.duration_seconds,
  a.detected_at,
  EXTRACT(EPOCH FROM (now() - a.detected_at))::int AS seconds_ago,
  a.metadata
FROM device_anomalies a
JOIN devices d ON d.id = a.device_id
WHERE a.resolved_at IS NULL
ORDER BY a.detected_at DESC;

-- 5. Vista: análisis de reinicios por equipo
CREATE OR REPLACE VIEW device_reboot_analysis AS
SELECT
  d.id,
  d.hostname,
  d.ip,
  d.boot_count,
  d.last_reboot,
  d.estimated_uptime_seconds,
  d.status,
  EXTRACT(EPOCH FROM (now() - d.last_reboot))::int AS seconds_since_last_boot,
  COUNT(a.id) FILTER (WHERE a.type = 'rapid_reboot' AND a.detected_at > now() - INTERVAL '24 hours') AS rapid_reboots_24h
FROM devices d
LEFT JOIN device_anomalies a ON a.device_id = d.id
WHERE d.status IN ('online', 'offline', 'slow')
GROUP BY d.id
ORDER BY d.boot_count DESC;
