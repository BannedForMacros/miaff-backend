import { Router } from 'express';
import { z } from 'zod';
import { dbQuery } from '../db';
import { loadRuleProfile, simulate, type ImporterProfile } from '../services/simulation.service';

const router = Router();
const hs = (s: string) => s.replace(/\D/g, '');

const perfilMap: Record<string, ImporterProfile> = {
  normal: 'normal',
  primera_importacion: 'first_import',
  no_habido: 'no_habido',
  publico: 'public',
  amazonia: 'amazon',
};

function parsePercent(input: unknown): number | undefined {
  if (input === undefined || input === null) return undefined;
  let s = String(input).trim();
  if (!s) return undefined;
  s = s.replace('%', '').replace(',', '.').trim();
  const n = Number(s);
  if (!isFinite(n) || n < 0) return undefined;
  return n > 1 ? n / 100 : n; // 50 -> 0.5 ; 0.5 -> 0.5
}

const asBool = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (['true','1','on','yes','si','sí'].includes(s)) return true;
  if (['false','0','off','no'].includes(s)) return false;
  return v;
}, z.boolean());

/* =================== Zod: formulario (x-www-form-urlencoded) =================== */
const formSchema = z.object({
  subpartida:   z.string().min(8),
  fob:          z.coerce.number().min(0),
  flete:        z.coerce.number().min(0),
  seguro:       z.coerce.number().min(0),

  perfil_importador: z.enum(['normal','primera_importacion','no_habido','publico','amazonia']).optional(),
  es_usado:          asBool.optional(),

  // Toggles OBLIGATORIOS
  habilitar_igv:        asBool,
  habilitar_isc:        asBool,
  habilitar_percepcion: asBool,

  // % opcionales; se ignoran si el toggle respectivo está en false
  isc_porcentaje:    z.union([z.string(), z.coerce.number()]).optional(),
  percepcion_tasa:   z.union([z.string(), z.coerce.number()]).optional(),

  antidumping_usd:    z.coerce.number().min(0).optional(),
  compensatorio_usd:  z.coerce.number().min(0).optional(),
  sda_usd:            z.coerce.number().min(0).optional(),

  // NUEVO: si true, devolver también el asiento contable (preview)
  generar_asiento:    asBool.optional().default(false),
});

/**
 * @openapi
 * tags:
 *   - name: Simulations
 *     description: Cálculo de importación (Perú) en USD
 */

/**
 * @openapi
 * /api/simulations/quote-form:
 *   post:
 *     tags:
 *       - Simulations
 *     summary: Simulación de importación (formulario) — resultados en USD
 *     description: |
 *       Orden: **CIF → A/V → (ISC) → IGV+IPM → (AD/CVD) → Percepción → SDA**.
 *       - **CIF = FOB + Flete + Seguro** (automático, en USD).
 *       - **A/V** se toma automáticamente de la BD por subpartida.
 *       - **ISC**: si *Habilitar ISC* es **false**, el ISC=0 y se ignora `isc_porcentaje`.  
 *         Si es **true**, `isc_porcentaje` se aplica a **(CIF + A/V)**; acepta **50**, **0.5** o **"50%"**.
 *       - **IGV/IPM**: si *Habilitar IGV* es **false**, IGV=0 e IPM=0.
 *       - **Percepción**: toggle propio (independiente de IGV/IPM).  
 *         La base es: **(CIF + A/V + ISC) + IGV + IPM + AD/CVD**.
 *       - **Asiento contable**: si envías `generar_asiento=true`, se incluye `asiento` (preview en **USD**, no persiste).
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - subpartida
 *               - fob
 *               - flete
 *               - seguro
 *               - habilitar_igv
 *               - habilitar_isc
 *               - habilitar_percepcion
 *             properties:
 *               subpartida:
 *                 type: string
 *                 title: Subpartida nacional (HS10, sin puntos)
 *                 example: "4819100000"
 *               fob:      { type: number, title: "FOB (USD)",    example: 167133 }
 *               flete:    { type: number, title: "Flete (USD)",  example: 22656 }
 *               seguro:   { type: number, title: "Seguro (USD)", example: 284 }
 *               perfil_importador:
 *                 type: string
 *                 title: Perfil del importador
 *                 enum: [normal, primera_importacion, no_habido, publico, amazonia]
 *                 example: normal
 *               es_usado: { type: boolean, title: "¿Bien usado?", example: false }
 *               habilitar_igv:        { type: boolean, title: "Habilitar IGV/IPM", example: true }
 *               habilitar_isc:        { type: boolean, title: "Habilitar ISC",     example: false }
 *               habilitar_percepcion: { type: boolean, title: "Habilitar percepción", example: true }
 *               isc_porcentaje:
 *                 type: string
 *                 title: ISC % sobre (CIF + A/V) — acepta 50, 0.5 o "50%"
 *                 example: "0"
 *               percepcion_tasa:
 *                 type: string
 *                 title: Percepción IGV — acepta 3.5, 0.035 o "3.5%"
 *                 example: "3.5"
 *               antidumping_usd:   { type: number, title: "Antidumping (USD)",   example: 0 }
 *               compensatorio_usd: { type: number, title: "Compensatorio (USD)", example: 0 }
 *               sda_usd:           { type: number, title: "SDA (USD, manual)",   example: 20 }
 *               generar_asiento:   { type: boolean, title: "Incluir asiento contable (preview)", example: true }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Datos inválidos }
 */
router.post('/quote-form', async (req, res) => {
  const parsed = formSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });
  const f = parsed.data;

  // % (se ignoran si su toggle está en false)
  const iscRate  = f.habilitar_isc        ? parsePercent(f.isc_porcentaje)  : undefined;
  if (iscRate !== undefined && (iscRate < 0 || iscRate > 1)) {
    return res.status(400).json({ message: 'isc_porcentaje debe ser un porcentaje válido (ej. 50, 0.5 o "50%").' });
  }
  const percRate = f.habilitar_percepcion ? parsePercent(f.percepcion_tasa) : undefined;
  if (percRate !== undefined && (percRate < 0 || percRate > 1)) {
    return res.status(400).json({ message: 'percepcion_tasa debe ser un porcentaje válido (ej. 3.5, 0.035 o "3.5%").' });
  }

  try {
    const perfil = await loadRuleProfile(hs(f.subpartida));
    const cifUsd = (f.fob ?? 0) + (f.flete ?? 0) + (f.seguro ?? 0);

    const result = simulate(
      {
        hs10: hs(f.subpartida),
        // fxRate: eliminado → los cálculos son en USD
        cif: cifUsd,
        importerProfile: f.perfil_importador ? perfilMap[f.perfil_importador] : undefined,
        isUsed: f.es_usado,
      },
      perfil,
      {
        igvEnabled:         f.habilitar_igv,
        iscEnabled:         f.habilitar_isc,
        perceptionEnabled:  f.habilitar_percepcion,
        iscRate,
        antidumpingUsd:     f.antidumping_usd,
        countervailingUsd:  f.compensatorio_usd,
        perceptionRate:     percRate,
        sdaUsd:             f.sda_usd,
      }
    );

    // Si NO piden asiento, responder solo simulación (en USD)
    if (!f.generar_asiento) {
      return res.json(result);
    }

    // ───────────────────────────────────────────
    // Asiento contable (preview) en USD usando TU BD
    // ───────────────────────────────────────────
    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    // 1) Cuenta de bienes por subpartida (subpartida.cuenta_id → cuenta_contable)
    const bienesRes = await dbQuery<{ codigo: string; nombre: string }>(
      `
      SELECT c.codigo, c.nombre
        FROM miaff.subpartida s
        JOIN miaff.cuenta_contable c ON c.id = s.cuenta_id
       WHERE s.hs10 = $1
       LIMIT 1
      `,
      [hs(f.subpartida)]
    );
    const cuentaBienes = bienesRes.rows[0] ?? { codigo: '601', nombre: 'Mercaderías' };

    // 2) Cuentas estándar (jalar nombres desde BD)
    const standarCodes = ['4015','4012','40111','40113','609','421'];
    const stdRes = await dbQuery<{ codigo: string; nombre: string }>(
      `SELECT codigo, nombre FROM miaff.cuenta_contable WHERE codigo = ANY($1::text[])`,
      [standarCodes]
    );
    const mapStd = new Map(stdRes.rows.map(r => [r.codigo, r.nombre]));
    const nombre = (cod: string, def: string) => mapStd.get(cod) ?? def;

    // 3) Montos (USD) desde la simulación
    // Se asume que 'result' ya expresa montos en USD al no proveer fxRate
    const cifUsdx     = r2(cifUsd);
    const avAmtUsd    = r2(result.arancel?.amount || 0);
    const iscAmtUsd   = r2(result.isc?.total || 0);
    const igvTotUsd   = r2((result.igv?.igv16 || 0) + (result.igv?.ipm2 || 0)); // IGV+IPM juntos en 40111
    const remediosUsd = r2(result.trade_remedies?.total || 0);
    const sdaAmtUsd   = r2(result.sda?.amount || 0);
    const costosVinc  = r2(remediosUsd + sdaAmtUsd);                              // 609
    const percepUsd   = r2(result.percepcion?.amount || 0);

    // 4) Líneas (todas en DEBE excepto 421)
    const lineas: Array<{ cuenta: string; denominacion: string; debe: number; haber: number }> = [
      { cuenta: cuentaBienes.codigo, denominacion: cuentaBienes.nombre, debe: cifUsdx,    haber: 0 },
      { cuenta: '4015',  denominacion: nombre('4015','Derechos aduaneros'),               debe: avAmtUsd,   haber: 0 },
      { cuenta: '4012',  denominacion: nombre('4012','Impuesto Selectivo al Consumo'),    debe: iscAmtUsd,  haber: 0 },
      { cuenta: '40111', denominacion: nombre('40111','IGV – Cuenta propia'),             debe: igvTotUsd,  haber: 0 },
      { cuenta: '609',   denominacion: nombre('609','Costos vinculados con las compras'), debe: costosVinc, haber: 0 },
      { cuenta: '40113', denominacion: nombre('40113','IGV – Régimen de percepciones'),   debe: percepUsd,  haber: 0 },
    ];

    // 5) Totales y contrapartida 421
    const debeTotal  = r2(lineas.reduce((s, l) => s + l.debe, 0));
    const haberTotal = debeTotal;
    lineas.push({
      cuenta: '421',
      denominacion: nombre('421','Facturas, boletas y otros comprobantes por pagar'),
      debe: 0,
      haber: haberTotal
    });

    const asiento = {
      moneda: 'USD',
      lineas,
      debe_total: debeTotal,
      haber_total: haberTotal,
    };

    return res.json({ ...result, asiento });
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ message: err?.message ?? 'No se pudo simular' });
  }
});

export default router;
