// src/routes/tutoriales.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { dbQuery } from '../db';
import { requireAuth } from '../middlewares/requireAuth';
import type { JwtUser } from '../utils/token';

const router = Router();

const registroTutorialSchema = z.object({
    modulo: z.enum(['exportacion', 'importacion', 'gastos']),
    tutorial_id: z.string(),
    completado: z.boolean()
});

/**
 * @openapi
 * /api/tutoriales/estado:
 *   get:
 *     tags: [Tutoriales]
 *     summary: Obtiene el estado de todos los tutoriales del usuario
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estado de tutoriales
 */
router.get('/estado', requireAuth, async (req, res) => {
    const user = (req as any).user as JwtUser;

    try {
        const { rows } = await dbQuery(
            `SELECT modulo, tutorial_id, completado, updated_at 
       FROM miaff.tutoriales_usuario 
       WHERE user_id = $1`,
            [user.sub]
        );

        res.json({ tutoriales: rows });
    } catch (error) {
        console.error('Error obteniendo estado de tutoriales:', error);
        res.status(500).json({ message: 'Error al obtener estado de tutoriales' });
    }
});

/**
 * @openapi
 * /api/tutoriales/marcar:
 *   post:
 *     tags: [Tutoriales]
 *     summary: Marca un tutorial como completado o no completado
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modulo
 *               - tutorial_id
 *               - completado
 *             properties:
 *               modulo:
 *                 type: string
 *                 enum: [exportacion, importacion, gastos]
 *               tutorial_id:
 *                 type: string
 *               completado:
 *                 type: boolean
 */
router.post('/marcar', requireAuth, async (req, res) => {
    const parsed = registroTutorialSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });
    }

    const { modulo, tutorial_id, completado } = parsed.data;
    const user = (req as any).user as JwtUser;

    try {
        const { rows } = await dbQuery(
            `INSERT INTO miaff.tutoriales_usuario (user_id, modulo, tutorial_id, completado)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, modulo, tutorial_id) 
       DO UPDATE SET completado = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
            [user.sub, modulo, tutorial_id, completado]
        );

        res.json({ tutorial: rows[0] });
    } catch (error) {
        console.error('Error marcando tutorial:', error);
        res.status(500).json({ message: 'Error al marcar tutorial' });
    }
});

/**
 * @openapi
 * /api/tutoriales/resetear:
 *   post:
 *     tags: [Tutoriales]
 *     summary: Resetea todos los tutoriales de un módulo específico
 *     security:
 *       - bearerAuth: []
 */
router.post('/resetear', requireAuth, async (req, res) => {
    const { modulo } = req.body;
    const user = (req as any).user as JwtUser;

    try {
        if (modulo) {
            await dbQuery(
                `DELETE FROM miaff.tutoriales_usuario 
         WHERE user_id = $1 AND modulo = $2`,
                [user.sub, modulo]
            );
        } else {
            await dbQuery(
                `DELETE FROM miaff.tutoriales_usuario WHERE user_id = $1`,
                [user.sub]
            );
        }

        res.json({ message: 'Tutoriales reseteados correctamente' });
    } catch (error) {
        console.error('Error reseteando tutoriales:', error);
        res.status(500).json({ message: 'Error al resetear tutoriales' });
    }
});

export default router;