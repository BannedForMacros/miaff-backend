import { Router } from 'express';
import { dbQuery, dbPing } from '../db';

const router = Router();

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: Estado del servicio y conexión a la base de datos
 *     responses:
 *       200:
 *         description: OK
 */


router.get('/', async (_req, res) => {
  try {
    const ok = await dbPing();
    if (!ok) return res.status(500).json({ status: 'down' });

    const { rows } = await dbQuery<{ db: string; schema: string; version: string }>(
      `SELECT current_database()::text AS db,
              current_schema()::text   AS schema,
              version()::text          AS version`
    );
    res.json({ status: 'ok', db: rows[0] });
  } catch (e: any) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

export default router;
