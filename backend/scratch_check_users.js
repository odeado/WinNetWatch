import { query } from './src/db.js';

async function test() {
  try {
    const res = await query(`
      SELECT id, email, full_name, active
      FROM app_users;
    `);
    console.log("APP USERS IN DB:");
    res.rows.forEach(u => {
      console.log(`- ID: ${u.id} | Email: ${u.email} | Name: ${u.full_name} | Active: ${u.active}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
