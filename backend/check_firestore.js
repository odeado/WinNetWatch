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
  console.log("Logged in successfully! Token received.");

  console.log("Fetching devices from Firestore...");
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/devices?pageSize=1000`;
  
  try {
    const res = await requestJson(firestoreUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const documents = res.documents || [];
    console.log(`Total devices in Firestore: ${documents.length}`);

    const subnets = {};
    for (const doc of documents) {
      const fields = doc.fields || {};
      const subnet = fields.subnet?.stringValue || 'unknown';
      const status = fields.status?.stringValue || 'unknown';
      if (!subnets[subnet]) subnets[subnet] = {};
      subnets[subnet][status] = (subnets[subnet][status] || 0) + 1;
    }

    console.log("Devices count by Subnet and Status in Firestore:");
    console.table(subnets);
  } catch (err) {
    console.error("Failed to query Firestore:", err.message);
  }
}

run().catch(console.error);
