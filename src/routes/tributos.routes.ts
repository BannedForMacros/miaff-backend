// src/routes/tributos.routes.ts
import { Router } from 'express';
import { dbQuery } from '../db';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

/**
 * @openapi
 * /api/tributos/advalorem:
 *   get:
 *     tags:
 *       - Tributos
 *     summary: Obtiene la tasa de Ad Valorem para una subpartida específica
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hs10
 *         required: true
 *         schema:
 *           type: string
 *         description: El código de la subpartida de 10 dígitos.
 *     responses:
 *       '200':
 *         description: Tasa encontrada.
 *       '404':
 *         description: Subpartida no encontrada.
 */
router.get('/advalorem', requireAuth, async (req, res) => {
    const hs10 = req.query.hs10 as string;

    if (!hs10 || hs10.length !== 10) {
        return res.status(400).json({ message: 'El parámetro hs10 es requerido y debe tener 10 dígitos.' });
    }

    try {
        const { rows } = await dbQuery<{ tasa: string }>(
            'SELECT tasa FROM miaff.ad_valorem WHERE hs10 = $1',
            [hs10]
        );

        if (rows.length > 0) {
            res.json({ tasa: parseFloat(rows[0].tasa) });
        } else {
            // Es importante devolver un 404 si no se encuentra para que el frontend sepa qué hacer.
            res.status(404).json({ message: 'Subpartida no encontrada en la base de datos de Ad Valorem.' });
        }
    } catch (error) {
        console.error('Error fetching Ad Valorem:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

export default router;