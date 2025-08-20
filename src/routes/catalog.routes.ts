import { Router } from 'express';
import { z } from 'zod';
import { dbQuery } from '../db';

const router = Router();
const normalizeHS = (s: string) => s.replace(/\D/g, '');

// ─────────────────────────────────────────────
// GET /api/catalog/hs/search?q=texto&limit=12
/**
 * @openapi
 * /api/catalog/hs/search:
 *   get:
 *     tags: [Catalog]
 *     summary: "Buscar mercancías por texto (autocomplete)"
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, example: "caja cartón" }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 12 }
 *     responses:
 *       200: { description: "OK" }
 */
router.get('/hs/search', async (req, res) => {
  const schema = z.object({
    q: z.string().min(2),
    limit: z.coerce.number().min(1).max(50).default(12),
  });
  const { q, limit } = schema.parse(req.query);

  const rows = await dbQuery<{
    hs10: string; description: string; mfn_rate: string;
    has_isc: boolean; vat_exempt: boolean; has_tr: boolean;
  }>(`
    WITH t AS (
      SELECT
        regexp_replace(hs10, '\\D', '', 'g') AS hs_norm,
        hs10, description, mfn_rate, id
      FROM miaff.tariffs
      WHERE description ILIKE '%' || $1 || '%'
      ORDER BY description
      LIMIT $2
    )
    SELECT
      t.hs_norm  AS hs10,
      t.description,
      t.mfn_rate,
      EXISTS (
        SELECT 1 FROM miaff.isc_rules r
        WHERE r.tariff_id = t.id
          AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
      ) AS has_isc,
      EXISTS (
        SELECT 1 FROM miaff.vat_exempt v
        WHERE v.tariff_id = t.id
          AND v.valid_from <= CURRENT_DATE
          AND (v.valid_to IS NULL OR v.valid_to >= CURRENT_DATE)
      ) AS vat_exempt,
      EXISTS (
        SELECT 1 FROM miaff.trade_remedies tr
        WHERE tr.tariff_id = t.id
      ) AS has_tr
    FROM t
  `, [q, limit]);

  const data = rows.rows.map(r => {
    const hs = r.hs10;
    const ch  = hs.slice(0,2);
    const hd  = hs.slice(0,4);
    const sh  = hs.slice(0,6);
    const dotted6  = `${hd.slice(0,4)}.${sh.slice(4,6)}`;
    const dotted10 = `${hs.slice(0,4)}.${hs.slice(4,6)}.${hs.slice(6,8)}.${hs.slice(8,10)}`;
    return {
      hs10: hs,
      description: r.description,
      mfn_rate: Number(r.mfn_rate),
      has_isc: r.has_isc,
      has_trade_remedies: r.has_tr,
      vat_exempt: r.vat_exempt,
      breadcrumbs: [ch, hd, dotted6, dotted10]
    };
  });

  res.json(data);
});

// ─────────────────────────────────────────────
// Árbol HS: capítulos → partidas → subpartidas → nacional

/** GET /api/catalog/hs/chapters */
router.get('/hs/chapters', async (_req, res) => {
  const rows = await dbQuery<{ code: string }>(`
    SELECT DISTINCT SUBSTRING(regexp_replace(hs10, '\\D','','g') FROM 1 FOR 2) AS code
    FROM miaff.tariffs
    ORDER BY code
  `, []);
  res.json(rows.rows.map(r => ({ code: r.code, title: `Capítulo ${r.code}` })));
});

/** GET /api/catalog/hs/headings?chapter=48 */
router.get('/hs/headings', async (req, res) => {
  const schema = z.object({ chapter: z.string().length(2) });
  const { chapter } = schema.parse(req.query);
  const rows = await dbQuery<{ code: string }>(`
    SELECT DISTINCT SUBSTRING(regexp_replace(hs10, '\\D','','g') FROM 1 FOR 4) AS code
    FROM miaff.tariffs
    WHERE SUBSTRING(regexp_replace(hs10, '\\D','','g') FROM 1 FOR 2) = $1
    ORDER BY code
  `, [chapter]);
  res.json(rows.rows.map(r => ({ code: r.code })));
});

/** GET /api/catalog/hs/subheadings?heading=4819 */
router.get('/hs/subheadings', async (req, res) => {
  const schema = z.object({ heading: z.string().length(4) });
  const { heading } = schema.parse(req.query);
  const rows = await dbQuery<{ code: string }>(`
    SELECT DISTINCT SUBSTRING(regexp_replace(hs10, '\\D','','g') FROM 1 FOR 6) AS code
    FROM miaff.tariffs
    WHERE SUBSTRING(regexp_replace(hs10, '\\D','','g') FROM 1 FOR 4) = $1
    ORDER BY code
  `, [heading]);
  res.json(rows.rows.map(r => ({ code: r.code })));
});

/** GET /api/catalog/hs/national?subheading=481910 */
router.get('/hs/national', async (req, res) => {
  const schema = z.object({ subheading: z.string().length(6) });
  const { subheading } = schema.parse(req.query);
  const rows = await dbQuery<{ hs10: string; description: string; mfn_rate: string }>(`
    SELECT
      regexp_replace(hs10,'\\D','','g') AS hs10,
      description,
      mfn_rate
    FROM miaff.tariffs
    WHERE SUBSTRING(regexp_replace(hs10,'\\D','','g') FROM 1 FOR 6) = $1
    ORDER BY description
  `, [subheading]);
  res.json(rows.rows.map(r => ({
    hs10: r.hs10,
    description: r.description,
    mfn_rate: Number(r.mfn_rate)
  })));
});

// ─────────────────────────────────────────────
// Países (estático) y perfiles de importador

/** GET /api/catalog/countries */
router.get('/countries', (_req, res) => {
  // Lista mínima; amplía según necesites
  res.json([
    { code: 'CN', name: 'China' },
    { code: 'CL', name: 'Chile' },
    { code: 'US', name: 'Estados Unidos' },
    { code: 'BR', name: 'Brasil' },
    { code: 'PE', name: 'Perú' },
    { code: 'ES', name: 'España' }
  ]);
});

/** GET /api/catalog/importer-profiles */
router.get('/importer-profiles', (_req, res) => {
  res.json([
    { value: 'normal',        label: 'Normal (3.5%)',                 defaultRate: 0.035 },
    { value: 'first_import',  label: 'Primera importación (10%)',     defaultRate: 0.10  },
    { value: 'no_habido',     label: 'No habido (10%)',               defaultRate: 0.10  },
    { value: 'public',        label: 'Sector público / exonerado',    defaultRate: 0     },
    { value: 'amazon',        label: 'Amazonía (0%)',                 defaultRate: 0     }
  ]);
});

export default router;
