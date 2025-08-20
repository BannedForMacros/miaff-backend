import { Router } from 'express';
import { z } from 'zod';
import { loadRuleProfile, simulate } from '../services/simulation.service';

const router = Router();
const normalizeHS = (s: string) => s.replace(/\D/g, '');

// ────────────────────────────────────────────────────────────────
// JSON mode (ya lo tenías)
const overridesSchema = z.object({
  adValoremRate:     z.number().min(0).max(1).optional(),
  antidumpingUsd:    z.number().min(0).optional(),
  countervailingUsd: z.number().min(0).optional(),
  perceptionRate:    z.number().min(0).max(1).optional(),
  sdaUsd:            z.number().min(0).optional(),
}).optional();

const bodySchema = z.object({
  hs10:            z.string().min(8),
  originCountry:   z.string().length(2),
  useFTA:          z.boolean().optional(),
  currency:        z.string().optional(),
  fxRate:          z.number().positive(),

  cif:             z.number().min(0).optional(),
  fob:             z.number().min(0).optional(),
  freight:         z.number().min(0).optional(),
  insurance:       z.number().min(0).optional(),

  quantity:        z.number().min(0).optional(),
  quantityUnit:    z.string().optional(),

  isUsed:          z.boolean().optional(),
  importerProfile: z.enum(['normal','first_import','no_habido','public','amazon']).optional(),

  alcoholDegree:   z.number().min(0).optional(),
  overrides:       overridesSchema,
}).superRefine((val, ctx) => {
  const hasCIF = typeof val.cif === 'number';
  const hasFFS = typeof val.fob === 'number'
              && typeof val.freight === 'number'
              && typeof val.insurance === 'number';
  if (!hasCIF && !hasFFS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Debes enviar CIF o (FOB + Freight + Insurance).', path: ['cif'] });
  }
});

/**
 * @openapi
 * /api/simulations/quote:
 *   post:
 *     tags: [Simulations]
 *     summary: "Ejecuta una simulación (JSON)"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SimQuoteJson' }
 *     responses:
 *       200: { description: "OK" }
 *       400: { description: "Datos inválidos" }
 */
router.post('/quote', async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });
  }
  const data = parsed.data;
  const hsNormalized = normalizeHS(data.hs10);
  try {
    const profile = await loadRuleProfile(hsNormalized, data.originCountry);
    const result = simulate({
      hs10: hsNormalized,
      originCountry: data.originCountry,
      useFTA: data.useFTA,
      currency: data.currency,
      fxRate: data.fxRate,
      cif: data.cif,
      fob: data.fob, freight: data.freight, insurance: data.insurance,
      quantity: data.quantity, quantityUnit: data.quantityUnit,
      isUsed: data.isUsed, importerProfile: data.importerProfile,
      alcoholDegree: data.alcoholDegree,
    }, profile, data.overrides);
    return res.json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ message: err?.message ?? 'No se pudo simular' });
  }
});

// ────────────────────────────────────────────────────────────────
// FORM mode (para Swagger como campos individuales)
/**
 * Acepta application/x-www-form-urlencoded. Usamos z.coerce.* para transformar strings a números/booleans.
 */
const formSchema = z.object({
  hs10:            z.string().min(8),
  originCountry:   z.string().length(2),
  useFTA:          z.coerce.boolean().optional(),
  currency:        z.string().optional(),
  fxRate:          z.coerce.number().positive(),

  cif:             z.coerce.number().optional(),
  fob:             z.coerce.number().optional(),
  freight:         z.coerce.number().optional(),
  insurance:       z.coerce.number().optional(),

  quantity:        z.coerce.number().optional(),
  quantityUnit:    z.string().optional(),

  isUsed:          z.coerce.boolean().optional(),
  importerProfile: z.enum(['normal','first_import','no_habido','public','amazon']).optional(),

  alcoholDegree:   z.coerce.number().optional(),

  // overrides planos (no anidados)
  override_adValoremRate:     z.coerce.number().optional(),
  override_antidumpingUsd:    z.coerce.number().optional(),
  override_countervailingUsd: z.coerce.number().optional(),
  override_perceptionRate:    z.coerce.number().optional(),
  override_sdaUsd:            z.coerce.number().optional(),
}).superRefine((val, ctx) => {
  const hasCIF = !isNaN(Number(val.cif));
  const hasFFS = !isNaN(Number(val.fob)) && !isNaN(Number(val.freight)) && !isNaN(Number(val.insurance));
  if (!hasCIF && !hasFFS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Debes enviar CIF o (FOB + Freight + Insurance).', path: ['cif'] });
  }
});

/**
 * @openapi
 * /api/simulations/quote-form:
 *   post:
 *     tags: [Simulations]
 *     summary: "Ejecuta una simulación (formulario, ideal para Swagger)"
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               hs10:           { type: string, example: "4819.10.00.00" }
 *               originCountry:  { type: string, example: "CN" }
 *               useFTA:         { type: boolean, example: false }
 *               fxRate:         { type: number, example: 1 }
 *               cif:            { type: number, example: 190073 }
 *               fob:            { type: number, example: 167133 }
 *               freight:        { type: number, example: 22656 }
 *               insurance:      { type: number, example: 284 }
 *               quantity:       { type: number, example: 0 }
 *               importerProfile:
 *                 type: string
 *                 enum: [normal, first_import, no_habido, public, amazon]
 *                 example: normal
 *               override_adValoremRate:     { type: number, example: 0.06 }
 *               override_antidumpingUsd:    { type: number, example: 300 }
 *               override_countervailingUsd: { type: number, example: 100 }
 *               override_perceptionRate:    { type: number, example: 0.035 }
 *               override_sdaUsd:            { type: number, example: 53 }
 *     responses:
 *       200: { description: "OK" }
 *       400: { description: "Datos inválidos" }
 */
router.post('/quote-form', async (req, res) => {
  const parsed = formSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });
  }
  const f = parsed.data;
  const hsNormalized = normalizeHS(f.hs10);
  try {
    const profile = await loadRuleProfile(hsNormalized, f.originCountry);

    const overrides =
      (f.override_adValoremRate ||
       f.override_antidumpingUsd ||
       f.override_countervailingUsd ||
       f.override_perceptionRate ||
       f.override_sdaUsd) ? {
         adValoremRate:     f.override_adValoremRate,
         antidumpingUsd:    f.override_antidumpingUsd,
         countervailingUsd: f.override_countervailingUsd,
         perceptionRate:    f.override_perceptionRate,
         sdaUsd:            f.override_sdaUsd,
       } : undefined;

    const result = simulate({
      hs10: hsNormalized,
      originCountry: f.originCountry,
      useFTA: f.useFTA,
      currency: f.currency,
      fxRate: f.fxRate,
      cif: f.cif,
      fob: f.fob, freight: f.freight, insurance: f.insurance,
      quantity: f.quantity, quantityUnit: f.quantityUnit,
      isUsed: f.isUsed, importerProfile: f.importerProfile,
      alcoholDegree: f.alcoholDegree,
    }, profile, overrides);

    return res.json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ message: err?.message ?? 'No se pudo simular' });
  }
});

// ────────────────────────────────────────────────────────────────
// Preprofile para pintar el wizard
/**
 * @openapi
 * /api/simulations/preprofile:
 *   get:
 *     tags: [Simulations]
 *     summary: "Perfil de reglas (MFN/TLC, ISC, IGV/IPM, remedios, UIT/SDA)"
 *     parameters:
 *       - in: query
 *         name: hs10
 *         schema: { type: string }
 *         required: true
 *       - in: query
 *         name: originCountry
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200: { description: "OK" }
 *       400: { description: "Datos inválidos" }
 */
router.get('/preprofile', async (req, res) => {
  const schema = z.object({ hs10: z.string().min(8), originCountry: z.string().length(2) });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });
  const hs = normalizeHS(parsed.data.hs10);
  try {
    const prof = await loadRuleProfile(hs, parsed.data.originCountry);
    res.json({
      hs10: prof.hs10,
      description: prof.description,
      mfnRate: prof.mfnRate,
      ftaAvailable: prof.ftaRate !== null,
      isc: prof.iscRule ? { system: prof.iscRule.system, unit: prof.iscRule.unit } : { system: 'none' as const },
      vatExempt: prof.vatExempt,
      tradeRemedies: prof.tradeRemedies.map(t => ({ type: t.type, mode: t.mode })),
      adminFees: prof.adminFees,
    });
  } catch (e:any) {
    res.status(400).json({ message: e?.message ?? 'No se pudo cargar el preperfil' });
  }
});

export default router;

/**
 * @openapi
 * components:
 *   schemas:
 *     SimQuoteJson:
 *       type: object
 *       properties:
 *         hs10: { type: string, example: "4819.10.00.00" }
 *         originCountry: { type: string, example: "CN" }
 *         useFTA: { type: boolean, example: false }
 *         fxRate: { type: number, example: 1 }
 *         cif: { type: number, example: 190073 }
 *         fob: { type: number, example: 167133 }
 *         freight: { type: number, example: 22656 }
 *         insurance: { type: number, example: 284 }
 *         quantity: { type: number, example: 0 }
 *         importerProfile:
 *           type: string
 *           enum: [normal, first_import, no_habido, public, amazon]
 *           example: normal
 *         overrides:
 *           type: object
 *           properties:
 *             adValoremRate:     { type: number, example: 0.06 }
 *             antidumpingUsd:    { type: number, example: 300 }
 *             countervailingUsd: { type: number, example: 100 }
 *             perceptionRate:    { type: number, example: 0.035 }
 *             sdaUsd:            { type: number, example: 53 }
 */
