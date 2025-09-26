// src/routes/catalog.routes.ts
import { Router } from 'express';
import { dbQuery } from '../db';

const router = Router();
const clean = (s: string) => s.replace(/\D/g, '');

function formatHS10(hs10: string): string {
  const s = (hs10 ?? '').replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
  return `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}.${s.slice(8, 10)}`;
}

/**
 * @openapi
 * tags:
 *   - name: Catalog
 *     description: Catálogo para selects
 */

/**
 * @openapi
 * /api/catalog/subpartidas:
 *   get:
 *     tags:
 *       - Catalog
 *     summary: Listado de subpartidas (para combos)
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Buscar por código (con o sin puntos) o por texto en la descripción.
 *         example: "caja"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 200
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/subpartidas', async (req, res) => {
  try {
    const q = (req.query.q ?? '').toString().trim();
    const limit = Math.min(Math.max(parseInt((req.query.limit ?? '20') as string, 10) || 20, 1), 200);

    const params: any[] = [];
    const filters: string[] = [];

    // Base
    let sql = `
      SELECT s.hs10, s.descripcion
        FROM miaff.subpartida s
       WHERE s.activo = TRUE
    `;

    // Filtro por código (si hay dígitos)
    const hs = clean(q);
    if (hs.length > 0) {
      params.push(`${hs}%`);
      filters.push(`s.hs10 LIKE $${params.length}`);
    }

    // Filtro por descripción (si hay texto)
    if (q.length > 0) {
      params.push(`%${q}%`);
      filters.push(`s.descripcion ILIKE $${params.length}`);
    }

    if (filters.length > 0) {
      sql += ` AND (${filters.join(' OR ')})`;
    }

    params.push(limit);
    sql += ` ORDER BY s.hs10 LIMIT $${params.length}`;

    const { rows } = await dbQuery<{ hs10: string; descripcion: string }>(sql, params);

    res.json(
      rows.map(r => ({
        value: r.hs10,
        label: `${formatHS10(r.hs10)} – ${r.descripcion}`,
        hs10: r.hs10,
        hs10_fmt: formatHS10(r.hs10),
        descripcion: r.descripcion,
      }))
    );
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ message: e?.message ?? 'Error interno' });
  }
});

export default router;
