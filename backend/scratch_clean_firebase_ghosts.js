import https from 'node:https';

const config = {
  projectId: 'network-monitor-36186',
  apiKey: 'AIzaSyAptyWP56e5m8nxprmxNQpETfWwHOlvBkY',
  email: 'admin@mg.cl',
  password: '123456'
};

function requestJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
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
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log("Logging into Firebase Auth...");
  const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`;
  const authRes = await requestJson(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: config.email,
    password: config.password,
    returnSecureToken: true
  });
  
  const token = authRes.idToken;
  console.log("Logged in! Token received.");

  console.log("Fetching devices from Cloud Firestore...");
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/devices?pageSize=1000`;
  const res = await requestJson(firestoreUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const documents = res.documents || [];
  console.log(`Found ${documents.length} devices in Firestore. Filtering ghosts on 172.30.102.0/24...`);

  let deleteCount = 0;
  for (const doc of documents) {
    const fields = doc.fields || {};
    const name = doc.name; // Full document path in Firestore

    // Extrae campos de Firestore REST format
    const ip = fields.ip?.stringValue || '';
    const subnet = fields.subnet?.stringValue || '';
    const status = fields.status?.stringValue || '';
    const hostname = fields.hostname?.stringValue || '';
    const mac = fields.mac?.stringValue || '';
    const responsible = fields.responsible_user?.stringValue || '';
    const department = fields.department?.stringValue || '';
    const employeeId = fields.employee_id?.integerValue || fields.employee_id?.stringValue || '';
    const switchId = fields.switch_id?.stringValue || '';

    // Condición de dispositivo fantasma offline en la subred 102
    const isGhost = subnet === '172.30.102.0/24' &&
                    status === 'offline' &&
                    (!hostname || hostname === ip) &&
                    (!mac || mac === '') &&
                    !responsible &&
                    !department &&
                    !employeeId &&
                    !switchId;

    if (isGhost) {
      const deleteUrl = `https://firestore.googleapis.com/v1/${name}`;
      console.log(`Deleting ghost device at IP: ${ip}...`);
      await requestJson(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      deleteCount++;
    }
  }

  console.log(`Cloud clean up finished. Successfully deleted ${deleteCount} ghost devices in the Cloud.`);
}

run().catch(console.error);
