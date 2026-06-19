import express from 'express';
import bcrypt from 'bcryptjs';
import { login, requireAuth, requirePermission } from './auth.js';
import { encryptSecret } from './crypto.js';
import { query } from './db.js';
import { getSummary, scanAll } from './monitor.js';
import { probeWindowsHost } from './network.js';
// import net from 'net';
import { db } from './firebase.js';
import { doc, deleteDoc } from 'firebase/firestore';
import {
  pushDeviceToFirebase,
  pushEmployeeToFirebase,
  pushSubnetMappingToFirebase,
  pushDepartmentToFirebase,
  pushCityToFirebase,
  pushEventToFirebase,
  pushAlertToFirebase,
  pushInfrastructureToFirebase,
  deleteInfrastructureFromFirebase
} from './firebaseSync.js';

export const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'win-netwatch-api', at: new Date().toISOString() });
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const session = await login(req.body.email, req.body.password);
    if (!session) return res.status(401).json({ error: 'Credenciales invalidas' });
    return res.json(session);
  } catch (error) {
    return next(error);
  }
});

router.use(requireAuth);

router.get('/dashboard/summary', async (_req, res, next) => {
  try {
    const [summary, alerts, events, bySubnet] = await Promise.all([
      getSummary(),
      query(`
SELECT
    a.*,
    d.hostname,
    d.ip,
    d.responsible_user,
    d.department
FROM alerts a
LEFT JOIN devices d
ON d.id = a.device_id
ORDER BY a.created_at DESC
LIMIT 50
`),

query(`
SELECT
    e.*,
    d.hostname,
    d.ip,
    d.responsible_user,
    d.department
FROM events e
LEFT JOIN devices d
ON d.id = e.device_id
ORDER BY e.created_at DESC
LIMIT 12
`),
     
     query(`
    SELECT
      subnet,
      status,
      count(*)::int total
    FROM devices
    GROUP BY subnet, status
    ORDER BY subnet, status
  `)
]);
    res.json({ summary, alerts: alerts.rows, events: events.rows, bySubnet: bySubnet.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/scan/run', requirePermission('devices:write'), async (_req, res) => {
  void scanAll();
  res.status(202).json({ queued: true });
});

router.get('/scan/probe/:ip', requirePermission('devices:read'), async (req, res, next) => {
  try {
    const probe = await probeWindowsHost(req.params.ip);
    res.json({ ip: req.params.ip, ...probe });
  } catch (error) {
    next(error);
  }
});

router.get('/devices', requirePermission('devices:read'), async (req, res, next) => {
  try {
    const { q = '', status = '', subnet = '', tag = '' } = req.query;
    const { rows } = await query(
      `SELECT *
       FROM devices
       WHERE (
  $1 = ''
  OR hostname ILIKE '%' || $1 || '%'
  OR ip::text ILIKE '%' || $1 || '%'
  OR brand ILIKE '%' || $1 || '%'
  OR model ILIKE '%' || $1 || '%'
  OR responsible_user ILIKE '%' || $1 || '%'
  OR city ILIKE '%' || $1 || '%'
  OR serial_number ILIKE '%' || $1 || '%'
  OR department ILIKE '%' || $1 || '%'
)
         AND ($2 = '' OR status = $2)
         AND ($3 = '' OR subnet = $3)
         AND ($4 = '' OR $4 = ANY(tags))
       ORDER BY critical DESC, status, hostname NULLS LAST, ip
       LIMIT 500`,
      [q, status, subnet, tag]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/devices/:id', requirePermission('devices:read'), async (req, res, next) => {
  try {
    const device = (await query('SELECT * FROM devices WHERE id = $1', [req.params.id])).rows[0];
    if (!device) return res.status(404).json({ error: 'Equipo no encontrado' });
    const [events, tickets, rdp] = await Promise.all([
      query('SELECT * FROM events WHERE device_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.id]),
      query('SELECT * FROM tickets WHERE device_id = $1 ORDER BY created_at DESC LIMIT 20', [req.params.id]),
      query('SELECT * FROM rdp_history WHERE device_id = $1 ORDER BY created_at DESC LIMIT 20', [req.params.id])
    ]);
    return res.json({ device, events: events.rows, tickets: tickets.rows, rdpHistory: rdp.rows });
  } catch (error) {
    return next(error);
  }
});

router.patch('/devices/:id', requirePermission('devices:write'), async (req, res, next) => {
  try {
    const before = (await query('SELECT * FROM devices WHERE id = $1', [req.params.id])).rows[0];
    if (!before) return res.status(404).json({ error: 'Equipo no encontrado' });

    // Sync employee details if employee_id is changing
    if (Object.hasOwn(req.body, 'employee_id')) {
      const empId = req.body.employee_id;
      if (!empId || empId === 'null') {
        req.body.employee_id = null;
        req.body.responsible_user = null;
        req.body.email = null;
        req.body.department = null;
        req.body.city = null;
      } else {
        const emp = (await query('SELECT full_name, email, department, city FROM employees WHERE id = $1', [empId])).rows[0];
        if (emp) {
          req.body.responsible_user = emp.full_name;
          req.body.email = emp.email;
          req.body.department = emp.department;
          req.body.city = emp.city;
        }
      }
    }

    const allowed = [
      'hostname', 'os', 'city', 'branch', 'department', 'responsible_user', 'job_title', 'phone', 'email',
      'notes', 'brand', 'model', 'serial_number', 'acquired_at', 'warranty_until', 'asset_status',
      'critical', 'managed', 'tags', 'employee_id', 'cpu', 'ram', 'storage', 'gpu', 'motherboard',
      'image_url', 'device_type', 'location', 'office', 'antivirus', 'authorized_systems'
    ];
    const fields = [];
    const values = [req.params.id];
    let placeholderIndex = 2;

    for (const key of allowed) {
      if (Object.hasOwn(req.body, key)) {
        fields.push(`${key} = $${placeholderIndex}`);
        values.push(req.body[key]);
        placeholderIndex += 1;
      }
    }

    if (fields.length === 0) {
      return res.json(before);
    }

    const sql = `UPDATE devices SET ${fields.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`;
    const { rows } = await query(sql, values);
    const after = rows[0];

    let finalDevice = after;
    if (req.body.employee_id) {
      const employee = (
        await query(
          `SELECT full_name, email, department, city FROM employees WHERE id = $1`,
          [req.body.employee_id]
        )
      ).rows[0];

      if (employee) {
        finalDevice = (
          await query(
            `UPDATE devices
             SET responsible_user = $2, email = $3, department = $4, city = $5
             WHERE id = $1
             RETURNING *`,
            [
              req.params.id,
              employee.full_name,
              employee.email,
              employee.department,
              employee.city
            ]
          )
        ).rows[0];
      }
    }

    if (finalDevice.department && finalDevice.department.trim() !== '') {
      await query('INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [finalDevice.department.trim()]);
      const { rows: deptRows } = await query('SELECT id FROM departments WHERE name = $1', [finalDevice.department.trim()]);
      if (deptRows.length) await pushDepartmentToFirebase({ id: deptRows[0].id, name: finalDevice.department.trim() });
    }
    if (finalDevice.city && finalDevice.city.trim() !== '') {
      await query('INSERT INTO cities (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [finalDevice.city.trim()]);
      const { rows: cityRows } = await query('SELECT id FROM cities WHERE name = $1', [finalDevice.city.trim()]);
      if (cityRows.length) await pushCityToFirebase({ id: cityRows[0].id, name: finalDevice.city.trim() });
    }

    await pushDeviceToFirebase(finalDevice);
    await audit(req.user.sub, 'device.update', 'device', req.params.id, before, finalDevice);
    res.json(finalDevice);
  } catch (error) {
    next(error);
  }
});

router.get('/devices/:id/rdp', requirePermission('rdp:connect'), async (req, res, next) => {
  try {
    const device = (await query('SELECT id, hostname, ip FROM devices WHERE id = $1', [req.params.id])).rows[0];
    if (!device) return res.status(404).json({ error: 'Equipo no encontrado' });
    await query('INSERT INTO rdp_history(device_id, user_id, ip, action) VALUES ($1, $2, $3, $4)', [device.id, req.user.sub, device.ip, 'download']);
    await audit(req.user.sub, 'rdp.download', 'device', device.id, null, { ip: device.ip });
    res.setHeader('content-type', 'application/x-rdp');
    res.setHeader('content-disposition', `attachment; filename="${device.hostname || device.ip}.rdp"`);
    res.send(`full address:s:${device.ip}:3389
prompt for credentials:i:1
authentication level:i:2
enablecredsspsupport:i:1
redirectprinters:i:0
redirectclipboard:i:1
redirectsmartcards:i:0
screen mode id:i:2
use multimon:i:1
`);
  } catch (error) {
    next(error);
  }
});

router.post('/devices/:id/credentials', requirePermission('devices:write'), async (req, res, next) => {
  try {
    const encrypted = encryptSecret(req.body.secret || '');
    const { rows } = await query(
      `INSERT INTO credentials(device_id, label, username, encrypted_secret, allowed_roles)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, device_id, label, username, allowed_roles, created_at`,
      [req.params.id, req.body.label, req.body.username, encrypted, req.body.allowedRoles || []]
    );
    await audit(req.user.sub, 'credential.create', 'device', req.params.id, null, { label: req.body.label, username: req.body.username });
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post('/devices/:id/actions/:action', requirePermission('actions:remote'), async (req, res, next) => {
  try {
    const allowed = ['wake-on-lan', 'restart', 'shutdown', 'powershell'];
    if (!allowed.includes(req.params.action)) return res.status(400).json({ error: 'Accion no soportada' });
    await query(
      `INSERT INTO events(device_id, type, severity, message, metadata)
       VALUES ($1, $2, 'warning', $3, $4)`,
      [req.params.id, `remote.${req.params.action}`, `Accion remota solicitada: ${req.params.action}`, req.body || {}]
    );
    await audit(req.user.sub, `remote.${req.params.action}`, 'device', req.params.id, null, req.body || {});
    res.status(202).json({
      queued: true,
      action: req.params.action,
      note: 'Accion auditada. Configure un runner WinRM seguro para ejecutar comandos reales.'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events', requirePermission('events:read'), async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM events ORDER BY created_at DESC LIMIT 200');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/network-map', requirePermission('devices:read'), async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT subnet, city, branch, status, count(*)::int total
      FROM devices
      GROUP BY subnet, city, branch, status
      ORDER BY subnet, city NULLS LAST, branch NULLS LAST
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/export/devices.csv', requirePermission('devices:read'), async (_req, res, next) => {
  try {
    const { rows } = await query(
  'SELECT hostname, ip, mac, os, status, rdp_available, responsible_user, city, branch, department, brand, model, serial_number FROM devices ORDER BY ip'
);

if (rows.length === 0) {
  return res.status(404).json({
    error: 'No hay equipos para exportar'
  });
}

const header = Object.keys(rows[0]);

    
     
    const csv = [header.join(','), ...rows.map((row) => header.map((key) => csvCell(row[key])).join(','))].join('\n');
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="equipos.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.get('/audit', requirePermission('events:read'), async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// Roles endpoints
router.get('/roles', requirePermission('users:read'), async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name, permissions FROM roles ORDER BY name');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/employees', requirePermission('users:read'), async (_req, res, next) => {
  try {
    const { rows } = await query(`
SELECT e.*,
COALESCE(
(
   SELECT json_agg(
      json_build_object(
         'id', d.id,
         'hostname', d.hostname,
         'ip', d.ip
      )
   )
   FROM devices d
   WHERE d.employee_id = e.id
),
'[]'::json
) AS assigned_devices
FROM employees e
ORDER BY e.full_name
    `);

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// Employees endpoints
router.get('/employees/:id', requirePermission('users:read'), async (req,res,next)=>{
  try{
    const employee = (
      await query(
        'SELECT * FROM employees WHERE id = $1',
        [req.params.id]
      )
    ).rows[0];

    if(!employee){
      return res.status(404).json({
        error:'Empleado no encontrado'
      });
    }

    const devices = (
      await query(
        `SELECT id, hostname, ip, status
         FROM devices
         WHERE employee_id = $1
         ORDER BY hostname`,
        [req.params.id]
      )
    ).rows;

    res.json({
      employee,
      devices
    });
  }catch(error){
    next(error);
  }
});



router.post('/employees', requirePermission('users:write'), async (req, res, next) => {
  try {
    const fullName = req.body.fullName || req.body.full_name;
    const email = req.body.email;
    const department = req.body.department;
    const city = req.body.city;
    const status = req.body.status || 'Presencial';
    const phone = req.body.phone;
    const workplace = req.body.workplace || 'Presencial';
    const vpnActive = req.body.vpnActive !== undefined ? req.body.vpnActive : (req.body.vpn_active || false);
    const vpnType = req.body.vpnType || req.body.vpn_type || 'Ninguno';
    const imageUrl = req.body.imageUrl || req.body.image_url || '';
    const active = req.body.active !== undefined ? req.body.active : true;

    const jobTitle = req.body.jobTitle || req.body.job_title || '';
    const authorizedSystems = req.body.authorizedSystems || req.body.authorized_systems || '';

    if (!fullName) {
      return res.status(400).json({ error: 'El nombre completo es obligatorio' });
    }
    const { rows } = await query(
      `INSERT INTO employees(full_name, email, department, city, status, phone, workplace, vpn_active, vpn_type, image_url, active, job_title, authorized_systems)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [fullName, email, department, city, status, phone, workplace, vpnActive, vpnType, imageUrl, active, jobTitle, authorizedSystems]
    );
    const employee = rows[0];

    if (employee.department && employee.department.trim() !== '') {
      await query('INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [employee.department.trim()]);
      const { rows: deptRows } = await query('SELECT id FROM departments WHERE name = $1', [employee.department.trim()]);
      if (deptRows.length) await pushDepartmentToFirebase({ id: deptRows[0].id, name: employee.department.trim() });
    }
    if (employee.city && employee.city.trim() !== '') {
      await query('INSERT INTO cities (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [employee.city.trim()]);
      const { rows: cityRows } = await query('SELECT id FROM cities WHERE name = $1', [employee.city.trim()]);
      if (cityRows.length) await pushCityToFirebase({ id: cityRows[0].id, name: employee.city.trim() });
    }
    await pushEmployeeToFirebase(employee);

    await audit(req.user.sub, 'employee.create', 'employee', employee.id, null, employee);
    res.status(201).json(employee);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un empleado con este correo electrónico' });
    }
    next(error);
  }
});

router.patch('/employees/:id', requirePermission('users:write'), async (req, res, next) => {
  try {
    const before = (await query('SELECT * FROM employees WHERE id = $1', [req.params.id])).rows[0];
    if (!before) return res.status(404).json({ error: 'Empleado no encontrado' });

    const allowed = [
      'full_name', 'email', 'department', 'city', 'status', 'phone', 'workplace', 'vpn_active', 'vpn_type', 'image_url', 'active', 'job_title', 'authorized_systems'
    ];
    
    const body = { ...req.body };
    if (body.fullName !== undefined) body.full_name = body.fullName;
    if (body.vpnActive !== undefined) body.vpn_active = body.vpnActive;
    if (body.vpnType !== undefined) body.vpn_type = body.vpnType;
    if (body.imageUrl !== undefined) body.image_url = body.imageUrl;
    if (body.jobTitle !== undefined) body.job_title = body.jobTitle;
    if (body.authorizedSystems !== undefined) body.authorized_systems = body.authorizedSystems;

    const fields = [];
    const values = [req.params.id];
    let placeholderIndex = 2;

    for (const key of allowed) {
      if (Object.hasOwn(body, key)) {
        fields.push(`${key} = $${placeholderIndex}`);
        values.push(body[key]);
        placeholderIndex += 1;
      }
    }

    if (fields.length === 0) {
      return res.json(before);
    }

    const sql = `UPDATE employees SET ${fields.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`;
    const { rows } = await query(sql, values);
    const after = rows[0];

    // Sync linked devices
    const { rows: updatedDevices } = await query(
      `UPDATE devices SET
        responsible_user = $2,
        email = $3,
        department = $4,
        city = $5,
        job_title = $6
       WHERE employee_id = $1
       RETURNING *`,
      [req.params.id, after.full_name, after.email, after.department, after.city, after.job_title]
    );

    for (const dev of updatedDevices) {
      await pushDeviceToFirebase(dev);
    }

    if (after.department && after.department.trim() !== '') {
      await query('INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [after.department.trim()]);
      const { rows: deptRows } = await query('SELECT id FROM departments WHERE name = $1', [after.department.trim()]);
      if (deptRows.length) await pushDepartmentToFirebase({ id: deptRows[0].id, name: after.department.trim() });
    }
    if (after.city && after.city.trim() !== '') {
      await query('INSERT INTO cities (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [after.city.trim()]);
      const { rows: cityRows } = await query('SELECT id FROM cities WHERE name = $1', [after.city.trim()]);
      if (cityRows.length) await pushCityToFirebase({ id: cityRows[0].id, name: after.city.trim() });
    }
    await pushEmployeeToFirebase(after);

    await audit(req.user.sub, 'employee.update', 'employee', req.params.id, before, after);
    res.json(after);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un empleado con este correo electrónico' });
    }
    next(error);
  }
});

router.delete('/employees/:id', requirePermission('users:write'), async (req, res, next) => {
  try {
    const before = (await query('SELECT * FROM employees WHERE id = $1', [req.params.id])).rows[0];
    if (!before) return res.status(404).json({ error: 'Empleado no encontrado' });

    // Clear references in devices
    const { rows: unlinkedDevices } = await query(
      `UPDATE devices SET
        employee_id = NULL,
        responsible_user = NULL,
        email = NULL,
        department = NULL,
        city = NULL,
        phone = NULL
       WHERE employee_id = $1
       RETURNING *`,
      [req.params.id]
    );

    for (const dev of unlinkedDevices) {
      await pushDeviceToFirebase(dev);
    }

    await query('DELETE FROM employees WHERE id = $1', [req.params.id]);
    await deleteDoc(doc(db, 'employees', req.params.id));
    await audit(req.user.sub, 'employee.delete', 'employee', req.params.id, before, null);
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    next(error);
  }
});

// Manual Device Creation and Deletion
router.post('/devices', requirePermission('devices:write'), async (req, res, next) => {
  try {
    const {
      hostname, ip, mac, os, status = 'unknown', city, branch, department,
      responsible_user, job_title, phone, email, notes, brand, model, serial_number,
      asset_status = 'active', critical = false, managed = false, tags = [],
      employee_id, cpu, ram, storage, gpu, motherboard, image_url, device_type = 'PC', location = 'Matta',
      office, antivirus, authorized_systems
    } = req.body;

    if (!ip) {
      return res.status(400).json({ error: 'La dirección IP es obligatoria' });
    }

    // Sync employee details if employee_id is changing
    let finalResponsible = responsible_user;
    let finalEmail = email;
    let finalDept = department;
    let finalCity = city;
    let finalJobTitle = job_title;

    if (employee_id) {
      const emp = (await query('SELECT full_name, email, department, city, job_title FROM employees WHERE id = $1', [employee_id])).rows[0];
      if (emp) {
        finalResponsible = emp.full_name;
        finalEmail = emp.email;
        finalDept = emp.department;
        finalCity = emp.city;
        finalJobTitle = emp.job_title;
      }
    }

    // Calculate subnet
    const ipParts = ip.split('.');
    const subnet = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0/24` : 'unknown';

    const { rows } = await query(
      `INSERT INTO devices(
        hostname, ip, mac, os, status, rdp_available, subnet, city, branch, department,
        responsible_user, job_title, phone, email, notes, brand, model, serial_number,
        asset_status, critical, managed, tags, employee_id, cpu, ram, storage, gpu, motherboard,
        image_url, device_type, location, office, antivirus, authorized_systems
      ) VALUES (
        $1, $2, $3, $4, $5, false, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
        $28, $29, $30, $31, $32, $33
      ) RETURNING *`,
      [
        hostname, ip, mac, os, status, subnet, finalCity, branch, finalDept,
        finalResponsible, finalJobTitle, phone, finalEmail, notes, brand, model, serial_number,
        asset_status, critical, managed, tags, employee_id || null, cpu, ram, storage, gpu, motherboard,
        image_url, device_type, location, office, antivirus, authorized_systems
      ]
    );

    const device = rows[0];

    if (device.department && device.department.trim() !== '') {
      await query('INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [device.department.trim()]);
      const { rows: deptRows } = await query('SELECT id FROM departments WHERE name = $1', [device.department.trim()]);
      if (deptRows.length) await pushDepartmentToFirebase({ id: deptRows[0].id, name: device.department.trim() });
    }
    if (device.city && device.city.trim() !== '') {
      await query('INSERT INTO cities (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [device.city.trim()]);
      const { rows: cityRows } = await query('SELECT id FROM cities WHERE name = $1', [device.city.trim()]);
      if (cityRows.length) await pushCityToFirebase({ id: cityRows[0].id, name: device.city.trim() });
    }
    await pushDeviceToFirebase(device);

    await audit(req.user.sub, 'device.create', 'device', device.id, null, device);
    res.status(201).json(device);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un equipo con esa dirección IP' });
    }
    next(error);
  }
});

router.delete('/devices/:id', requirePermission('devices:write'), async (req, res, next) => {
  try {
    const before = (await query('SELECT * FROM devices WHERE id = $1', [req.params.id])).rows[0];
    if (!before) return res.status(404).json({ error: 'Equipo no encontrado' });

    await query('DELETE FROM devices WHERE id = $1', [req.params.id]);
    await deleteDoc(doc(db, 'devices', req.params.id));
    await audit(req.user.sub, 'device.delete', 'device', req.params.id, before, null);
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    next(error);
  }
});
// Settings Management (Subnets, Departments, Cities)
router.get('/settings/subnets', requirePermission('devices:read'), async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM subnet_mappings ORDER BY subnet');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/settings/subnets', requirePermission('users:write'), async (req, res, next) => {
  try {
    const { subnet, label } = req.body;
    if (!subnet || !label) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: subnet y label' });
    }
    const { rows } = await query(
      `INSERT INTO subnet_mappings (subnet, label) VALUES ($1, $2)
       ON CONFLICT (subnet) DO UPDATE SET label = $2, created_at = now()
       RETURNING *`,
      [subnet, label]
    );
    await pushSubnetMappingToFirebase(rows[0]);
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/settings/subnets/:subnet', requirePermission('users:write'), async (req, res, next) => {
  try {
    const cleanSubnet = decodeURIComponent(req.params.subnet);
    await query('DELETE FROM subnet_mappings WHERE subnet = $1', [cleanSubnet]);
    await deleteDoc(doc(db, 'subnet_mappings', cleanSubnet));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/settings/departments', requirePermission('devices:read'), async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM departments ORDER BY name');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/settings/departments', requirePermission('users:write'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const { rows } = await query(
      `INSERT INTO departments (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [name.trim()]
    );
    await pushDepartmentToFirebase(rows[0]);
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/settings/departments/:id', requirePermission('users:write'), async (req, res, next) => {
  try {
    await query('DELETE FROM departments WHERE id = $1', [req.params.id]);
    await deleteDoc(doc(db, 'departments', req.params.id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/settings/cities', requirePermission('devices:read'), async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM cities ORDER BY name');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/settings/cities', requirePermission('users:write'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const { rows } = await query(
      `INSERT INTO cities (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [name.trim()]
    );
    await pushCityToFirebase(rows[0]);
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/settings/cities/:id', requirePermission('users:write'), async (req, res, next) => {
  try {
    await query('DELETE FROM cities WHERE id = $1', [req.params.id]);
    await deleteDoc(doc(db, 'cities', req.params.id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// =============================================
// User Management Routes
// =============================================

router.get('/settings/roles', requirePermission('users:read'), async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name, permissions FROM roles ORDER BY name');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/settings/users', requirePermission('users:read'), async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT u.id, u.email, u.full_name, u.active, u.created_at,
             r.id AS role_id, r.name AS role_name, r.permissions
      FROM app_users u
      LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/settings/users', requirePermission('users:write'), async (req, res, next) => {
  try {
    const { email, password, full_name, role_id } = req.body;
    if (!email || !password || !full_name || !role_id) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO app_users (email, password_hash, full_name, role_id, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, email, full_name, active, created_at`,
      [email.trim().toLowerCase(), hash, full_name.trim(), role_id]
    );
    await audit(req.user.sub, 'create', 'app_user', rows[0].id, null, JSON.stringify(rows[0]));
    res.json(rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
    }
    next(error);
  }
});

router.patch('/settings/users/:id', requirePermission('users:write'), async (req, res, next) => {
  try {
    const { email, password, full_name, role_id, active } = req.body;
    const before = (await query('SELECT id, email, full_name, role_id, active FROM app_users WHERE id = $1', [req.params.id])).rows[0];
    if (!before) return res.status(404).json({ error: 'Usuario no encontrado' });

    const fields = [];
    const values = [req.params.id];
    let idx = 2;
    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email.trim().toLowerCase()); }
    if (full_name !== undefined) { fields.push(`full_name = $${idx++}`); values.push(full_name.trim()); }
    if (role_id !== undefined) { fields.push(`role_id = $${idx++}`); values.push(role_id); }
    if (active !== undefined) { fields.push(`active = $${idx++}`); values.push(active); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      fields.push(`password_hash = $${idx++}`);
      values.push(hash);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    const { rows } = await query(
      `UPDATE app_users SET ${fields.join(', ')} WHERE id = $1 RETURNING id, email, full_name, role_id, active`,
      values
    );
    await audit(req.user.sub, 'update', 'app_user', req.params.id, JSON.stringify(before), JSON.stringify(rows[0]));
    res.json(rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
    }
    next(error);
  }
});

router.delete('/settings/users/:id', requirePermission('users:write'), async (req, res, next) => {
  try {
    const before = (await query('SELECT id, email, full_name FROM app_users WHERE id = $1', [req.params.id])).rows[0];
    if (!before) return res.status(404).json({ error: 'Usuario no encontrado' });
    await query('DELETE FROM app_users WHERE id = $1', [req.params.id]);
    await audit(req.user.sub, 'delete', 'app_user', req.params.id, JSON.stringify(before), null);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// =============================================
// Infrastructure (Switches/Monitores) Routes
// =============================================
router.get('/infrastructure', requirePermission('devices:read'), async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM network_infrastructure ORDER BY type, brand, model');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/infrastructure', requirePermission('devices:write'), async (req, res, next) => {
  try {
    const { type, brand, model, serial_number, ports_count, location, status, acquired_at, notes } = req.body;
    const { rows } = await query(
      `INSERT INTO network_infrastructure (type, brand, model, serial_number, ports_count, location, status, acquired_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        type || 'Switch',
        brand || '',
        model || '',
        serial_number || '',
        ports_count ? parseInt(ports_count, 10) : null,
        location || 'Matta',
        status || 'nuevo',
        acquired_at || new Date().toISOString().split('T')[0],
        notes || ''
      ]
    );
    const item = rows[0];
    await pushInfrastructureToFirebase(item);
    await audit(req.user.sub, 'infrastructure.create', 'infrastructure', item.id, null, item);
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.patch('/infrastructure/:id', requirePermission('devices:write'), async (req, res, next) => {
  try {
    const before = (await query('SELECT * FROM network_infrastructure WHERE id = $1', [req.params.id])).rows[0];
    if (!before) return res.status(404).json({ error: 'Elemento de infraestructura no encontrado' });

    const allowed = ['type', 'brand', 'model', 'serial_number', 'ports_count', 'location', 'status', 'acquired_at', 'notes'];
    const fields = [];
    const values = [req.params.id];
    let idx = 2;

    for (const key of allowed) {
      if (Object.hasOwn(req.body, key)) {
        fields.push(`${key} = $${idx++}`);
        let val = req.body[key];
        if (key === 'ports_count') {
          val = val ? parseInt(val, 10) : null;
        }
        values.push(val);
      }
    }

    if (fields.length === 0) {
      return res.json(before);
    }

    const sql = `UPDATE network_infrastructure SET ${fields.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`;
    const { rows } = await query(sql, values);
    const after = rows[0];

    await pushInfrastructureToFirebase(after);
    await audit(req.user.sub, 'infrastructure.update', 'infrastructure', req.params.id, before, after);
    res.json(after);
  } catch (error) {
    next(error);
  }
});

router.delete('/infrastructure/:id', requirePermission('devices:write'), async (req, res, next) => {
  try {
    const before = (await query('SELECT * FROM network_infrastructure WHERE id = $1', [req.params.id])).rows[0];
    if (!before) return res.status(404).json({ error: 'Elemento de infraestructura no encontrado' });

    await query('DELETE FROM network_infrastructure WHERE id = $1', [req.params.id]);
    await deleteInfrastructureFromFirebase(req.params.id);
    await audit(req.user.sub, 'infrastructure.delete', 'infrastructure', req.params.id, before, null);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

function csvCell(value) {
  if (value === null || value === undefined) return '';
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function audit(actorId, action, entityType, entityId, before, after) {
  await query(
    `INSERT INTO audit_log(actor_id, action, entity_type, entity_id, before, after)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorId, action, entityType, entityId, before || null, after || null]
  );
}
