import jwt from 'jsonwebtoken';
import { config } from './src/config.js';

async function test() {
  const token = jwt.sign(
    { sub: 'a0000000-0000-0000-0000-000000000000', email: 'admin@local', role: 'Super Administrador', permissions: ['*'] },
    config.jwtSecret || 'win-netwatch-super-secret-key-123456!!!',
    { expiresIn: '1h' }
  );

  const payload = {
    hostname: "ANT-PRE-COLOR1",
    ip: "172.30.100.19",
    mac: null,
    os: "Windows 7",
    office: "WPS",
    antivirus: "ESET 9.1",
    status: "offline",
    rdp_available: false,
    latency_ms: null,
    subnet: "172.30.100.0/24",
    city: "Antofagasta",
    branch: "Imprenta",
    department: "Sala Equipos",
    responsible_user: "Germán Leiva",
    phone: "+56954224259",
    email: "german.leiva@mercurioantofagasta.cl",
    job_title: "Jefe Planta",
    authorized_systems: "",
    notes: null,
    brand: "GENERICO",
    model: null,
    serial_number: null,
    critical: false,
    managed: false,
    employee_id: "1a83bb54-441a-eed9-2be8-757fa2e94c86",
    cpu: null,
    ram: null,
    storage: null,
    gpu: null,
    motherboard: null,
    image_url: null,
    device_type: "PC de Escritorio",
    location: "Rendic",
    ip_type: "static"
  };

  try {
    const url = 'http://localhost:8080/api/devices/a398620b-d8bb-43cd-95e5-d5ae35c65899';
    console.log("Sending PATCH request to:", url);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log("Status:", response.status);
    const data = await response.json();
    console.log("Response data:", JSON.stringify(data, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("HTTP Request failed:", err);
    process.exit(1);
  }
}

test();
