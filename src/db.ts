import { Pool } from 'pg';
import { config } from './config';

const pool = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl })
  : new Pool({
      host: config.pg.host,
      port: config.pg.port,
      user: config.pg.user,
      password: config.pg.password,
      database: config.pg.database
    });

export async function dbQuery<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const client = await pool.connect();
  try {
    const res = await client.query<T>(text, params);
    return { rows: res.rows };
  } finally {
    client.release();
  }
}

export async function dbPing(): Promise<boolean> {
  const { rows } = await dbQuery<{ one: number }>('SELECT 1 AS one');
  return rows[0]?.one === 1;
}
