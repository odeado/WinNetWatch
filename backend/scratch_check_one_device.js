import { query } from './src/db.js';

async function test() {
  try {
    const res = await query(`
      SELECT id, hostname, ip, department, city, location, updated_at
      FROM devices
      WHERE id = 'a398620b-d8bb-43cd-95e5-d5ae35c65899';
    `);
    console.log("DEVICE STATE IN DB:");
    console.log(JSON.stringify(res.rows[0], null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
