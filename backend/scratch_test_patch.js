import { query } from './src/db.js';

async function test() {
  const deviceId = '388176b0-7231-47a9-94ad-5747ae71ecc0';
  const payload = {
    hostname: "CAL-COM-MPIZARRO",
    ip: "172.30.100.116",
    mac: null,
    os: "Windows 7",
    office: "WPS",
    antivirus: "ESET 9.1",
    status: "unknown",
    rdp_available: false,
    latency_ms: null,
    subnet: "172.30.100.0/24",
    city: "Calama",
    branch: "",
    department: "Sala Equipos",
    responsible_user: "Ana Maria Araya",
    phone: "+56992753324",
    email: "anamaria.araya@mercuriocalama.cl",
    job_title: "Gerencia Calama",
    authorized_systems: "",
    notes: "",
    brand: "HP",
    model: "",
    serial_number: "4CS00407VW",
    critical: false,
    managed: false,
    employee_id: null,
    cpu: "",
    ram: "",
    storage: "",
    gpu: "",
    motherboard: "",
    image_url: "",
    device_type: "All in One",
    location: "Rendic",
    last_seen: new Date().toISOString(),
    ip_type: "static"
  };

  try {
    const before = (await query('SELECT * FROM devices WHERE id = $1', [deviceId])).rows[0];
    if (!before) {
      console.log("Device not found");
      process.exit(1);
    }

    const allowed = [
      'hostname', 'ip', 'mac', 'os', 'status', 'city', 'branch', 'department',
      'responsible_user', 'job_title', 'phone', 'email', 'notes', 'brand', 'model',
      'serial_number', 'asset_status', 'critical', 'managed', 'tags', 'employee_id', 'cpu', 'ram', 'storage',
      'gpu', 'motherboard', 'image_url', 'device_type', 'location', 'office', 'antivirus', 'authorized_systems', 'switch_id', 'switch_port', 'ip_type'
    ];
    
    const fields = [];
    const values = [deviceId];
    let placeholderIndex = 2;

    for (const key of allowed) {
      if (payload[key] !== undefined) {
        fields.push(`${key} = $${placeholderIndex}`);
        values.push(payload[key]);
        placeholderIndex += 1;
      }
    }

    const sql = `UPDATE devices SET ${fields.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`;
    console.log("Executing SQL:", sql);
    console.log("Values:", values);
    
    const { rows } = await query(sql, values);
    console.log("Success! Updated device in db:", rows[0]);
    process.exit(0);
  } catch (err) {
    console.error("ERROR EXECUTING DB UPDATE:", err);
    process.exit(1);
  }
}

test();
