import { query } from './src/db.js';

async function test() {
  try {
    const res = await query(`
      SELECT id, hostname, ip, serial_number, department, city
      FROM devices;
    `);
    console.log("DEVICES:");
    res.rows.forEach(d => {
      console.log(`- ID: ${d.id} | Host: ${d.hostname} | IP: ${d.ip} | Serial: ${d.serial_number} | Dept: ${d.department} | City: ${d.city}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
