CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id UUID REFERENCES roles(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname TEXT,
  ip INET NOT NULL UNIQUE,
  mac TEXT,
  os TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  rdp_available BOOLEAN NOT NULL DEFAULT false,
  latency_ms INTEGER,
  subnet TEXT NOT NULL,
  city TEXT,
  branch TEXT,
  department TEXT,
  responsible_user TEXT,
  job_title TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  acquired_at DATE,
  warranty_until DATE,
  asset_status TEXT DEFAULT 'active',
  critical BOOLEAN NOT NULL DEFAULT false,
  managed BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] NOT NULL DEFAULT '{}',
  last_seen TIMESTAMPTZ,
  uptime_seconds BIGINT,
  switch_id UUID REFERENCES network_infrastructure(id) ON DELETE SET NULL,
  switch_port INTEGER,
  last_reboot TIMESTAMPTZ,
  boot_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  delivered BOOLEAN NOT NULL DEFAULT false,
  delivery_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  username TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  allowed_roles TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rdp_history (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  ip INET NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_to UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subnet_mappings (
  subnet TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);
CREATE INDEX IF NOT EXISTS devices_subnet_idx ON devices(subnet);
CREATE INDEX IF NOT EXISTS events_device_created_idx ON events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log(entity_type, entity_id);

INSERT INTO roles(name, permissions) VALUES
('Super Administrador', '["*"]'),
('Administrador', '["devices:read","devices:write","rdp:connect","alerts:write","users:read","users:write","tickets:write","actions:remote"]'),
('Soporte TI', '["devices:read","devices:write","rdp:connect","tickets:write"]'),
('Supervisor', '["devices:read","events:read","tickets:read"]'),
('Solo Lectura', '["devices:read","events:read"]')
ON CONFLICT (name) DO NOTHING;

INSERT INTO app_users(email, password_hash, full_name, role_id)
SELECT 'admin@local', crypt('Admin123!', gen_salt('bf')), 'Administrador Local', roles.id
FROM roles
WHERE roles.name = 'Super Administrador'
ON CONFLICT (email) DO NOTHING;
