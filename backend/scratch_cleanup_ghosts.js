import pg from 'pg';
const { Client } = pg;

const databaseUrl = 'postgres://netwatch:netwatch_local_password@localhost:5432/win_netwatch';

async function run() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('Conectado a PostgreSQL. Limpiando fantasmas offline de la subred 102...');
  
  const res = await client.query(`
    DELETE FROM devices 
    WHERE subnet = '172.30.102.0/24'
      AND status = 'offline'
      AND (hostname IS NULL OR hostname = ip::text)
      AND (mac IS NULL OR mac = '')
      AND responsible_user IS NULL
      AND department IS NULL
      AND employee_id IS NULL
      AND switch_id IS NULL
  `);
  
  console.log(`Limpieza terminada. Se borraron ${res.rowCount} dispositivos fantasma.`);
  await client.end();
}

run().catch(console.error);
