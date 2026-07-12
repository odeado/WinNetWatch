import { query } from './src/db.js';

async function test() {
  try {
    const res = await query(`
      SELECT serial_number, COUNT(*)
      FROM devices
      WHERE serial_number IS NOT NULL AND serial_number != ''
      GROUP BY serial_number
      HAVING COUNT(*) > 1;
    `);
    console.log("DUPLICATE SERIAL NUMBERS IN DB:");
    res.rows.forEach(r => {
      console.log(`- Serial: ${r.serial_number} | Count: ${r.count}`);
    });

    const res2 = await query(`
      SELECT ip, COUNT(*)
      FROM devices
      WHERE ip IS NOT NULL
      GROUP BY ip
      HAVING COUNT(*) > 1;
    `);
    console.log("DUPLICATE IPS IN DB:");
    res2.rows.forEach(r => {
      console.log(`- IP: ${r.ip} | Count: ${r.count}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
