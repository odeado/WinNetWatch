/**
 * =================================================================
 * IMPORTADOR MASIVO A LA NUBE (FIRESTORE) - WIN NETWATCH
 * =================================================================
 * Este script lee todos los archivos Ficha_*.json en el directorio
 * y los sube directamente a Firebase Firestore sin necesidad de 
 * tener un servidor API local corriendo.
 * 
 * Ejecutar con: node importar_fichas_cloud.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Cargar Variables de Entorno del colector
function loadEnv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.error('Error cargando .env:', err);
  }
}

loadEnv(path.join(__dirname, 'colector.env'));

const config = {
  projectId: process.env.FIREBASE_PROJECT_ID || 'network-monitor-36186',
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyAptyWP56e5m8nxprmxNQpETfWwHOlvBkY',
  email: process.env.COLLECTOR_EMAIL || 'admin@mg.cl',
  password: process.env.COLLECTOR_PASSWORD || '123456'
};

// Agent keep-alive
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 5,
  keepAliveMsecs: 15000
});

function requestJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      agent: keepAliveAgent,
      ...options
    };
    const req = https.request(url, requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          if (data) json = JSON.parse(data);
        } catch (err) {}
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(json);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data || res.statusMessage}`));
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// Auth en Firebase
async function getAuthToken() {
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`;
    const res = await requestJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: config.email,
      password: config.password,
      returnSecureToken: true
    });
    return res.idToken;
  } catch (err) {
    console.error('[Auth] Fallo en autenticación con Firebase:', err.message);
    throw err;
  }
}

// Convertidor de objetos planos a esquema de campos de Firestore
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

// Generador de UUID para los documentos
function stringToUUID(str) {
  if (!str) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) return str;
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

// Subir dispositivo a Firebase
async function pushDeviceToFirestore(token, deviceId, deviceData) {
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/devices/${deviceId}`;
  const payload = toFirestoreFields(deviceData);
  await requestJson(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }, payload);
}

// Subir Evento
async function pushEventToFirestore(token, eventId, eventData) {
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/events/${eventId}`;
  const payload = toFirestoreFields(eventData);
  await requestJson(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }, payload);
}

// Calcular Subred
function getSubnet(ip) {
  if (!ip) return 'unknown';
  const parts = ip.split('.');
  if (parts.length !== 4) return 'unknown';
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

// Ejecución Principal
async function main() {
  console.log('=====================================================');
  console.log('  IMPORTADOR DIRECTO A LA NUBE NETWATCH (FIRESTORE)  ');
  console.log('=====================================================');
  console.log(`Proyecto Firebase: ${config.projectId}`);
  console.log(`Usuario Nube:      ${config.email}`);
  console.log('');

  // 1. Buscar fichas
  const files = fs.readdirSync(__dirname).filter(f => f.startsWith('Ficha_') && f.endsWith('.json'));

  if (files.length === 0) {
    console.log('[x] No se encontraron archivos Ficha_*.json en este directorio.');
    console.log('[i] Copia los JSONs recopilados en esta carpeta y vuelve a ejecutar.');
    process.exit(0);
  }

  console.log(`[+] Encontradas ${files.length} fichas JSON locales para importar.`);
  console.log('[*] Autenticando con Firebase...');
  const token = await getAuthToken();
  console.log('[v] Conectado exitosamente a Firebase Cloud.\n');

  let success = 0;
  let fail = 0;

  for (const file of files) {
    const filePath = path.join(__dirname, file);
    console.log(`[*] Procesando: ${file} ...`);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);

      if (!data.ip) {
        console.warn(`    [x] Ignorado: El archivo no contiene una IP válida.`);
        fail++;
        continue;
      }

      const uuid = stringToUUID(data.ip);
      const subnet = getSubnet(data.ip);

      const devicePayload = {
        id: uuid,
        hostname: data.hostname || '',
        ip: data.ip,
        mac: data.mac || '',
        os: data.os || '',
        status: 'online',
        last_seen: new Date().toISOString(),
        brand: data.brand || '',
        model: data.model || '',
        serial_number: data.serial_number || '',
        cpu: data.cpu || '',
        ram: data.ram || '',
        storage: data.storage || '',
        gpu: data.gpu || '',
        motherboard: data.motherboard || '',
        office: data.office || 'No detectado',
        antivirus: data.antivirus || 'Windows Defender',
        subnet: subnet,
        device_type: 'PC',
        location: 'Matta',
        critical: false,
        managed: false
      };

      // 1. Subir dispositivo
      await pushDeviceToFirestore(token, uuid, devicePayload);

      // 2. Subir Evento
      const eventId = crypto.randomUUID();
      const eventPayload = {
        device_id: uuid,
        type: 'device.new',
        severity: 'info',
        message: `Ficha importada manualmente para equipo ${data.hostname || data.ip}`,
        created_at: new Date().toISOString()
      };
      await pushEventToFirestore(token, eventId, eventPayload);

      console.log(`    [v] Importado con éxito! UUID: ${uuid}`);
      success++;

      // Opcional: renombrar o mover archivo procesado
      // fs.renameSync(filePath, path.join(__dirname, `Importado_${file}`));
    } catch (err) {
      console.error(`    [x] Error al importar ${file}:`, err.message);
      fail++;
    }
  }

  console.log('\n=====================================================');
  console.log('  RESUMEN DE IMPORTACIÓN A LA NUBE');
  console.log('=====================================================');
  console.log(`  - Exitosos: ${success}`);
  console.log(`  - Fallidos: ${fail}`);
  console.log('=====================================================');
}

main().catch(err => {
  console.error('[ERROR CRÍTICO]:', err.message);
  process.exit(1);
});
