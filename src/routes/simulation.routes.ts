import { Router } from 'express';
import { z } from 'zod';
import { dbQuery } from '../db';
import { loadRuleProfile, simulate, type ImporterProfile } from '../services/simulation.service';

const router = Router();
const hs = (s: string) => s.replace(/\D/g, '');

/**
 * @openapi
 * /api/simulations/advalorem/{hs10}:
 *   get:
 *     tags:
 *       - Simulations
 *     summary: Obtener tasa de Ad-Valorem para una subpartida
 *     parameters:
 *       - name: hs10
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Código HS10 de la subpartida (10 dígitos)
 *     responses:
 *       200:
 *         description: Tasa encontrada o null si no existe
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hs10:
 *                   type: string
 *                 tasa:
 *                   type: number
 *                   nullable: true
 *       404:
 *         description: Subpartida no encontrada
 */
router.get('/advalorem/:hs10', async (req, res) => {
    try {
        const { hs10 } = req.params;
        const cleanHs10 = hs(hs10);

        console.log(`[Ad-Valorem] Consultando HS10: ${cleanHs10}`);

        const result = await dbQuery<{ tasa: number | null }>(
            `SELECT tasa FROM miaff.ad_valorem WHERE hs10 = $1 LIMIT 1`,
            [cleanHs10]
        );

        console.log(`[Ad-Valorem] Resultados encontrados: ${result.rows.length}`, result.rows);

        if (result.rows.length > 0) {
            console.log(`[Ad-Valorem] Tasa encontrada: ${result.rows[0].tasa}`);
            return res.json({ hs10: cleanHs10, tasa: result.rows[0].tasa });
        } else {
            console.log(`[Ad-Valorem] No se encontró tasa para HS10: ${cleanHs10}`);
            return res.json({ hs10: cleanHs10, tasa: null });
        }
    } catch (err: any) {
        console.error('[Ad-Valorem] Error:', err);
        return res.status(500).json({ message: 'Error consultando Ad-Valorem' });
    }
});

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

    // NUEVO: Tipo de mercancía (obligatorio)
    tipo_mercancia_id: z.coerce.number().int().positive(),

    // Ad-Valorem manual
    advalorem_porcentaje: z.union([z.string(), z.coerce.number()]).optional(),

    es_usado: asBool.optional(),

    // Toggles OBLIGATORIOS
    habilitar_igv:        asBool,
    habilitar_isc:        asBool,
    habilitar_percepcion: asBool,

    // Porcentajes IGV e IPM (editables)
    igv_porcentaje: z.union([z.string(), z.coerce.number()]).optional(),
    ipm_porcentaje: z.union([z.string(), z.coerce.number()]).optional(),

    // % opcionales; se ignoran si el toggle respectivo está en false
    isc_porcentaje:    z.union([z.string(), z.coerce.number()]).optional(),

    // Tasa de percepción seleccionada (3.5, 5, 10)
    tasa_percepcion: z.enum(['3.5', '5', '10']).optional(),

    antidumping_usd:    z.coerce.number().min(0).optional(),
    compensatorio_usd:  z.coerce.number().min(0).optional(),
    sda_usd:            z.coerce.number().min(0).optional(),

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
 *       - **tipo_mercancia_id**: ID del tipo de mercancía (601, 602, 603, 604) - OBLIGATORIO
 *       - **CIF = FOB + Flete + Seguro** (automático, en USD).
 *       - **A/V** ahora es MANUAL (campo `advalorem_porcentaje`).
 *       - **IGV/IPM**: ahora son editables (`igv_porcentaje` y `ipm_porcentaje`).
 *       - **ISC**: si *Habilitar ISC* es **false**, el ISC=0 y se ignora `isc_porcentaje`.
 *       - **Percepción**: toggle propio con selector de tasa (3.5%, 5%, 10%).
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
 *               - tipo_mercancia_id
 *               - habilitar_igv
 *               - habilitar_isc
 *               - habilitar_percepcion
 *             properties:
 *               subpartida:
 *                 type: string
 *                 title: Subpartida nacional (HS10, sin puntos)
 *                 example: "4819100000"
 *               tipo_mercancia_id:
 *                 type: integer
 *                 title: ID del tipo de mercancía
 *                 description: "1=Mercaderías(601), 2=Suministros(602), 3=Materiales(603), 4=Envases(604)"
 *                 example: 1
 *               fob:      { type: number, title: "FOB (USD)",    example: 167133 }
 *               flete:    { type: number, title: "Flete (USD)",  example: 22656 }
 *               seguro:   { type: number, title: "Seguro (USD)", example: 284 }
 *               advalorem_porcentaje:
 *                 type: string
 *                 title: "Ad-Valorem (A/V) % — acepta 6, 0.06 o '6%'"
 *                 example: "6"
 *               es_usado: { type: boolean, title: "¿Bien usado?", example: false }
 *               habilitar_igv:        { type: boolean, title: "Habilitar IGV/IPM", example: true }
 *               habilitar_isc:        { type: boolean, title: "Habilitar ISC",     example: false }
 *               habilitar_percepcion: { type: boolean, title: "Habilitar percepción", example: true }
 *               igv_porcentaje:
 *                 type: string
 *                 title: "IGV % — acepta 16, 0.16 o '16%'"
 *                 example: "16"
 *               ipm_porcentaje:
 *                 type: string
 *                 title: "IPM % — acepta 2, 0.02 o '2%'"
 *                 example: "2"
 *               isc_porcentaje:
 *                 type: string
 *                 title: ISC % sobre (CIF + A/V) — acepta 50, 0.5 o "50%"
 *                 example: "0"
 *               tasa_percepcion:
 *                 type: string
 *                 enum: ["3.5", "5", "10"]
 *                 title: "Tasa de percepción seleccionada"
 *                 description: "3.5% = Normal, 5% = Bienes usados, 10% = No habido/Baja RUC/Sin RUC"
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

    // NUEVO: Parsear IGV e IPM
    let igvRate = 0.16; // default 16%
    let ipmRate = 0.02; // default 2%

    if (f.habilitar_igv && f.igv_porcentaje) {
        const parsed = parsePercent(f.igv_porcentaje);
        if (parsed === undefined || parsed < 0 || parsed > 1) {
            return res.status(400).json({ message: 'igv_porcentaje debe ser un porcentaje válido (ej. 16, 0.16 o "16%").' });
        }
        igvRate = parsed;
    }

    if (f.habilitar_igv && f.ipm_porcentaje) {
        const parsed = parsePercent(f.ipm_porcentaje);
        if (parsed === undefined || parsed < 0 || parsed > 1) {
            return res.status(400).json({ message: 'ipm_porcentaje debe ser un porcentaje válido (ej. 2, 0.02 o "2%").' });
        }
        ipmRate = parsed;
    }

    // Parsear ISC
    const iscRate = f.habilitar_isc ? parsePercent(f.isc_porcentaje) : undefined;
    if (iscRate !== undefined && (iscRate < 0 || iscRate > 1)) {
        return res.status(400).json({ message: 'isc_porcentaje debe ser un porcentaje válido (ej. 50, 0.5 o "50%").' });
    }

    // Parsear Percepción - usar la tasa del selector
    let percRate: number | undefined = undefined;
    if (f.habilitar_percepcion && f.tasa_percepcion) {
        const tasa = parseFloat(f.tasa_percepcion) / 100; // 3.5 -> 0.035
        if (tasa >= 0 && tasa <= 1) {
            percRate = tasa;
        }
    }

    try {
        const perfil = await loadRuleProfile(hs(f.subpartida));
        const cifUsd = (f.fob ?? 0) + (f.flete ?? 0) + (f.seguro ?? 0);

        // Obtener A/V de BD primero
        const avRes = await dbQuery<{ tasa: number }>(
            `SELECT tasa FROM miaff.ad_valorem WHERE hs10 = $1 LIMIT 1`,
            [hs(f.subpartida)]
        );

        // Si existe en BD, usar ese valor (no editable desde frontend)
        // Si no existe, usar el valor manual del usuario
        let avRate: number;
        let avFromDB = false;

        if (avRes.rows.length > 0 && avRes.rows[0].tasa !== null) {
            avRate = avRes.rows[0].tasa; // Ya viene como decimal (ej. 0.06)
            avFromDB = true;
        } else {
            // No está en BD, usar valor manual
            const manualAV = parsePercent(f.advalorem_porcentaje);
            if (manualAV === undefined || manualAV < 0 || manualAV > 1) {
                return res.status(400).json({ message: 'advalorem_porcentaje debe ser un porcentaje válido (ej. 6, 0.06 o "6%").' });
            }
            avRate = manualAV;
            avFromDB = false;
        }

        // Calcular A/V
        const avAmountUsd = cifUsd * avRate;

        // Base imponible para ISC = CIF + A/V
        const baseISC = cifUsd + avAmountUsd;
        const iscAmountUsd = iscRate !== undefined && f.habilitar_isc ? baseISC * iscRate : 0;

        // IGV e IPM
        const baseIGV = baseISC + iscAmountUsd;
        const igvAmountUsd = f.habilitar_igv ? baseIGV * igvRate : 0;
        const ipmAmountUsd = f.habilitar_igv ? baseIGV * ipmRate : 0;

        // AD/CVD
        const antidumpingUsd = f.antidumping_usd || 0;
        const countervailingUsd = f.compensatorio_usd || 0;
        const tradeRemediesUsd = antidumpingUsd + countervailingUsd;

        // Base para percepción = CIF + A/V + ISC + IGV + IPM + AD/CVD
        const basePerc = baseIGV + igvAmountUsd + ipmAmountUsd + tradeRemediesUsd;
        const percAmountUsd = percRate !== undefined && f.habilitar_percepcion ? basePerc * percRate : 0;

        // SDA
        const sdaUsd = f.sda_usd || 0;

        // Total deuda
        const totalDeudaUsd = avAmountUsd + iscAmountUsd + igvAmountUsd + ipmAmountUsd +
            tradeRemediesUsd + percAmountUsd + sdaUsd;

        const result = {
            subpartida: f.subpartida,
            cif_usd: cifUsd,
            arancel: {
                rate: avRate,
                amount: avAmountUsd,
                from_db: avFromDB,
            },
            isc: {
                enabled: f.habilitar_isc,
                rate: iscRate,
                base: baseISC,
                total: iscAmountUsd,
            },
            igv: {
                enabled: f.habilitar_igv,
                igv_rate: igvRate,
                ipm_rate: ipmRate,
                igv16: igvAmountUsd,
                ipm2: ipmAmountUsd,
                base: baseIGV,
                total: igvAmountUsd + ipmAmountUsd,
            },
            trade_remedies: {
                antidumping: antidumpingUsd,
                countervailing: countervailingUsd,
                total: tradeRemediesUsd,
            },
            percepcion: {
                enabled: f.habilitar_percepcion,
                rate: percRate,
                tasa_seleccionada: f.tasa_percepcion,
                base: basePerc,
                amount: percAmountUsd,
            },
            sda: {
                amount: sdaUsd,
            },
            total_deuda_usd: totalDeudaUsd,
        };

        // Si NO piden asiento, responder solo simulación (en USD)
        if (!f.generar_asiento) {
            return res.json(result);
        }

        // ───────────────────────────────────────────
        // Asiento contable (preview) en USD
        // ───────────────────────────────────────────
        const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

        // ✅ CAMBIO: Obtener cuenta de bienes desde tipo_mercancia_id
        const tipoMercanciaRes = await dbQuery<{ cuenta_contable: string; nombre: string }>(
            `SELECT cuenta_contable, nombre FROM miaff.tipo_mercancia WHERE id = $1 LIMIT 1`,
            [f.tipo_mercancia_id]
        );

        if (tipoMercanciaRes.rows.length === 0) {
            return res.status(400).json({ message: 'Tipo de mercancía no encontrado' });
        }

        const cuentaBienes = {
            codigo: tipoMercanciaRes.rows[0].cuenta_contable,
            nombre: tipoMercanciaRes.rows[0].nombre
        };

        // Cuentas estándar (jalar nombres desde BD)
        const standarCodes = ['4015','4012','40111','40113','609','421'];
        const stdRes = await dbQuery<{ codigo: string; nombre: string }>(
            `SELECT codigo, nombre FROM miaff.cuenta_contable WHERE codigo = ANY($1::text[])`,
            [standarCodes]
        );
        const mapStd = new Map(stdRes.rows.map(r => [r.codigo, r.nombre]));
        const nombre = (cod: string, def: string) => mapStd.get(cod) ?? def;

        // Montos (USD) desde la simulación
        const cifUsdx     = r2(cifUsd);
        const avAmtUsd    = r2(avAmountUsd);
        const iscAmtUsd   = r2(iscAmountUsd);
        const igvTotUsd   = r2(igvAmountUsd + ipmAmountUsd);
        const remediosUsd = r2(tradeRemediesUsd);
        const sdaAmtUsd   = r2(sdaUsd);
        const costosVinc  = r2(remediosUsd + sdaAmtUsd);
        const percepUsd   = r2(percAmountUsd);

        // Líneas (todas en DEBE excepto 421)
        const lineas: Array<{ cuenta: string; denominacion: string; debe: number; haber: number }> = [
            { cuenta: cuentaBienes.codigo, denominacion: cuentaBienes.nombre, debe: cifUsdx, haber: 0 },
            { cuenta: '4015',  denominacion: nombre('4015','Derechos aduaneros'),               debe: avAmtUsd,   haber: 0 },
            { cuenta: '4012',  denominacion: nombre('4012','Impuesto Selectivo al Consumo'),    debe: iscAmtUsd,  haber: 0 },
            { cuenta: '40111', denominacion: nombre('40111','IGV – Cuenta propia'),             debe: igvTotUsd,  haber: 0 },
            { cuenta: '609',   denominacion: nombre('609','Costos vinculados con las compras'), debe: costosVinc, haber: 0 },
            { cuenta: '40113', denominacion: nombre('40113','IGV – Régimen de percepciones'),   debe: percepUsd,  haber: 0 },
        ];

        // Totales y contrapartida 421
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