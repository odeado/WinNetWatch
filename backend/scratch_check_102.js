import pg from 'pg';
const { Client } = pg;

const databaseUrl = 'postgres://netwatch:netwatch_local_password@localhost:5432/win_netwatch';

async function run() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  
  const res = await client.query(`
    SELECT status, COUNT(*)::int as count 
    FROM devices 
    WHERE subnet = '172.30.102.0/24'
    GROUP BY status
  `);
  
  console.log('--- ESTADO DE LA SUBRED 102 EN POSTGRESQL LOCAL ---');
  console.log(res.rows);
  console.log('----------------------------------------------------');
  await client.end();
}

run().catch(console.error);
