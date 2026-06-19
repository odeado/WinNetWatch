import { db } from './firebase.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, updateDoc } from 'firebase/firestore';
import { query } from './db.js';
import { scanAll } from './monitor.js';
import dgram from 'node:dgram';

// WOL helper
function sendWOLPacket(macAddress) {
  try {
    if (!macAddress) return false;
    const cleanMac = macAddress.replace(/[^a-fA-F0-9]/g, '');
    if (cleanMac.length !== 12) return false;
    const buf = Buffer.alloc(102);
    buf.fill(0xff, 0, 6);
    const macBuf = Buffer.from(cleanMac, 'hex');
    for (let i = 0; i < 16; i++) {
      macBuf.copy(buf, 6 + i * 6);
    }
    const socket = dgram.createSocket('udp4');
    socket.once('listening', () => {
      socket.setBroadcast(true);
    });
    socket.send(buf, 0, buf.length, 9, '255.255.255.255', (err) => {
      socket.close();
      if (err) console.error('Error sending WOL:', err);
    });
    return true;
  } catch (e) {
    console.error('Failed to send WOL:', e);
    return false;
  }
}

// ------------------------------------------------------------
// Local database sync helpers (Firestore -> Postgres)
// ------------------------------------------------------------

async function syncEmployeeFromFirestore(fsData) {
  try {
    const { rows } = await query('SELECT * FROM employees WHERE id = $1', [fsData.id]);
    const local = rows[0];
    if (!local) {
      await query(
        `INSERT INTO employees (id, full_name, email, department, city, status, phone, workplace, vpn_active, vpn_type, image_url, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          fsData.id,
          fsData.full_name || '',
          fsData.email || null,
          fsData.department || null,
          fsData.city || null,
          fsData.status || 'Presencial',
          fsData.phone || null,
          fsData.workplace || 'Presencial',
          fsData.vpn_active || false,
          fsData.vpn_type || 'Ninguno',
          fsData.image_url || null,
          fsData.active !== undefined ? fsData.active : true
        ]
      );
      console.log(`[FirebaseSync] Sincronizado empleado nuevo: ${fsData.full_name}`);
    } else {
      const diff =
        local.full_name !== (fsData.full_name || '') ||
        local.email !== (fsData.email || null) ||
        local.department !== (fsData.department || null) ||
        local.city !== (fsData.city || null) ||
        local.status !== (fsData.status || 'Presencial') ||
        local.phone !== (fsData.phone || null) ||
        local.workplace !== (fsData.workplace || 'Presencial') ||
        local.vpn_active !== (fsData.vpn_active || false) ||
        local.vpn_type !== (fsData.vpn_type || 'Ninguno') ||
        local.image_url !== (fsData.image_url || null) ||
        local.active !== (fsData.active !== undefined ? fsData.active : true);

      if (diff) {
        await query(
          `UPDATE employees
           SET full_name = $2, email = $3, department = $4, city = $5, status = $6, phone = $7, workplace = $8, vpn_active = $9, vpn_type = $10, image_url = $11, active = $12, updated_at = now()
           WHERE id = $1`,
          [
            fsData.id,
            fsData.full_name || '',
            fsData.email || null,
            fsData.department || null,
            fsData.city || null,
            fsData.status || 'Presencial',
            fsData.phone || null,
            fsData.workplace || 'Presencial',
            fsData.vpn_active || false,
            fsData.vpn_type || 'Ninguno',
            fsData.image_url || null,
            fsData.active !== undefined ? fsData.active : true
          ]
        );
        console.log(`[FirebaseSync] Empleado actualizado: ${fsData.full_name}`);
      }
    }
  } catch (error) {
    console.error('Error syncing employee from Firestore:', error);
  }
}

async function syncDeviceFromFirestore(fsData) {
  try {
    const { rows } = await query('SELECT * FROM devices WHERE id = $1', [fsData.id]);
    const local = rows[0];
    if (!local) {
      await query(
        `INSERT INTO devices (
          id, hostname, ip, mac, os, status, rdp_available, latency_ms, subnet, city, branch, department,
          responsible_user, phone, email, notes, brand, model, serial_number, critical, managed, employee_id,
          cpu, ram, storage, gpu, motherboard, image_url, device_type, location
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
          $23, $24, $25, $26, $27, $28, $29, $30
        )`,
        [
          fsData.id,
          fsData.hostname || null,
          fsData.ip,
          fsData.mac || null,
          fsData.os || null,
          fsData.status || 'unknown',
          fsData.rdp_available || false,
          fsData.latency_ms || null,
          fsData.subnet || 'unknown',
          fsData.city || null,
          fsData.branch || null,
          fsData.department || null,
          fsData.responsible_user || null,
          fsData.phone || null,
          fsData.email || null,
          fsData.notes || null,
          fsData.brand || null,
          fsData.model || null,
          fsData.serial_number || null,
          fsData.critical || false,
          fsData.managed || false,
          fsData.employee_id || null,
          fsData.cpu || null,
          fsData.ram || null,
          fsData.storage || null,
          fsData.gpu || null,
          fsData.motherboard || null,
          fsData.image_url || null,
          fsData.device_type || 'PC',
          fsData.location || 'Matta'
        ]
      );
      console.log(`[FirebaseSync] Equipo creado desde la nube: ${fsData.hostname || fsData.ip}`);
    } else {
      const diff =
        local.hostname !== (fsData.hostname || null) ||
        local.ip !== fsData.ip ||
        local.mac !== (fsData.mac || null) ||
        local.os !== (fsData.os || null) ||
        local.status !== (fsData.status || 'unknown') ||
        local.rdp_available !== (fsData.rdp_available || false) ||
        local.latency_ms !== (fsData.latency_ms || null) ||
        local.subnet !== (fsData.subnet || 'unknown') ||
        local.city !== (fsData.city || null) ||
        local.branch !== (fsData.branch || null) ||
        local.department !== (fsData.department || null) ||
        local.responsible_user !== (fsData.responsible_user || null) ||
        local.phone !== (fsData.phone || null) ||
        local.email !== (fsData.email || null) ||
        local.notes !== (fsData.notes || null) ||
        local.brand !== (fsData.brand || null) ||
        local.model !== (fsData.model || null) ||
        local.serial_number !== (fsData.serial_number || null) ||
        local.critical !== (fsData.critical || false) ||
        local.managed !== (fsData.managed || false) ||
        local.employee_id !== (fsData.employee_id || null) ||
        local.cpu !== (fsData.cpu || null) ||
        local.ram !== (fsData.ram || null) ||
        local.storage !== (fsData.storage || null) ||
        local.gpu !== (fsData.gpu || null) ||
        local.motherboard !== (fsData.motherboard || null) ||
        local.image_url !== (fsData.image_url || null) ||
        local.device_type !== (fsData.device_type || 'PC') ||
        local.location !== (fsData.location || 'Matta');

      if (diff) {
        await query(
          `UPDATE devices
           SET hostname = $2, ip = $3, mac = $4, os = $5, status = $6, rdp_available = $7, latency_ms = $8,
               subnet = $9, city = $10, branch = $11, department = $12, responsible_user = $13, phone = $14,
               email = $15, notes = $16, brand = $17, model = $18, serial_number = $19, critical = $20,
               managed = $21, employee_id = $22, cpu = $23, ram = $24, storage = $25, gpu = $26,
               motherboard = $27, image_url = $28, device_type = $29, location = $30, updated_at = now()
           WHERE id = $1`,
          [
            fsData.id,
            fsData.hostname || null,
            fsData.ip,
            fsData.mac || null,
            fsData.os || null,
            fsData.status || 'unknown',
            fsData.rdp_available || false,
            fsData.latency_ms || null,
            fsData.subnet || 'unknown',
            fsData.city || null,
            fsData.branch || null,
            fsData.department || null,
            fsData.responsible_user || null,
            fsData.phone || null,
            fsData.email || null,
            fsData.notes || null,
            fsData.brand || null,
            fsData.model || null,
            fsData.serial_number || null,
            fsData.critical || false,
            fsData.managed || false,
            fsData.employee_id || null,
            fsData.cpu || null,
            fsData.ram || null,
            fsData.storage || null,
            fsData.gpu || null,
            fsData.motherboard || null,
            fsData.image_url || null,
            fsData.device_type || 'PC',
            fsData.location || 'Matta'
          ]
        );
        console.log(`[FirebaseSync] Equipo actualizado desde la nube: ${fsData.hostname || fsData.ip}`);
      }
    }
  } catch (error) {
    console.error('Error syncing device from Firestore:', error);
  }
}

async function syncSubnetMappingFromFirestore(fsData) {
  try {
    const { rows } = await query('SELECT * FROM subnet_mappings WHERE subnet = $1', [fsData.subnet]);
    const local = rows[0];
    if (!local) {
      await query('INSERT INTO subnet_mappings (subnet, label) VALUES ($1, $2)', [fsData.subnet, fsData.label]);
    } else if (local.label !== fsData.label) {
      await query('UPDATE subnet_mappings SET label = $2 WHERE subnet = $1', [fsData.subnet, fsData.label]);
    }
  } catch (err) {
    console.error('Error syncing subnet mapping from Firestore:', err);
  }
}

async function syncDepartmentFromFirestore(fsData) {
  try {
    const { rows } = await query('SELECT * FROM departments WHERE id = $1', [fsData.id]);
    const local = rows[0];
    if (!local) {
      await query('INSERT INTO departments (id, name) VALUES ($1, $2)', [fsData.id, fsData.name]);
    } else if (local.name !== fsData.name) {
      await query('UPDATE departments SET name = $2 WHERE id = $1', [fsData.id, fsData.name]);
    }
  } catch (err) {
    console.error('Error syncing department from Firestore:', err);
  }
}

async function syncCityFromFirestore(fsData) {
  try {
    const { rows } = await query('SELECT * FROM cities WHERE id = $1', [fsData.id]);
    const local = rows[0];
    if (!local) {
      await query('INSERT INTO cities (id, name) VALUES ($1, $2)', [fsData.id, fsData.name]);
    } else if (local.name !== fsData.name) {
      await query('UPDATE cities SET name = $2 WHERE id = $1', [fsData.id, fsData.name]);
    }
  } catch (err) {
    console.error('Error syncing city from Firestore:', err);
  }
}

async function syncInfrastructureFromFirestore(fsData) {
  try {
    const { rows } = await query('SELECT * FROM network_infrastructure WHERE id = $1', [fsData.id]);
    const local = rows[0];
    if (!local) {
      await query(
        `INSERT INTO network_infrastructure (id, type, brand, model, serial_number, ports_count, location, status, acquired_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          fsData.id,
          fsData.type,
          fsData.brand || '',
          fsData.model || '',
          fsData.serial_number || '',
          fsData.ports_count || null,
          fsData.location || 'Matta',
          fsData.status || 'nuevo',
          fsData.acquired_at || null,
          fsData.notes || ''
        ]
      );
    } else {
      const diff =
        local.type !== fsData.type ||
        local.brand !== (fsData.brand || '') ||
        local.model !== (fsData.model || '') ||
        local.serial_number !== (fsData.serial_number || '') ||
        local.ports_count !== (fsData.ports_count || null) ||
        local.location !== (fsData.location || 'Matta') ||
        local.status !== (fsData.status || 'nuevo') ||
        local.acquired_at !== (fsData.acquired_at || null) ||
        local.notes !== (fsData.notes || '');

      if (diff) {
        await query(
          `UPDATE network_infrastructure
           SET type = $2, brand = $3, model = $4, serial_number = $5, ports_count = $6,
               location = $7, status = $8, acquired_at = $9, notes = $10, updated_at = now()
           WHERE id = $1`,
          [
            fsData.id,
            fsData.type,
            fsData.brand || '',
            fsData.model || '',
            fsData.serial_number || '',
            fsData.ports_count || null,
            fsData.location || 'Matta',
            fsData.status || 'nuevo',
            fsData.acquired_at || null,
            fsData.notes || ''
          ]
        );
      }
    }
  } catch (err) {
    console.error('Error syncing infrastructure from Firestore:', err);
  }
}

// ------------------------------------------------------------
// Action queue worker (Firestore Actions -> Local Execution)
// ------------------------------------------------------------

async function handleRemoteAction(actionDoc) {
  try {
    const actionRef = doc(db, 'actions', actionDoc.id);
    await updateDoc(actionRef, { status: 'processing', startedAt: new Date().toISOString() });

    console.log(`[FirebaseSync] Procesando acción remota '${actionDoc.action}' para equipo ${actionDoc.device_id || 'general'}`);

    if (actionDoc.action === 'scan') {
      void scanAll();
      await updateDoc(actionRef, { status: 'completed', completedAt: new Date().toISOString() });
      return;
    }

    const { rows } = await query('SELECT * FROM devices WHERE id = $1', [actionDoc.device_id]);
    const device = rows[0];
    if (!device) {
      await updateDoc(actionRef, { status: 'failed', error: 'Equipo no encontrado en la base de datos local', completedAt: new Date().toISOString() });
      return;
    }

    if (actionDoc.action === 'wake-on-lan') {
      if (!device.mac) {
        await updateDoc(actionRef, { status: 'failed', error: 'Dirección MAC no configurada para este equipo', completedAt: new Date().toISOString() });
        return;
      }
      const ok = sendWOLPacket(device.mac);
      if (ok) {
        const msg = `WOL enviado vía acción remota por internet a la MAC ${device.mac}`;
        await query(`INSERT INTO events (device_id, type, severity, message) VALUES ($1, 'remote.wake-on-lan', 'info', $2)`, [device.id, msg]);
        await pushEventToFirebase({
          device_id: device.id,
          type: 'remote.wake-on-lan',
          severity: 'info',
          message: msg,
          created_at: new Date().toISOString()
        });
        await updateDoc(actionRef, { status: 'completed', completedAt: new Date().toISOString() });
      } else {
        await updateDoc(actionRef, { status: 'failed', error: 'Formato de dirección MAC no válido', completedAt: new Date().toISOString() });
      }
    } else if (actionDoc.action === 'restart') {
      const msg = `Reinicio encolado vía acción remota por internet para la IP ${device.ip}`;
      await query(`INSERT INTO events (device_id, type, severity, message) VALUES ($1, 'remote.restart', 'warning', $2)`, [device.id, msg]);
      await pushEventToFirebase({
        device_id: device.id,
        type: 'remote.restart',
        severity: 'warning',
        message: msg,
        created_at: new Date().toISOString()
      });
      await updateDoc(actionRef, { status: 'completed', note: 'Acción encolada para ejecución WinRM/SSH local', completedAt: new Date().toISOString() });
    } else if (actionDoc.action === 'powershell') {
      const msg = `Script PowerShell encolado vía acción remota por internet para la IP ${device.ip}`;
      await query(`INSERT INTO events (device_id, type, severity, message) VALUES ($1, 'remote.powershell', 'warning', $2)`, [device.id, msg]);
      await pushEventToFirebase({
        device_id: device.id,
        type: 'remote.powershell',
        severity: 'warning',
        message: msg,
        created_at: new Date().toISOString()
      });
      await updateDoc(actionRef, { status: 'completed', note: 'Script encolado para ejecución WinRM/SSH local', completedAt: new Date().toISOString() });
    } else {
      await updateDoc(actionRef, { status: 'failed', error: 'Acción no soportada', completedAt: new Date().toISOString() });
    }
  } catch (err) {
    console.error('[FirebaseSync] Error al manejar la acción remota:', err);
    try {
      await updateDoc(doc(db, 'actions', actionDoc.id), { status: 'failed', error: err.message, completedAt: new Date().toISOString() });
    } catch (_) {}
  }
}

// ------------------------------------------------------------
// Cloud database sync helpers (Postgres -> Firestore)
// ------------------------------------------------------------

export async function pushDeviceToFirebase(device) {
  try {
    const docRef = doc(db, 'devices', device.id);
    await setDoc(docRef, {
      hostname: device.hostname || '',
      ip: device.ip,
      mac: device.mac || '',
      os: device.os || '',
      status: device.status || 'unknown',
      rdp_available: device.rdp_available || false,
      latency_ms: device.latency_ms || null,
      subnet: device.subnet || 'unknown',
      city: device.city || '',
      branch: device.branch || '',
      department: device.department || '',
      responsible_user: device.responsible_user || '',
      phone: device.phone || '',
      email: device.email || '',
      notes: device.notes || '',
      brand: device.brand || '',
      model: device.model || '',
      serial_number: device.serial_number || '',
      critical: device.critical || false,
      managed: device.managed || false,
      employee_id: device.employee_id || null,
      cpu: device.cpu || '',
      ram: device.ram || '',
      storage: device.storage || '',
      gpu: device.gpu || '',
      motherboard: device.motherboard || '',
      image_url: device.image_url || '',
      device_type: device.device_type || 'PC',
      location: device.location || 'Matta',
      last_seen: device.last_seen ? new Date(device.last_seen).toISOString() : new Date().toISOString()
    });
  } catch (err) {
    console.error('[FirebaseSync] Error al subir equipo a Firebase:', err);
  }
}

export async function pushEmployeeToFirebase(employee) {
  try {
    const docRef = doc(db, 'employees', employee.id);
    await setDoc(docRef, {
      full_name: employee.full_name,
      email: employee.email || '',
      department: employee.department || '',
      city: employee.city || '',
      status: employee.status || 'Presencial',
      phone: employee.phone || '',
      workplace: employee.workplace || 'Presencial',
      vpn_active: employee.vpn_active || false,
      vpn_type: employee.vpn_type || 'Ninguno',
      image_url: employee.image_url || '',
      active: employee.active !== undefined ? employee.active : true
    });
  } catch (err) {
    console.error('[FirebaseSync] Error al subir empleado a Firebase:', err);
  }
}

export async function pushSubnetMappingToFirebase(mapping) {
  try {
    const docRef = doc(db, 'subnet_mappings', mapping.subnet);
    await setDoc(docRef, {
      label: mapping.label
    });
  } catch (err) {
    console.error('[FirebaseSync] Error al subir mapeo de subred a Firebase:', err);
  }
}

export async function pushDepartmentToFirebase(dept) {
  try {
    const docRef = doc(db, 'departments', dept.id);
    await setDoc(docRef, {
      name: dept.name
    });
  } catch (err) {
    console.error('[FirebaseSync] Error al subir departamento a Firebase:', err);
  }
}

export async function pushCityToFirebase(city) {
  try {
    const docRef = doc(db, 'cities', city.id);
    await setDoc(docRef, {
      name: city.name
    });
  } catch (err) {
    console.error('[FirebaseSync] Error al subir ciudad a Firebase:', err);
  }
}

export async function pushInfrastructureToFirebase(item) {
  try {
    const docRef = doc(db, 'infrastructure', item.id);
    await setDoc(docRef, {
      type: item.type,
      brand: item.brand || '',
      model: item.model || '',
      serial_number: item.serial_number || '',
      ports_count: item.ports_count || null,
      location: item.location || 'Matta',
      status: item.status || 'nuevo',
      acquired_at: item.acquired_at ? new Date(item.acquired_at).toISOString().split('T')[0] : null,
      notes: item.notes || ''
    });
  } catch (err) {
    console.error('[FirebaseSync] Error al subir infraestructura a Firebase:', err);
  }
}

export async function deleteInfrastructureFromFirebase(id) {
  try {
    await deleteDoc(doc(db, 'infrastructure', id));
  } catch (err) {
    console.error('[FirebaseSync] Error al eliminar infraestructura de Firebase:', err);
  }
}

export async function pushEventToFirebase(event) {
  try {
    const id = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const docRef = doc(db, 'events', id);
    await setDoc(docRef, {
      device_id: event.device_id || null,
      type: event.type,
      severity: event.severity || 'info',
      message: event.message,
      metadata: event.metadata || {},
      created_at: event.created_at || new Date().toISOString()
    });
  } catch (err) {
    console.error('[FirebaseSync] Error al subir evento a Firebase:', err);
  }
}

export async function pushAlertToFirebase(alert) {
  try {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const docRef = doc(db, 'alerts', id);
    await setDoc(docRef, {
      device_id: alert.device_id || null,
      type: alert.type,
      channel: alert.channel || 'web',
      title: alert.title,
      message: alert.message,
      created_at: alert.created_at || new Date().toISOString()
    });
  } catch (err) {
    console.error('[FirebaseSync] Error al subir alerta a Firebase:', err);
  }
}

// ------------------------------------------------------------
// Database initial seed to cloud if empty
// ------------------------------------------------------------

async function runInitialSync() {
  try {
    const devicesSnap = await getDocs(collection(db, 'devices'));
    if (devicesSnap.empty) {
      console.log('[FirebaseSync] Firestore está vacío. Sembrando datos desde Postgres local...');

      const { rows: mappings } = await query('SELECT * FROM subnet_mappings');
      for (const m of mappings) await pushSubnetMappingToFirebase(m);

      const { rows: depts } = await query('SELECT * FROM departments');
      for (const d of depts) await pushDepartmentToFirebase(d);

      const { rows: cities } = await query('SELECT * FROM cities');
      for (const c of cities) await pushCityToFirebase(c);

      const { rows: employees } = await query('SELECT * FROM employees');
      for (const e of employees) await pushEmployeeToFirebase(e);

      const { rows: devices } = await query('SELECT * FROM devices');
      for (const dev of devices) await pushDeviceToFirebase(dev);

      const { rows: events } = await query('SELECT * FROM events ORDER BY created_at DESC LIMIT 100');
      for (const ev of events) await pushEventToFirebase(ev);

      const { rows: alerts } = await query('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50');
      for (const al of alerts) await pushAlertToFirebase(al);

      const { rows: infra } = await query('SELECT * FROM network_infrastructure');
      for (const item of infra) await pushInfrastructureToFirebase(item);

      console.log('[FirebaseSync] Sembrado inicial completado con éxito!');
    } else {
      console.log('[FirebaseSync] Firestore ya contiene datos. Sembrado omitido.');
    }
  } catch (err) {
    console.error('[FirebaseSync] Error durante el sembrado inicial:', err);
  }
}

// ------------------------------------------------------------
// Initialization
// ------------------------------------------------------------

export async function initFirebaseSync() {
  console.log('[FirebaseSync] Iniciando servicio de sincronización...');
  
  await runInitialSync();

  onSnapshot(collection(db, 'employees'), (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const data = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'added' || change.type === 'modified') {
        await syncEmployeeFromFirestore(data);
      } else if (change.type === 'removed') {
        await query('DELETE FROM employees WHERE id = $1', [change.doc.id]);
        console.log(`[FirebaseSync] Empleado eliminado localmente por baja remota: ${data.full_name}`);
      }
    });
  });

  onSnapshot(collection(db, 'devices'), (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const data = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'added' || change.type === 'modified') {
        await syncDeviceFromFirestore(data);
      } else if (change.type === 'removed') {
        await query('DELETE FROM devices WHERE id = $1', [change.doc.id]);
        console.log(`[FirebaseSync] Equipo eliminado localmente por baja remota: ${data.hostname || data.ip}`);
      }
    });
  });

  onSnapshot(collection(db, 'subnet_mappings'), (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const data = { subnet: change.doc.id, ...change.doc.data() };
      if (change.type === 'added' || change.type === 'modified') {
        await syncSubnetMappingFromFirestore(data);
      } else if (change.type === 'removed') {
        await query('DELETE FROM subnet_mappings WHERE subnet = $1', [change.doc.id]);
      }
    });
  });

  onSnapshot(collection(db, 'departments'), (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const data = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'added' || change.type === 'modified') {
        await syncDepartmentFromFirestore(data);
      } else if (change.type === 'removed') {
        await query('DELETE FROM departments WHERE id = $1', [change.doc.id]);
      }
    });
  });

  onSnapshot(collection(db, 'cities'), (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const data = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'added' || change.type === 'modified') {
        await syncCityFromFirestore(data);
      } else if (change.type === 'removed') {
        await query('DELETE FROM cities WHERE id = $1', [change.doc.id]);
      }
    });
  });

  onSnapshot(collection(db, 'infrastructure'), (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const data = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'added' || change.type === 'modified') {
        await syncInfrastructureFromFirestore(data);
      } else if (change.type === 'removed') {
        await query('DELETE FROM network_infrastructure WHERE id = $1', [change.doc.id]);
      }
    });
  });

  onSnapshot(collection(db, 'actions'), (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const data = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'added' && data.status === 'queued') {
        await handleRemoteAction(data);
      }
    });
  });
}
