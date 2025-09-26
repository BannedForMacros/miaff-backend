// src/db.ts
import { Pool, QueryResultRow } from 'pg'; // <-- 1. IMPORTACIÓN AÑADIDA
import { config } from './config';

const pool = config.databaseUrl
  ? new Pool({ 
      connectionString: config.databaseUrl,
      ssl: {
        rejectUnauthorized: false // Necesario para conexiones a Render desde local
      }
    })
  : new Pool({
      host: config.pg.host,
      port: config.pg.port,
      user: config.pg.user,
      password: config.pg.password,
      database: config.pg.database
    });

// 2. RESTRICCIÓN AÑADIDA A <T>
export async function dbQuery<T extends QueryResultRow>(text: string, params?: any[]): Promise<{ rows: T[] }> {
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