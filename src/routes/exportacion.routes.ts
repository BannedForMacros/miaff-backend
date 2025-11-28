import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { ExportacionController } from '../controllers/exportacion.controller';


const router = Router();
router.get('/tipos-producto', ExportacionController.listarTiposProducto);




router.use(requireAuth);
router.get('/asientos-contables', ExportacionController.listarAsientosPorCaso);
router.get('/:id/asiento-contable', ExportacionController.obtenerAsientoContable);
router.post('/:id/regenerar-asiento', ExportacionController.regenerarAsientoContable);

/**
 * @openapi
 * components:
 *   schemas:
 *     Exportacion:
 *       type: object
 *       required:
 *         - caso_estudio_id
 *         - descripcion_venta
 *         - valor_venta
 *         - moneda
 *       properties:
 *         id:
 *           type: integer
 *           description: ID único de la exportación
 *           example: 1
 *         caso_estudio_id:
 *           type: integer
 *           description: ID del caso de estudio asociado
 *           example: 5
 *         user_id:
 *           type: string
 *           description: ID del usuario propietario
 *           example: "b1a17cbb-07ca-4e8c-938e-452b0a8e2f9e"
 *         es_venta_nacional:
 *           type: boolean
 *           description: Indica si es una venta nacional
 *           example: false
 *         incoterm:
 *           type: string
 *           enum: [EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DPU, DAP, DDP]
 *           description: Término internacional de comercio (Incoterm 2020)
 *           example: "FOB"
 *         descripcion_venta:
 *           type: string
 *           description: Descripción detallada de la mercancía vendida
 *           example: "Venta de arándanos frescos a Estados Unidos"
 *         pais_origen:
 *           type: string
 *           description: País de origen de la mercancía
 *           example: "Perú"
 *         pais_destino:
 *           type: string
 *           description: País de destino de la mercancía
 *           example: "Estados Unidos"
 *         valor_venta:
 *           type: number
 *           format: float
 *           description: Valor total de la venta
 *           example: 25000.50
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           description: Moneda de la transacción
 *           example: "USD"
 *         fecha_operacion:
 *           type: string
 *           format: date
 *           description: Fecha de la operación
 *           example: "2025-10-20"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación del registro
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 *         activo:
 *           type: boolean
 *           description: Indica si el registro está activo
 *           example: true
 *
 *     CrearExportacionRequest:
 *       type: object
 *       required:
 *         - caso_estudio_id
 *         - descripcion_venta
 *         - valor_venta
 *         - moneda
 *       properties:
 *         caso_estudio_id:
 *           type: integer
 *           example: 1
 *         es_venta_nacional:
 *           type: boolean
 *           description: Marcar como true si es una venta dentro del país
 *           example: false
 *         incoterm:
 *           type: string
 *           enum: [EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DPU, DAP, DDP]
 *           description: Incoterm 2020 acordado para la venta
 *           example: "FOB"
 *         descripcion_venta:
 *           type: string
 *           description: Descripción clara de la mercancía vendida
 *           example: "Venta de arándanos frescos a EE.UU."
 *         pais_origen:
 *           type: string
 *           description: País de origen de la mercancía (Opcional)
 *           example: "Perú"
 *         pais_destino:
 *           type: string
 *           description: País de destino de la mercancía (Opcional)
 *           example: "Estados Unidos"
 *         valor_venta:
 *           type: number
 *           format: float
 *           description: El valor total de la venta
 *           example: 25000.50
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           example: "USD"
 *         fecha_operacion:
 *           type: string
 *           format: date
 *           description: Fecha de la operación en formato YYYY-MM-DD
 *           example: "2025-10-20"
 *
 *     ActualizarExportacionRequest:
 *       type: object
 *       properties:
 *         caso_estudio_id:
 *           type: integer
 *           example: 1
 *         es_venta_nacional:
 *           type: boolean
 *           example: false
 *         incoterm:
 *           type: string
 *           enum: [EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DPU, DAP, DDP]
 *           example: "CIF"
 *         descripcion_venta:
 *           type: string
 *           example: "Venta de arándanos frescos a EE.UU. - Actualizado"
 *         pais_origen:
 *           type: string
 *           example: "Perú"
 *         pais_destino:
 *           type: string
 *           example: "Estados Unidos"
 *         valor_venta:
 *           type: number
 *           format: float
 *           example: 30000.00
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           example: "USD"
 *         fecha_operacion:
 *           type: string
 *           format: date
 *           example: "2025-10-25"
 *
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         data:
 *           type: object
 *         success:
 *           type: boolean
 *           example: true
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         errors:
 *           type: object
 *         success:
 *           type: boolean
 *           example: false
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @openapi
 * tags:
 *   - name: Exportaciones
 *     description: Gestión completa de operaciones de exportación y ventas nacionales
 */

/**
 * @openapi
 * /api/exportaciones:
 *   get:
 *     summary: Obtiene la lista de exportaciones del usuario
 *     description: Retorna todas las exportaciones del usuario autenticado, con opción de filtrar por caso de estudio
 *     tags: [Exportaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: caso_estudio_id
 *         schema:
 *           type: integer
 *         description: ID del caso de estudio para filtrar las exportaciones
 *         example: 5
 *     responses:
 *       200:
 *         description: Lista de exportaciones obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Exportacion'
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 3
 *       401:
 *         description: No autorizado - Token inválido o faltante
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', ExportacionController.listarExportaciones);

/**
 * @openapi
 * /api/exportaciones:
 *   post:
 *     summary: Crea un nuevo registro de exportación
 *     description: Crea una nueva exportación con todos los INCOTERMS 2020 disponibles
 *     tags: [Exportaciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearExportacionRequest'
 *     responses:
 *       201:
 *         description: Exportación creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Exportación creada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/Exportacion'
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Caso de estudio no encontrado o no pertenece al usuario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Token inválido o faltante
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', ExportacionController.crearExportacion);

/**
 * @openapi
 * /api/exportaciones/{id}:
 *   get:
 *     summary: Obtiene una exportación específica por su ID
 *     description: Retorna los detalles completos de una exportación específica
 *     tags: [Exportaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la exportación
 *         example: 1
 *     responses:
 *       200:
 *         description: Exportación obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Exportacion'
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: ID inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Exportación no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Token inválido o faltante
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', ExportacionController.obtenerExportacionPorId);

/**
 * @openapi
 * /api/exportaciones/{id}:
 *   put:
 *     summary: Actualiza una exportación existente
 *     description: Permite editar y corregir los datos de una exportación existente
 *     tags: [Exportaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la exportación a actualizar
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActualizarExportacionRequest'
 *     responses:
 *       200:
 *         description: Exportación actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Exportación actualizada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/Exportacion'
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Datos de entrada inválidos o ID inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Exportación no encontrada o caso de estudio no válido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Token inválido o faltante
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/:id', ExportacionController.actualizarExportacion);

/**
 * @openapi
 * /api/exportaciones/{id}:
 *   delete:
 *     summary: Elimina una exportación (eliminación lógica)
 *     description: Realiza una eliminación lógica (soft delete) de la exportación especificada
 *     tags: [Exportaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la exportación a eliminar
 *         example: 1
 *     responses:
 *       200:
 *         description: Exportación eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Exportación eliminada exitosamente"
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: ID inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Exportación no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Token inválido o faltante
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:id', ExportacionController.eliminarExportacion);


export default router;