import http from 'node:http';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { router } from './routes.js';
import { attachWebSocket } from './wsHub.js';
import { configureWebPush } from './notifier.js';
import { startMonitor } from './monitor.js';
import { query } from './db.js';
import { initFirebaseSync } from './firebaseSync.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', router);

app.use((error, _req, res, _next) => {
  console.error(error);

  if (res.headersSent) {
    return;
  }

  res.status(error.status || 500).json({
    error: error.message || 'Error interno del servidor'
  });
});

const server = http.createServer(app);
attachWebSocket(server);
configureWebPush();

async function runMigrations() {
  try {
    // 1. Create employees table
    await query(`
      CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT NOT NULL,
        email TEXT UNIQUE,
        department TEXT,
        city TEXT,
        status TEXT DEFAULT 'Presencial',
        vpn_type TEXT DEFAULT 'Ninguno',
        image_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Add extendable columns to employees
    await query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS workplace TEXT DEFAULT 'Presencial',
      ADD COLUMN IF NOT EXISTS vpn_active BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true
    `);

    // 2. Add columns to devices
    await query(`
      ALTER TABLE devices 
      ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS cpu TEXT,
      ADD COLUMN IF NOT EXISTS ram TEXT,
      ADD COLUMN IF NOT EXISTS storage TEXT,
      ADD COLUMN IF NOT EXISTS gpu TEXT,
      ADD COLUMN IF NOT EXISTS motherboard TEXT,
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS device_type TEXT DEFAULT 'PC',
      ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'Matta',
      ADD COLUMN IF NOT EXISTS office TEXT,
      ADD COLUMN IF NOT EXISTS antivirus TEXT
    `);

    // Add job_title and systems columns to app_users/employees
    await query(`
      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS job_title TEXT,
      ADD COLUMN IF NOT EXISTS authorized_systems TEXT
    `);

    await query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS job_title TEXT,
      ADD COLUMN IF NOT EXISTS authorized_systems TEXT
    `);

    // 3. Update permissions for Administrador role
    await query(`
      UPDATE roles
      SET permissions = permissions || '["users:read", "users:write"]'::jsonb
      WHERE name = 'Administrador' AND NOT (permissions @> '["users:read"]'::jsonb AND permissions @> '["users:write"]'::jsonb)
    `);

    // 4. Create subnet_mappings table
    await query(`
      CREATE TABLE IF NOT EXISTS subnet_mappings (
        subnet TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // 5. Create departments table
    await query(`
      CREATE TABLE IF NOT EXISTS departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // 6. Create cities table
    await query(`
      CREATE TABLE IF NOT EXISTS cities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // 7. Create network_infrastructure table
    await query(`
      CREATE TABLE IF NOT EXISTS network_infrastructure (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        serial_number TEXT,
        ports_count INTEGER,
        location TEXT DEFAULT 'Matta',
        status TEXT DEFAULT 'nuevo',
        acquired_at DATE DEFAULT CURRENT_DATE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Seed default mappings if empty
    const { rows: mappingCount } = await query('SELECT count(*)::int FROM subnet_mappings');
    if (mappingCount[0].count === 0) {
      await query(`
        INSERT INTO subnet_mappings (subnet, label) VALUES
        ('172.30.100.0/24', 'Antofagasta Rendic'),
        ('172.30.101.0/24', 'Antofagasta Matta'),
        ('172.30.102.0/24', 'Antofagasta Diario'),
        ('172.30.110.0/24', 'Arica'),
        ('172.30.112.0/24', 'Iquique')
      `);
    }

    // Seed default departments if empty
    const { rows: deptCount } = await query('SELECT count(*)::int FROM departments');
    if (deptCount[0].count === 0) {
      await query(`
        INSERT INTO departments (name) VALUES
        ('TI'),
        ('Finanzas'),
        ('Operaciones'),
        ('Ventas'),
        ('Recursos Humanos')
      `);
    }

    // Seed default cities if empty
    const { rows: cityCount } = await query('SELECT count(*)::int FROM cities');
    if (cityCount[0].count === 0) {
      await query(`
        INSERT INTO cities (name) VALUES
        ('Antofagasta'),
        ('Arica'),
        ('Iquique'),
        ('Santiago')
      `);
    }

    console.log('Database migrations and roles updated successfully');
  } catch (error) {
    console.error('Failed to run database migrations:', error);
  }
}

async function bootstrap() {
  await runMigrations();

  server.listen(config.port, () => {
    console.log(`Win NetWatch API listening on ${config.port}`);
  });

  startMonitor();
  initFirebaseSync();
}

bootstrap();
