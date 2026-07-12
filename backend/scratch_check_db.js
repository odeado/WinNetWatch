import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://netwatch:netwatch_local_password@localhost:5432/win_netwatch'
});

async function main() {
  await client.connect();
  console.log("--- NETWORK INFRASTRUCTURE ---");
  try {
    const res = await client.query('SELECT id, brand, model, location, city, ip FROM network_infrastructure');
    res.rows.forEach((row) => {
      console.log(`ID: ${row.id} | IP: ${row.ip} | Brand: ${row.brand} | Model: ${row.model} | Location: "${row.location}" | City: "${row.city}"`);
    });
  } catch (err) {
    console.error("Error reading network_infrastructure:", err.message);
  }

  console.log("\n--- DEVICES ---");
  try {
    const res = await client.query('SELECT id, hostname, ip, location, city FROM devices LIMIT 10');
    res.rows.forEach((row) => {
      console.log(`ID: ${row.id} | IP: ${row.ip} | Hostname: ${row.hostname} | Location: "${row.location}" | City: "${row.city}"`);
    });
  } catch (err) {
    console.error("Error reading devices:", err.message);
  }

  await client.end();
}

main().catch(console.error);
