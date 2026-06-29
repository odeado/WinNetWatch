export const config = {
  port: Number(process.env.PORT || 8080),
  databaseUrl: process.env.DATABASE_URL || 'postgres://netwatch:netwatch_local_password@localhost:5432/win_netwatch',
  jwtSecret: process.env.JWT_SECRET || 'dev_only_change_me',
  credentialKey: process.env.CREDENTIAL_KEY || 'change_this_32_byte_secret_key_123',
  subnets: (process.env.SCAN_SUBNETS || '172.30.100.0/24,172.30.101.0/24,172.30.102.0/24,172.30.110.0/24,172.30.112.0/24')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  scanIntervalSeconds: Number(process.env.SCAN_INTERVAL_SECONDS || 15),
  criticalScanIntervalSeconds: Number(process.env.CRITICAL_SCAN_INTERVAL_SECONDS || 10),
  uptimeAnomalyThresholdSeconds: Number(process.env.UPTIME_ANOMALY_THRESHOLD_SECONDS || 30),
  detectRebootsViaTTL: (process.env.DETECT_REBOOTS_VIA_TTL || 'true') === 'true',
  pingTimeoutMs: Number(process.env.PING_TIMEOUT_MS || 3000),
  pingAttempts: Number(process.env.PING_ATTEMPTS || 6),
  rdpTimeoutMs: Number(process.env.RDP_TIMEOUT_MS || 700),
  tcpTimeoutMs: Number(process.env.TCP_TIMEOUT_MS || 3000),
  slowThresholdMs: Number(process.env.SLOW_THRESHOLD_MS || 250),
  newDeviceMinConfidence: Number(process.env.NEW_DEVICE_MIN_CONFIDENCE || 2),
  scanConcurrency: Number(process.env.SCAN_CONCURRENCY || 50),
  windowsProbePorts: (process.env.WINDOWS_PROBE_PORTS || '3389,445,135,139,5985,5986')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter(Boolean),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'win-netwatch@local'
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID
  },
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL,
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
  }
};
