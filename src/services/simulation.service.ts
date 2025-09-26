import { dbQuery } from '../db';

/* ========= Tipos ========= */
export type ImporterProfile = 'normal' | 'first_import' | 'no_habido' | 'public' | 'amazon';

export interface SimulationOverrides {
  igvEnabled: boolean;            // explícito
  iscEnabled: boolean;            // explícito
  perceptionEnabled: boolean;     // percepción independiente

  iscRate?: number;               // 0..1 sobre (CIF + A/V) cuando iscEnabled=true
  antidumpingUsd?: number;        // montos manuales en USD
  countervailingUsd?: number;
  perceptionRate?: number;        // 0..1 (si no viene y perceptionEnabled=true, se calcula por perfil)
  sdaUsd?: number;                // USD
}

export interface SimulationInput {
  hs10: string;                   // sin puntos
  fxRate?: number;                // PEN por USD (opcional; ya no se usa para cálculos en USD)
  cif?: number;                   // si no viene, se usa FOB+Flete+Seguro
  fob?: number;
  freight?: number;
  insurance?: number;

  importerProfile?: ImporterProfile;
  isUsed?: boolean;
}

export interface RuleProfile {
  hs10: string;
  description: string;
  adValoremRate: number;          // de BD (miaff.ad_valorem) → proporción 0..1
  igvRate: number;                // de BD (miaff.impuesto IGV) → proporción 0..1
  ipmRate: number;                // de BD (miaff.impuesto IPM) → proporción 0..1
}

export interface SimulationResult {
  /** ⚠️ Ahora representa USD (se mantiene el nombre por compatibilidad) */
  cif_pen: number;
  arancel: { rate: number; base: number; amount: number };
  isc: { applied: boolean; total: number; details: string };
  trade_remedies: { applied: boolean; items: Array<{ type: 'AD'|'CVD'; amount: number }>; total: number };
  igv: { applied: boolean; exempt: boolean; base: number; igv16: number; ipm2: number; total: number; details: string };
  percepcion: { applied: boolean; rate: number; base: number; amount: number; rule: string };
  sda: { applied: boolean; amount: number };
  deuda_aduanera: number;
  pago_en_frontera: number;
  notes: string[];
}

/* ========= Helpers ========= */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ========= Perfil (A/V, IGV, IPM) desde BD ========= */
export async function loadRuleProfile(hs10: string): Promise<RuleProfile> {
  const hs = hs10.replace(/\D/g, '');
  const sql = `
    SELECT s.hs10,
           s.descripcion,
           COALESCE(av.tasa, 0) AS ad_valorem,
           (SELECT tasa FROM miaff.impuesto WHERE codigo='IGV') AS igv_rate,
           (SELECT tasa FROM miaff.impuesto WHERE codigo='IPM') AS ipm_rate
      FROM miaff.subpartida s
      LEFT JOIN miaff.ad_valorem av ON av.hs10 = s.hs10
     WHERE s.hs10 = $1
     LIMIT 1;
  `;
  const { rows } = await dbQuery<{
    hs10: string; descripcion: string; ad_valorem: string; igv_rate: string; ipm_rate: string
  }>(sql, [hs]);
  if (!rows.length) throw new Error(`Subpartida no encontrada: ${hs}`);

  const r = rows[0];
  return {
    hs10: r.hs10,
    description: r.descripcion,
    adValoremRate: Number(r.ad_valorem ?? 0),
    igvRate: Number(r.igv_rate ?? 0.16),
    ipmRate: Number(r.ipm_rate ?? 0.02),
  };
}

/* ========= Simulación (todo en USD) ========= */
export function simulate(input: SimulationInput, prof: RuleProfile, o: SimulationOverrides): SimulationResult {
  const notes: string[] = [];

  // 1) CIF en USD (no pedimos tipo de cambio)
  const cifUsd = input.cif ?? ((input.fob ?? 0) + (input.freight ?? 0) + (input.insurance ?? 0));
  if (!cifUsd) throw new Error('Debes enviar CIF o (FOB+Flete+Seguro).');

  // Base de cálculo en USD (se mantiene la clave "cif_pen" por compatibilidad)
  const cifBase = r2(cifUsd);

  // 2) Arancel A/V (auto desde BD) — USD
  const avRate = prof.adValoremRate || 0;
  const avAmt  = r2(cifBase * avRate);

  // 3) ISC (solo si iscEnabled === true) — USD
  let iscApplied = false, iscTotal = 0, iscDetails = '0 (no aplicado)';
  if (o.iscEnabled === true) {
    const rate = typeof o.iscRate === 'number' ? o.iscRate : 0;
    const baseIsc = r2(cifBase + avAmt);
    iscTotal = r2(baseIsc * rate);
    iscApplied = rate > 0;
    iscDetails = `ISC % sobre (CIF + A/V), tasa=${rate}`;
  } else {
    iscDetails = 'Deshabilitado por el usuario';
  }

  // 4) IGV + IPM (solo si igvEnabled === true) — USD
  const igvApplies = o.igvEnabled === true;
  const igvBase = r2(cifBase + avAmt + iscTotal);
  const igv16  = igvApplies ? r2(igvBase * prof.igvRate) : 0;
  const ipm2   = igvApplies ? r2(igvBase * prof.ipmRate) : 0;
  const igvTot = r2(igv16 + ipm2);
  const igvDetails = igvApplies ? 'Habilitado' : 'Deshabilitado por el usuario';
  if (!igvApplies) notes.push('IGV/IPM deshabilitado por el usuario.');

  // 5) Remedios comerciales (AD/CVD) — ya vienen en USD
  let remediesTotal = 0;
  const items: Array<{ type: 'AD'|'CVD'; amount: number }> = [];
  if (o.antidumpingUsd) {
    const a = r2(o.antidumpingUsd); remediesTotal += a; items.push({ type:'AD', amount:a });
  }
  if (o.countervailingUsd) {
    const c = r2(o.countervailingUsd); remediesTotal += c; items.push({ type:'CVD', amount:c });
  }

  // 6) Percepción (independiente de IGV) — USD
  const defPerc = (() => {
    if (input.importerProfile === 'public' || input.importerProfile === 'amazon') return { rate: 0,    rule: 'Excluido por régimen especial' };
    if (input.importerProfile === 'first_import' || input.importerProfile === 'no_habido') return { rate: 0.10, rule: 'Primera importación/No habido' };
    if (input.isUsed) return { rate: 0.05, rule: 'Bien usado' };
    return { rate: 0.035, rule: 'Régimen general' };
  })();

  const percEnabled = o.perceptionEnabled === true;
  let percRate = 0, percRule = percEnabled ? defPerc.rule : 'Deshabilitado por el usuario', percBase = 0, percAmt = 0, percApplied = false;
  if (percEnabled) {
    percRate = typeof o.perceptionRate === 'number' ? o.perceptionRate : defPerc.rate;
    percRule = typeof o.perceptionRate === 'number' ? 'Override de percepción' : defPerc.rule;
    // Base percepción: IGV base + IGV + IPM + AD/CVD (todo en USD)
    percBase = r2(igvBase + igv16 + ipm2 + remediesTotal);
    percAmt  = r2(percBase * percRate);
    percApplied = percRate > 0;
  }

  // 7) SDA — USD
  const sdaApplied = typeof o.sdaUsd === 'number' && o.sdaUsd > 0;
  const sdaAmt = sdaApplied ? r2(o.sdaUsd ?? 0) : 0;

  // Totales (USD)
  const deuda = r2(avAmt + iscTotal + igvTot + remediesTotal + sdaAmt);
  const pagoFrontera = r2(deuda + percAmt);

  return {
    cif_pen: cifBase, // ⚠️ ahora USD
    arancel: { rate: avRate, base: cifBase, amount: avAmt },
    isc: { applied: iscApplied, total: iscTotal, details: iscDetails },
    trade_remedies: { applied: items.length > 0, items, total: remediesTotal },
    igv: { applied: igvApplies, exempt: false, base: igvBase, igv16, ipm2, total: igvTot, details: igvDetails },
    percepcion: { applied: percApplied, rate: percRate, base: percBase, amount: percAmt, rule: percRule },
    sda: { applied: sdaApplied, amount: sdaAmt },
    deuda_aduanera: deuda,
    pago_en_frontera: pagoFrontera,
    notes,
  };
}
