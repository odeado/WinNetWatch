import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000
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
