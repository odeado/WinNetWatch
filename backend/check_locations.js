import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://netwatch:netwatch_local_password@localhost:5432/win_netwatch'
});

async function main() {
  await client.connect();
  console.log("Fetching all infrastructure items from PostgreSQL...");
  const res = await client.query('SELECT id, city, location, ip, brand, model, type FROM infrastructure');
  console.log(`Found ${res.rowCount} items.`);
  res.rows.forEach((row) => {
    console.log(`ID: ${row.id} | City: ${row.city} | Location: ${row.location} | IP: ${row.ip} | ${row.brand} ${row.model} (${row.type})`);
  });
  await client.end();
}

main().catch(console.error);
