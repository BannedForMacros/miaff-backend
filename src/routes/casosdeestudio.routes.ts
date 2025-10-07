// src/routes/casosDeEstudio.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { dbQuery } from '../db';
import { requireAuth } from '../middlewares/requireAuth';
import type { JwtUser } from '../utils/token';

const router = Router();

// =======================================================================
//  ESQUEMAS DE VALIDACIÓN CON ZOD
// =======================================================================

const createCasoSchema = z.object({
    nombre_caso: z.string({ required_error: 'El nombre es obligatorio' }).min(3, 'El nombre debe tener al menos 3 caracteres'),
    descripcion: z.string().optional(),
});

const updateCasoSchema = z.object({
    nombre_caso: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').optional(),
    descripcion: z.string().optional(),
    estado: z.enum(['abierto', 'cerrado']).optional(),
});

// =======================================================================
//  DEFINICIÓN DE SWAGGER (CORREGIDA Y AGRUPADA POR RUTA)
// =======================================================================

/**
 * @openapi
 * tags:
 *   - name: Casos de Estudio
 *     description: API para gestionar los casos de estudio de un usuario.
 *
 * components:
 *   schemas:
 *     CasoDeEstudio:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         user_id:
 *           type: string
 *           format: uuid
 *         nombre_caso:
 *           type: string
 *           example: "Caso de Importación de Vinos 2025"
 *         descripcion:
 *           type: string
 *           example: "Simulación de la importación de vinos desde Chile."
 *         estado:
 *           type: string
 *           enum: [abierto, cerrado, eliminado]
 *           example: "abierto"
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @openapi
 * /api/casos-de-estudio:
 *   get:
 *     tags: [Casos de Estudio]
 *     summary: Obtiene la lista de todos los casos de estudio del usuario autenticado (excluye eliminados).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CasoDeEstudio'
 *   post:
 *     tags: [Casos de Estudio]
 *     summary: Crea un nuevo caso de estudio para el usuario autenticado.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre_caso
 *             properties:
 *               nombre_caso:
 *                 type: string
 *                 example: "Caso de Importación de Vinos 2025"
 *               descripcion:
 *                 type: string
 *                 example: "Simulación de la importación de vinos desde Chile."
 *     responses:
 *       '201':
 *         description: Creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CasoDeEstudio'
 *       '400':
 *         description: Datos inválidos
 */
router.get('/', requireAuth, async (req, res) => {
    const user = (req as any).user as JwtUser;
    try {
        const { rows } = await dbQuery(
            `SELECT * FROM miaff.casos_de_estudio
             WHERE user_id = $1 AND estado != 'eliminado'
             ORDER BY created_at DESC`,
            [user.sub]
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener los casos de estudio' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    const parsed = createCasoSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });
    }

    const { nombre_caso, descripcion } = parsed.data;
    const user = (req as any).user as JwtUser;

    try {
        const { rows } = await dbQuery(
            `INSERT INTO miaff.casos_de_estudio (user_id, nombre_caso, descripcion)
             VALUES ($1, $2, $3)
                 RETURNING *`,
            [user.sub, nombre_caso, descripcion || null]
        );
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al crear el caso de estudio' });
    }
});

/**
 * @openapi
 * /api/casos-de-estudio/{id}:
 *   put:
 *     tags: [Casos de Estudio]
 *     summary: Actualiza un caso de estudio específico.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre_caso:
 *                 type: string
 *               descripcion:
 *                 type: string
 *               estado:
 *                 type: string
 *                 enum: [abierto, cerrado]
 *     responses:
 *       '200':
 *         description: Actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CasoDeEstudio'
 *       '404':
 *         description: No encontrado
 *   delete:
 *     tags: [Casos de Estudio]
 *     summary: Marca un caso de estudio como eliminado (soft delete).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '204':
 *         description: Eliminado exitosamente
 *       '404':
 *         description: No encontrado
 */

// PUT - Actualizar caso de estudio
router.put('/:id', requireAuth, async (req, res) => {
    const { id } = req.params;

    // Validar que el ID sea un número válido
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
        return res.status(400).json({ message: 'El ID proporcionado no es un número válido.' });
    }

    const parsed = updateCasoSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });
    }

    const { nombre_caso, descripcion, estado } = parsed.data;
    const user = (req as any).user as JwtUser;

    try {
        // Primero verificar que el caso existe y no está eliminado
        const { rows: checkRows } = await dbQuery(
            `SELECT id FROM miaff.casos_de_estudio
             WHERE id = $1 AND user_id = $2 AND estado != 'eliminado'`,
            [numericId, user.sub]
        );

        if (checkRows.length === 0) {
            return res.status(404).json({
                message: 'Caso de estudio no encontrado, no autorizado o ya fue eliminado.'
            });
        }

        // Actualizar el caso
        const { rows } = await dbQuery(
            `UPDATE miaff.casos_de_estudio
       SET
         nombre_caso = COALESCE($1, nombre_caso),
         descripcion = COALESCE($2, descripcion),
         estado = COALESCE($3, estado),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
            [nombre_caso, descripcion, estado, numericId, user.sub]
        );

        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el caso de estudio' });
    }
});

// DELETE - Soft delete (cambiar estado a "eliminado")
router.delete('/:id', requireAuth, async (req, res) => {
    const { id } = req.params;

    // Validar que el ID sea un número válido
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
        return res.status(400).json({ message: 'El ID proporcionado no es un número válido.' });
    }

    const user = (req as any).user as JwtUser;

    try {
        // Primero verificar que el caso existe y no está eliminado
        const { rows: checkRows } = await dbQuery(
            `SELECT id FROM miaff.casos_de_estudio
             WHERE id = $1 AND user_id = $2 AND estado != 'eliminado'`,
            [numericId, user.sub]
        );

        if (checkRows.length === 0) {
            return res.status(404).json({
                message: 'Caso de estudio no encontrado, no autorizado o ya fue eliminado.'
            });
        }

        // Marcar como eliminado (soft delete)
        await dbQuery(
            `UPDATE miaff.casos_de_estudio
       SET estado = 'eliminado', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
            [numericId, user.sub]
        );

        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar el caso de estudio' });
    }
});

export default router;