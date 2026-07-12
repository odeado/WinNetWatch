import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000
});

// IMPORTANTE: sin este listener, un error en un cliente inactivo del pool
// (ej. "Connection terminated unexpectedly" cuando Postgres se reinicia o
// hay un corte de red breve) se convierte en una excepcion no controlada
// que tumba TODO el proceso de Node (ver backend/crash.log). Como el backend
// corre localmente via "npm run dev" sin un supervisor que lo reinicie,
// eso dejaba el sistema completo sin poder guardar nada hasta reiniciarlo
// manualmente. Con este handler el pool simplemente reconecta el siguiente
// cliente y el servidor sigue funcionando.
pool.on('error', (err) => {
  console.error('[DB Pool] Error inesperado en cliente inactivo del pool:', err.message);
});

export async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const elapsed = Date.now() - start;
  if (elapsed > 500) {
    console.warn(`Slow query ${elapsed}ms`, text);
  }
  return result;
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
