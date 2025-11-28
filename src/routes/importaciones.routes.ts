import { Router } from 'express';
import { ImportacionController } from '../controllers/importacion.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

/**
 * @openapi
 * /api/importaciones/tipos-mercancia:
 *   get:
 *     tags: [Importaciones]
 *     summary: Obtiene todos los tipos de mercancía disponibles
 *     responses:
 *       '200':
 *         description: Lista de tipos de mercancía
 */
router.get('/tipos-mercancia', requireAuth, ImportacionController.listarTiposMercancia);


/**
 * @openapi
 * components:
 *   schemas:
 *     Importacion:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         caso_estudio_id:
 *           type: integer
 *           example: 1
 *         user_id:
 *           type: string
 *           format: uuid
 *         subpartida_hs10:
 *           type: string
 *           example: "4819100000"
 *         descripcion_mercancia:
 *           type: string
 *           example: "Cajas de cartón corrugado"
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           example: "USD"
 *         valor_fob:
 *           type: number
 *           example: 1000.00
 *         valor_flete:
 *           type: number
 *           example: 150.00
 *         valor_seguro:
 *           type: number
 *           example: 50.00
 *         valor_cif:
 *           type: number
 *           example: 1200.00
 *         monto_ad_valorem:
 *           type: number
 *           example: 72.00
 *         monto_isc:
 *           type: number
 *           example: 0.00
 *         monto_igv:
 *           type: number
 *           example: 229.68
 *         monto_ipm:
 *           type: number
 *           example: 25.52
 *         monto_percepcion:
 *           type: number
 *           example: 8.04
 *         dta_total:
 *           type: number
 *           example: 335.24
 *         activo:
 *           type: integer
 *           enum: [0, 1]
 *           example: 1
 *           description: "1 = activo, 0 = eliminado"
 *         fecha_operacion:
 *           type: string
 *           format: date
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         nombre_caso:
 *           type: string
 *           example: "Mi caso de estudio"
 *         subpartida_descripcion:
 *           type: string
 *           example: "Cajas de papel o cartón corrugado"
 *     Tributo:
 *       type: object
 *       properties:
 *         concepto:
 *           type: string
 *           example: "igv"
 *         base_imponible:
 *           type: number
 *           example: 1276.00
 *         tasa_aplicada:
 *           type: number
 *           example: 0.18
 *         monto_calculado:
 *           type: number
 *           example: 229.68
 */

/**
 * @openapi
 * /api/importaciones:
 *   get:
 *     tags: [Importaciones]
 *     summary: Obtiene todas las importaciones activas del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: caso_estudio_id
 *         schema:
 *           type: integer
 *         description: Filtrar por caso de estudio
 *     responses:
 *       '200':
 *         description: Lista de importaciones activas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Importacion'
 *       '500':
 *         description: Error interno del servidor
 */
router.get('/', requireAuth, ImportacionController.listarImportaciones);

/**
 * @openapi
 * /api/importaciones:
 *   post:
 *     tags: [Importaciones]
 *     summary: Crea una nueva importación
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
 *               - subpartida_hs10
 *               - descripcion_mercancia
 *               - moneda
 *               - valor_fob
 *               - valor_flete
 *               - valor_seguro
 *             properties:
 *               caso_estudio_id:
 *                 type: integer
 *                 example: 1
 *               subpartida_hs10:
 *                 type: string
 *                 example: "4819100000"
 *               descripcion_mercancia:
 *                 type: string
 *                 example: "Cajas de cartón corrugado"
 *               moneda:
 *                 type: string
 *                 enum: [USD, PEN]
 *                 example: "USD"
 *               valor_fob:
 *                 type: number
 *                 example: 1000.00
 *               valor_flete:
 *                 type: number
 *                 example: 150.00
 *               valor_seguro:
 *                 type: number
 *                 example: 50.00
 *               habilitar_igv:
 *                 type: boolean
 *                 default: true
 *               habilitar_isc:
 *                 type: boolean
 *                 default: false
 *               habilitar_percepcion:
 *                 type: boolean
 *                 default: true
 *               ad_valorem_tasa_manual:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *                 example: 0.06
 *               isc_tasa_ingresada:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *               percepcion_tasa_ingresada:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *                 example: 0.035
 *               antidumping_ingresado:
 *                 type: number
 *                 minimum: 0
 *                 default: 0
 *               compensatorio_ingresado:
 *                 type: number
 *                 minimum: 0
 *                 default: 0
 *               sda_ingresado:
 *                 type: number
 *                 minimum: 0
 *                 default: 0
 *               fecha_operacion:
 *                 type: string
 *                 format: date
 *                 example: "2025-09-16"
 *     responses:
 *       '201':
 *         description: Importación creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Importacion'
 *                 - type: object
 *                   properties:
 *                     tributos:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Tributo'
 *       '400':
 *         description: Datos inválidos
 *       '404':
 *         description: Caso de estudio no encontrado
 *       '500':
 *         description: Error interno del servidor
 */
router.post('/', requireAuth, ImportacionController.crearImportacion);

/**
 * @openapi
 * /api/importaciones/{id}:
 *   get:
 *     tags: [Importaciones]
 *     summary: Obtiene una importación específica
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la importación
 *     responses:
 *       '200':
 *         description: Importación encontrada
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Importacion'
 *                 - type: object
 *                   properties:
 *                     tributos:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Tributo'
 *       '400':
 *         description: ID inválido
 *       '404':
 *         description: Importación no encontrada
 *       '500':
 *         description: Error interno del servidor
 *   put:
 *     tags: [Importaciones]
 *     summary: Actualiza una importación existente
 *     description: Actualiza los datos de una importación y recalcula automáticamente todos los tributos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la importación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               caso_estudio_id:
 *                 type: integer
 *                 example: 1
 *               subpartida_hs10:
 *                 type: string
 *                 example: "4819100000"
 *               descripcion_mercancia:
 *                 type: string
 *                 example: "Cajas de cartón corrugado"
 *               moneda:
 *                 type: string
 *                 enum: [USD, PEN]
 *                 example: "USD"
 *               valor_fob:
 *                 type: number
 *                 example: 1000.00
 *               valor_flete:
 *                 type: number
 *                 example: 150.00
 *               valor_seguro:
 *                 type: number
 *                 example: 50.00
 *               habilitar_igv:
 *                 type: boolean
 *               habilitar_isc:
 *                 type: boolean
 *               habilitar_percepcion:
 *                 type: boolean
 *               ad_valorem_tasa_manual:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *               isc_tasa_ingresada:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *               percepcion_tasa_ingresada:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *               antidumping_ingresado:
 *                 type: number
 *                 minimum: 0
 *               compensatorio_ingresado:
 *                 type: number
 *                 minimum: 0
 *               sda_ingresado:
 *                 type: number
 *                 minimum: 0
 *               fecha_operacion:
 *                 type: string
 *                 format: date
 *     responses:
 *       '200':
 *         description: Importación actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Importacion'
 *                 - type: object
 *                   properties:
 *                     tributos:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Tributo'
 *       '400':
 *         description: Datos inválidos o ID inválido
 *       '404':
 *         description: Importación no encontrada o no autorizada
 *       '500':
 *         description: Error interno del servidor
 *   delete:
 *     tags: [Importaciones]
 *     summary: Elimina una importación (soft delete)
 *     description: Marca la importación como inactiva (activo = 0) en lugar de eliminarla físicamente
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la importación
 *     responses:
 *       '204':
 *         description: Importación eliminada exitosamente
 *       '400':
 *         description: ID inválido
 *       '404':
 *         description: Importación no encontrada o no autorizada
 *       '500':
 *         description: Error interno del servidor
 */

/**
 * @openapi
 * /api/importaciones/{id}/asiento-contable:
 *   get:
 *     tags:
 *       - Importaciones
 *     summary: Obtiene el asiento contable de una importación específica
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la importación
 *     responses:
 *       '200':
 *         description: Asiento contable generado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 lineas:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       cuenta:
 *                         type: string
 *                       denominacion:
 *                         type: string
 *                       debe:
 *                         type: number
 *                       haber:
 *                         type: number
 *                 totalDebe:
 *                   type: number
 *                 totalHaber:
 *                   type: number
 *       '404':
 *         description: Importación no encontrada
 */
router.get('/:id/asiento-contable', requireAuth, ImportacionController.obtenerAsientoContable);
router.get('/:id', requireAuth, ImportacionController.obtenerImportacion);
router.put('/:id', requireAuth, ImportacionController.actualizarImportacion);
router.delete('/:id', requireAuth, ImportacionController.eliminarImportacion);

export default router;