// routes/exchangeRate.routes.ts

import { Router } from 'express';
import { ExchangeRateController } from '../controllers/exchangeRate.controller';
import { requireAuth } from '../middlewares/requireAuth'; // ✅ IMPORTACIÓN CORRECTA

const router = Router();

/**
 * @swagger
 * /api/exchange-rate:
 *   get:
 *     summary: Obtener tipo de cambio actual
 *     description: Retorna el tipo de cambio actual entre USD y PEN.
 *     tags:
 *       - Exchange Rate
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tipo de cambio obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 usdToPen:
 *                   type: number
 *                   example: 3.85
 *                 penToUsd:
 *                   type: number
 *                   example: 0.26
 *       401:
 *         description: No autorizado
 */
// Público: el frontend lo consulta al iniciar, antes de tener token
router.get('/', ExchangeRateController.getExchangeRate);

/**
 * @swagger
 * /api/exchange-rate/convert:
 *   post:
 *     summary: Convertir un monto entre USD y PEN
 *     description: Convierte un monto entre USD y PEN usando el tipo de cambio actual.
 *     tags:
 *       - Exchange Rate
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - from
 *               - to
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 100
 *               from:
 *                 type: string
 *                 enum: [USD, PEN]
 *                 example: USD
 *               to:
 *                 type: string
 *                 enum: [USD, PEN]
 *                 example: PEN
 *     responses:
 *       200:
 *         description: Conversión exitosa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 convertedAmount:
 *                   type: number
 *                   example: 385
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 */
router.post('/convert', requireAuth, ExchangeRateController.convertCurrency);

/**
 * @swagger
 * /api/exchange-rate/cache:
 *   delete:
 *     summary: Invalidar caché del tipo de cambio
 *     description: Elimina el caché del tipo de cambio para forzar su actualización.
 *     tags:
 *       - Exchange Rate
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Caché invalidado exitosamente
 *       401:
 *         description: No autorizado
 */
router.delete('/cache', requireAuth, ExchangeRateController.invalidateCache);

export default router;