import pg from 'pg';

const client = new pg.Client({
  connectionString: "postgresql://netwatch:netwatch_local_password@localhost:5432/win_netwatch"
});

async function run() {
  await client.connect();
  console.log("Connected to PostgreSQL successfully!");
  
  const res = await client.query(`
    SELECT ip, hostname, status, latency_ms, last_seen, updated_at
    FROM devices
    WHERE subnet = '172.30.102.0/24' AND status = 'slow'
    LIMIT 20
  `);
  
  console.log("Slow devices in Matta 102:");
  console.table(res.rows);
  
  const countRes = await client.query(`
    SELECT status, count(*)
    FROM devices
    WHERE subnet = '172.30.102.0/24'
    GROUP BY status
  `);
  console.log("MATTA 102 Status Count:");
  console.table(countRes.rows);

  await client.end();
}

run().catch(console.error);
