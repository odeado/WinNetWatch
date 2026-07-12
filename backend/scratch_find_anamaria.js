import { query } from './src/db.js';

async function test() {
  try {
    const res = await query(`
      SELECT id, hostname, ip, email, department, city, location, serial_number
      FROM devices
      WHERE email ILIKE '%anamaria%';
    `);
    console.log("DEVICES WITH ANAMARIA:");
    res.rows.forEach(d => {
      console.log(JSON.stringify(d, null, 2));
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
