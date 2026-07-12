import { query } from './src/db.js';

async function test() {
  try {
    const res = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'devices';
    `);
    console.log("COLUMNS IN DEVICES TABLE:");
    res.rows.forEach(col => {
      console.log(`- ${col.column_name}: ${col.data_type} (Nullable: ${col.is_nullable})`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
