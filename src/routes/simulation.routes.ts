import { Router } from 'express';
import { z } from 'zod';
import { loadRuleProfile, simulate } from '../services/simulation.service';

const router = Router();

// ── schema de entrada (acepta overrides) ───────────────────────────────────────
const overridesSchema = z.object({
  adValoremRate: z.number().min(0).max(1).optional(),
  antidumpingUsd: z.number().min(0).optional(),
  countervailingUsd: z.number().min(0).optional(),
  perceptionRate: z.number().min(0).max(1).optional(),
  sdaUsd: z.number().min(0).optional(),
}).optional();

const bodySchema = z.object({
  hs10: z.string().min(8),                 // con o sin puntos
  originCountry: z.string().length(2),     // 'CN', 'CL', etc.
  useFTA: z.boolean().optional(),
  currency: z.string().optional(),
  fxRate: z.number().positive(),

  cif: z.number().min(0).optional(),
  fob: z.number().min(0).optional(),
  freight: z.number().min(0).optional(),
  insurance: z.number().min(0).optional(),

  quantity: z.number().min(0).optional(),
  quantityUnit: z.string().optional(),

  isUsed: z.boolean().optional(),
  importerProfile: z.enum(['normal','first_import','no_habido','public','amazon']).optional(),

  alcoholDegree: z.number().min(0).optional(),

  // ⬇️ overrides sí o sí se leen del body
  overrides: overridesSchema,
});

// ── POST /api/simulations/quote ───────────────────────────────────────────────
/**
 * @openapi
 * /api/simulations/quote:
 *   post:
 *     tags: [Simulations]
 *     summary: "Ejecuta una simulación (no guarda historial)"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hs10: { type: string, example: "4819.10.00.00" }
 *               originCountry: { type: string, example: "CN" }
 *               useFTA: { type: boolean, example: false }
 *               fxRate: { type: number, example: 1 }
 *               fob: { type: number, example: 167133 }
 *               freight: { type: number, example: 22656 }
 *               insurance: { type: number, example: 284 }
 *               importerProfile: { type: string, example: "normal" }
 *               overrides:
 *                 type: object
 *                 properties:
 *                   adValoremRate: { type: number, example: 0.06 }
 *                   antidumpingUsd: { type: number, example: 300 }
 *                   countervailingUsd: { type: number, example: 100 }
 *                   perceptionRate: { type: number, example: 0.035 }
 *                   sdaUsd: { type: number, example: 53 }
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

  // normalizar HS: quitar puntos, espacios u otros no dígitos
  const hsNormalized = data.hs10.replace(/\D/g, '');

  try {
    const profile = await loadRuleProfile(hsNormalized, data.originCountry);

    const result = simulate(
      {
        hs10: hsNormalized,
        originCountry: data.originCountry,
        useFTA: data.useFTA,
        currency: data.currency,
        fxRate: data.fxRate,
        cif: data.cif,
        fob: data.fob,
        freight: data.freight,
        insurance: data.insurance,
        quantity: data.quantity,
        quantityUnit: data.quantityUnit,
        isUsed: data.isUsed,
        importerProfile: data.importerProfile,
        alcoholDegree: data.alcoholDegree,
      },
      profile,
      data.overrides            // ⬅️ ahora sí se aplican los overrides
    );

    return res.json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ message: err?.message ?? 'No se pudo simular' });
  }
});

export default router;
