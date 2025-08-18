// src/services/simulation.service.ts
import { dbQuery } from '../db';

export type ImporterProfile = 'normal' | 'first_import' | 'no_habido' | 'public' | 'amazon';

export interface SimulationOverrides {
  adValoremRate?: number;       // ej. 0.06
  antidumpingUsd?: number;      // ej. 300 (monto específico en USD)
  countervailingUsd?: number;   // ej. 100 (monto específico en USD)
  perceptionRate?: number;      // ej. 0.035
  sdaUsd?: number;              // ej. 53
}

export interface SimulationInput {
  hs10: string;                 // '2204.21.00.00'
  originCountry: string;        // 'CL', 'CN', etc.
  useFTA?: boolean;             // aplica preferencia si existe y hay certificado
  currency?: string;            // 'USD' (informativo)
  fxRate: number;               // tipo de cambio SUNAT del día (obligatorio)

  // CIF directo o FOB+Flete+Seguro
  cif?: number;
  fob?: number;
  freight?: number;
  insurance?: number;

  // Cantidad/unidad para ISC específico y AD/CVD específicos
  quantity?: number;
  quantityUnit?: string;

  // Reglas de negocio
  isUsed?: boolean;             // usado = percepción 5% por defecto (si no cae en 10%)
  importerProfile?: ImporterProfile;

  // Parámetros opcionales por categoría (ej.: bebidas)
  alcoholDegree?: number;       // °alcohólicos para vinos/spirits
  // ...otros parámetros de producto si se necesitan
}

export interface RuleProfile {
  tariffId: number;
  hs10: string;
  description: string;
  mfnRate: number;
  ftaRate: number | null;
  iscRule: {
    system: 'none'|'ad_valorem'|'especifico'|'publico'|'mixed';
    adValRate?: number | null;
    specificAmount?: number | null; // S/ por unidad
    unit?: string | null;
    params?: any | null;            // JSON con bandas, etc.
  } | null;
  vatExempt: boolean;
  tradeRemedies: Array<{
    type: 'AD' | 'CVD';
    mode: 'ad_valorem' | 'specific';
    rateOrAmount: number;          // si ad_valorem => tasa (ej 0.05), si specific => PEN por unidad
    unit?: string | null;
  }>;
  permits: Array<{ authority: string; note: string | null }>;
  adminFees: {
    uit: number;
    sdaRate: number;           // 2.35% UIT
    thresholdUIT: number;      // 3 UIT
  };
}

export interface SimulationResult {
  cif_pen: number;
  arancel: { rate: number; base: number; amount: number };
  isc: {
    mode: string;
    details: any; // objeto con breakdown (específico/ad-valorem/mixed)
    total: number;
  };
  trade_remedies: {
    applied: boolean;
    items: Array<{ type: 'AD'|'CVD'; mode: 'ad_valorem'|'specific'; amount: number; source: 'db'|'override' }>;
    total: number;
  };
  // IGV/IPM desglosado, manteniendo "rate" y "amount" para compatibilidad
  igv: {
    base: number;         // CIF + A/V + ISC
    igv16: number;        // 16% de base
    ipm2: number;         // 2% de base
    total: number;        // igv16 + ipm2
    rate: number;         // 0.18 (solo informativo)
    amount: number;       // = total (compat)
    exempt: boolean;
  };
  percepcion: { rate: number; base: number; amount: number; rule: string };
  sda: { applies: boolean; amount: number };
  deuda_aduanera: number;
  pago_en_frontera: number;
  notes: string[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function pickIscSpecificFromBands(params: any, alcoholDegree?: number): number | null {
  if (!params || !Array.isArray(params.bands)) return null;
  const deg = alcoholDegree ?? 0;
  const band = params.bands.find((b: any) => typeof b.max_abv === 'number' && deg <= b.max_abv);
  if (!band) return null;
  return typeof band.specific_per_l_pen === 'number' ? band.specific_per_l_pen : null;
}

function defaultPerception(profile: ImporterProfile | undefined, isUsed: boolean | undefined): { rate: number; rule: string } {
  if (profile === 'public' || profile === 'amazon') return { rate: 0,    rule: 'Excluido por régimen especial' };
  if (profile === 'first_import' || profile === 'no_habido') return { rate: 0.10, rule: 'Primera importación/No habido' };
  if (isUsed) return { rate: 0.05, rule: 'Bien usado' };
  return { rate: 0.035, rule: 'Régimen general' };
}

export async function loadRuleProfile(hs10: string, originCountry: string, today = new Date()): Promise<RuleProfile> {
  const hsNorm = hs10.replace(/\D/g, '');

  const tRes = await dbQuery<{
    id: number; hs10: string; description: string; mfn_rate: string; franja_flag: boolean
  }>(
    `SELECT id, hs10, description, mfn_rate, franja_flag
       FROM miaff.tariffs
      WHERE regexp_replace(hs10, '[^0-9]', '', 'g') = $1`,
    [hsNorm]
  );
  if (!tRes.rows.length) throw new Error(`Subpartida no encontrada: ${hsNorm}`);
  const t = tRes.rows[0];

  // 2) FTA vigente (si hay)
  const ftaRes = await dbQuery<{ rate: string }>(
    `SELECT rate
       FROM miaff.fta_rates
      WHERE tariff_id = $1 AND country = $2
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
      ORDER BY valid_from DESC
      LIMIT 1`, [t.id, originCountry]
  );
  const ftaRate = ftaRes.rows.length ? Number(ftaRes.rows[0].rate) : null;

  // 3) ISC vigente
  const iscRes = await dbQuery<{
    system: 'none'|'ad_valorem'|'especifico'|'publico'|'mixed';
    ad_valorem_rate: string | null;
    specific_amount: string | null;
    unit: string | null;
    params: any | null;
  }>(
    `SELECT system, ad_valorem_rate, specific_amount, unit, params
       FROM miaff.isc_rules
      WHERE tariff_id = $1
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
      ORDER BY valid_from DESC
      LIMIT 1`, [t.id]
  );
  const iscRow = iscRes.rows[0] ?? null;

  // 4) IGV exonerado?
  const vatRes = await dbQuery<{ id: number }>(
    `SELECT id
       FROM miaff.vat_exempt
      WHERE tariff_id = $1
        AND valid_from <= CURRENT_DATE
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
      LIMIT 1`, [t.id]
  );
  const vatExempt = !!vatRes.rows.length;

  // 5) AD/CVD vigentes
  const trRes = await dbQuery<{ type: 'AD'|'CVD'; mode: 'ad_valorem'|'specific'; rate_or_amount: string; unit: string | null }>(
    `SELECT type, mode, rate_or_amount, unit
       FROM miaff.trade_remedies
      WHERE tariff_id = $1 AND country = $2
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
      ORDER BY valid_from DESC`, [t.id, originCountry]
  );

  // 6) Permisos
  const pRes = await dbQuery<{ authority: string; note: string | null }>(
    `SELECT authority, note
       FROM miaff.permits_map
      WHERE tariff_id = $1`, [t.id]
  );

  // 7) Admin fees (UIT, SDA)
  const year = today.getUTCFullYear();
  const aRes = await dbQuery<{ uit_value: string; sda_rate_import: string; threshold_cif_in_uit: string }>(
    `SELECT uit_value, sda_rate_import, threshold_cif_in_uit
       FROM miaff.admin_fees
      WHERE year = $1
      LIMIT 1`, [year]
  );
  if (!aRes.rows.length) throw new Error(`Falta configurar admin_fees para el año ${year}`);
  const af = aRes.rows[0];

  return {
    tariffId: t.id,
    hs10: t.hs10,
    description: t.description,
    mfnRate: Number(t.mfn_rate),
    ftaRate,
    iscRule: iscRow ? {
      system: iscRow.system,
      adValRate: iscRow.ad_valorem_rate ? Number(iscRow.ad_valorem_rate) : null,
      specificAmount: iscRow.specific_amount ? Number(iscRow.specific_amount) : null,
      unit: iscRow.unit,
      params: iscRow.params
    } : null,
    vatExempt,
    tradeRemedies: trRes.rows.map(r => ({
      type: r.type,
      mode: r.mode,
      rateOrAmount: Number(r.rate_or_amount),
      unit: r.unit
    })),
    permits: pRes.rows.map(x => ({ authority: x.authority, note: x.note })),
    adminFees: {
      uit: Number(af.uit_value),
      sdaRate: Number(af.sda_rate_import),
      thresholdUIT: Number(af.threshold_cif_in_uit)
    }
  };
}

/**
 * Simulación principal
 * @param input      Datos de la operación (CIF o FOB/Flete/Seguro)
 * @param prof       Perfil de reglas (aranceles, ISC, etc.)
 * @param overrides  Overridables (arancel, AD/CVD, percepción, SDA)
 */
export function simulate(input: SimulationInput, prof: RuleProfile, overrides?: SimulationOverrides): SimulationResult {
  const notes: string[] = [];

  // CIF en USD → PEN
  const cifUSD = input.cif ?? ((input.fob ?? 0) + (input.freight ?? 0) + (input.insurance ?? 0));
  if (!cifUSD || !input.fxRate) throw new Error('CIF o (FOB/Flete/Seguro) y fxRate son obligatorios.');
  const cifPEN = round2(cifUSD * input.fxRate);

  // Arancel (preferencia TLC o override)
  let advalRate = input.useFTA && prof.ftaRate !== null
    ? Math.min(prof.mfnRate, prof.ftaRate)
    : prof.mfnRate;

  if (overrides?.adValoremRate != null) {
    advalRate = overrides.adValoremRate;
    notes.push('Arancel ad-valorem tomado de overrides.');
  } else if (input.useFTA && prof.ftaRate !== null && prof.ftaRate < prof.mfnRate) {
    notes.push('Se aplicó preferencia arancelaria (TLC).');
  }

  const dArancel = round2(cifPEN * advalRate);

  // ISC
  let iscTotal = 0;
  const iscDetail: any = { mode: 'none' };
  if (prof.iscRule) {
    const baseISC = cifPEN + dArancel;
    if (prof.iscRule.system === 'ad_valorem') {
      const rate = prof.iscRule.adValRate ?? 0;
      const amount = round2(baseISC * rate);
      iscTotal = amount;
      iscDetail.mode = 'ad_valorem';
      iscDetail.ad_val = { rate, base: round2(baseISC), amount };
    } else if (prof.iscRule.system === 'especifico') {
      const qty = input.quantity ?? 0;
      const unit = prof.iscRule.unit ?? 'UN';
      const perUnit = prof.iscRule.specificAmount ?? 0;
      const amount = round2(qty * perUnit);
      iscTotal = amount;
      iscDetail.mode = 'especifico';
      iscDetail.especifico = { unit, qty, perUnit, amount };
    } else if (prof.iscRule.system === 'mixed') {
      const qty = input.quantity ?? 0;
      const unit = prof.iscRule.unit ?? 'UN';
      const bandPerUnit = pickIscSpecificFromBands(prof.iscRule.params, input.alcoholDegree);
      const perUnit = bandPerUnit ?? (prof.iscRule.specificAmount ?? 0);
      const espec = round2(qty * perUnit);
      const adRate = prof.iscRule.adValRate ?? 0;
      const adv = round2((cifPEN + dArancel) * adRate);
      iscTotal = espec + adv;
      iscDetail.mode = 'mixed';
      iscDetail.specific = { unit, qty, perUnit, amount: espec };
      iscDetail.ad_val = { rate: adRate, base: round2(cifPEN + dArancel), amount: adv };
    } else {
      iscDetail.mode = 'none';
    }
  }

  // AD/CVD: desde BD + overrides (USD → PEN)
  let adcvdTotal = 0;
  const adcvdItems: Array<{ type: 'AD'|'CVD'; mode: 'ad_valorem'|'specific'; amount: number; source: 'db'|'override' }> = [];

  // BD
  for (const r of prof.tradeRemedies) {
    if (r.mode === 'ad_valorem') {
      const amt = round2(cifPEN * r.rateOrAmount);
      adcvdTotal += amt;
      adcvdItems.push({ type: r.type, mode: r.mode, amount: amt, source: 'db' });
    } else {
      const qty = input.quantity ?? 0;
      // r.rateOrAmount en PEN por unidad (si tu BD está en PEN)
      const amt = round2(qty * r.rateOrAmount);
      adcvdTotal += amt;
      adcvdItems.push({ type: r.type, mode: r.mode, amount: amt, source: 'db' });
    }
  }

  // Overrides (monto específico en USD)
  if (overrides?.antidumpingUsd && overrides.antidumpingUsd > 0) {
    const amt = round2(overrides.antidumpingUsd * input.fxRate);
    adcvdTotal += amt;
    adcvdItems.push({ type: 'AD', mode: 'specific', amount: amt, source: 'override' });
  }
  if (overrides?.countervailingUsd && overrides.countervailingUsd > 0) {
    const amt = round2(overrides.countervailingUsd * input.fxRate);
    adcvdTotal += amt;
    adcvdItems.push({ type: 'CVD', mode: 'specific', amount: amt, source: 'override' });
  }

  // IGV/IPM — base = CIF + Arancel + ISC (NO incluye AD/CVD)
  const igvBase = round2(cifPEN + dArancel + iscTotal);
  const igv16 = prof.vatExempt ? 0 : round2(igvBase * 0.16);
  const ipm2  = prof.vatExempt ? 0 : round2(igvBase * 0.02);
  const igvTot = round2(igv16 + ipm2);
  if (prof.vatExempt) notes.push('Subpartida exonerada de IGV/IPM vigente.');

  // Percepción — base = igvBase + IGV16 + IPM2 + AD + CVD
  const percDefault = defaultPerception(input.importerProfile, input.isUsed);
  const percRate = overrides?.perceptionRate != null ? overrides.perceptionRate : percDefault.rate;
  const percRule = overrides?.perceptionRate != null ? (percRate === 0 ? 'Percepción override: 0%' : 'Percepción override') : percDefault.rule;

  const percepBase = round2(igvBase + igv16 + ipm2 + adcvdTotal);
  const percepAmt  = round2(percepBase * percRate);

  // SDA — si hay override, úsalo; si no, regla UIT
  let sdaApplies = false;
  let sdaAmt = 0;
  if (overrides?.sdaUsd != null) {
    sdaApplies = overrides.sdaUsd > 0;
    sdaAmt = round2(overrides.sdaUsd * input.fxRate);
  } else {
    sdaApplies = cifPEN > prof.adminFees.uit * prof.adminFees.thresholdUIT;
    sdaAmt = sdaApplies ? round2(prof.adminFees.uit * prof.adminFees.sdaRate) : 0;
  }

  // Totales
  const deuda = round2(dArancel + iscTotal + igvTot + adcvdTotal + sdaAmt);
  const pagoFrontera = round2(deuda + percepAmt);

  // Notas permisos
  if (prof.permits.length) {
    for (const p of prof.permits) {
      notes.push(`Permiso: ${p.authority}${p.note ? ' - ' + p.note : ''}`);
    }
  }

  return {
    cif_pen: cifPEN,
    arancel: { rate: advalRate, base: cifPEN, amount: dArancel },
    isc: { mode: iscDetail.mode, details: iscDetail, total: iscTotal },
    trade_remedies: { applied: adcvdItems.length > 0, items: adcvdItems, total: adcvdTotal },
    igv: {
      base: igvBase,
      igv16,
      ipm2,
      total: igvTot,
      rate: 0.18,      // informativo
      amount: igvTot,  // compatibilidad
      exempt: prof.vatExempt
    },
    percepcion: { rate: percRate, base: percepBase, amount: percepAmt, rule: percRule },
    sda: { applies: sdaApplies, amount: sdaAmt },
    deuda_aduanera: deuda,
    pago_en_frontera: pagoFrontera,
    notes
  };
}
