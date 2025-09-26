import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { ExportacionController } from '../controllers/exportacion.controller';

const router = Router();
router.use(requireAuth);

/**
 * @openapi
 * tags:
 *   - name: Exportaciones
 *     description: Gestión de operaciones de exportación y ventas nacionales.
 */

/**
 * @openapi
 * /api/exportaciones:
 *   get:
 *     tags:
 *       - Exportaciones
 *     summary: Lista las exportaciones del usuario.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: caso_estudio_id
 *         schema:
 *           type: integer
 *         description: ID del caso de estudio para filtrar las exportaciones.
 *     responses:
 *       '200':
 *         description: OK
 */
router.get('/', ExportacionController.listarExportaciones);

/**
 * @openapi
 * /api/exportaciones:
 *   post:
 *     tags:
 *       - Exportaciones
 *     summary: Crea un nuevo registro de exportación.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - caso_estudio_id
 *               - descripcion_venta
 *               - valor_venta
 *               - moneda
 *             properties:
 *               caso_estudio_id:
 *                 type: integer
 *                 example: 1
 *               es_venta_nacional:
 *                 type: boolean
 *                 description: Marcar como true si es una venta dentro del país.
 *                 example: false
 *               incoterm:
 *                 type: string
 *                 enum: [EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DPU, DAP, DDP]
 *                 description: Incoterm 2020 acordado para la venta.
 *                 example: 'FOB'
 *               descripcion_venta:
 *                 type: string
 *                 description: Descripción clara de la mercancía vendida.
 *                 example: 'Venta de arándanos frescos a EE.UU.'
 *               pais_origen:
 *                 type: string
 *                 description: País de origen de la mercancía (Opcional).
 *                 example: 'Perú'
 *               pais_destino:
 *                 type: string
 *                 description: País de destino de la mercancía (Opcional).
 *                 example: 'Estados Unidos'
 *               valor_venta:
 *                 type: number
 *                 format: float
 *                 description: El valor total de la venta.
 *                 example: 25000.50
 *               moneda:
 *                 type: string
 *                 enum: [USD, PEN]
 *                 example: 'USD'
 *               fecha_operacion:
 *                 type: string
 *                 format: date
 *                 description: Fecha de la operación en formato YYYY-MM-DD.
 *                 example: '2025-10-20'
 *     responses:
 *       '201':
 *         description: Creado exitosamente
 *       '400':
 *         description: Datos inválidos
 *       '404':
 *         description: Caso de estudio no encontrado
 */
router.post('/', ExportacionController.crearExportacion);

/**
 * @openapi
 * /api/exportaciones/{id}:
 *   get:
 *     tags:
 *       - Exportaciones
 *     summary: Obtiene una exportación específica por su ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: OK
 *       '404':
 *         description: No encontrado
 */
router.get('/:id', ExportacionController.obtenerExportacionPorId);

export default router;