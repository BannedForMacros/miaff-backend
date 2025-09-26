import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { GastoController } from '../controllers/gastos.controller';

const router = Router();
router.use(requireAuth);

/**
 * @openapi
 * tags:
 *   - name: Gastos
 *     description: Gestión de gastos asociados a un caso de estudio.
 */

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: Ingresa tu token JWT (sin 'Bearer ')
 *   schemas:
 *     CrearGastoInput:
 *       type: object
 *       required:
 *         - caso_estudio_id
 *         - clasificacion_id
 *         - descripcion
 *         - monto
 *         - moneda
 *       properties:
 *         caso_estudio_id:
 *           type: integer
 *           example: 1
 *         clasificacion_id:
 *           type: integer
 *           description: ID de la clasificación del gasto (obtenido del catálogo).
 *           example: 2
 *         descripcion:
 *           type: string
 *           example: "Pago de transporte"
 *         cuenta_contable_codigo:
 *           type: string
 *           description: Código de la cuenta contable (opcional).
 *           example: "6241"
 *         monto:
 *           type: number
 *           format: float
 *           example: 1500.75
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           example: "PEN"
 *         fecha_gasto:
 *           type: string
 *           format: date
 *           description: Fecha del gasto (opcional, formato YYYY-MM-DD).
 *           example: "2025-09-17"
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "No autorizado"
 * security:
 *   - bearerAuth: []
 */

/**
 * @openapi
 * /api/gastos/clasificaciones:
 *   get:
 *     tags:
 *       - Gastos
 *     summary: Obtiene el catálogo de clasificaciones de gastos disponibles.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Lista de clasificaciones.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   nombre:
 *                     type: string
 *                     example: "Transporte"
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/clasificaciones', GastoController.listarClasificaciones);

/**
 * @openapi
 * /api/gastos:
 *   post:
 *     tags:
 *       - Gastos
 *     summary: Crea un nuevo gasto y lo asocia a un caso de estudio.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearGastoInput'
 *     responses:
 *       '201':
 *         description: Gasto creado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 caso_estudio_id:
 *                   type: integer
 *                   example: 1
 *                 clasificacion_id:
 *                   type: integer
 *                   example: 2
 *                 descripcion:
 *                   type: string
 *                   example: "Pago de transporte"
 *                 monto:
 *                   type: string
 *                   example: "1500.75"
 *                 moneda:
 *                   type: string
 *                   example: "PEN"
 *                 fecha_gasto:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-09-17T00:00:00.000Z"
 *       '400':
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Datos inválidos"
 *                 errors:
 *                   type: object
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *         description: Caso de estudio no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "El caso de estudio no existe o no te pertenece."
 */
router.post('/', GastoController.crearGasto);

/**
 * @openapi
 * /api/gastos:
 *   get:
 *     tags:
 *       - Gastos
 *     summary: Lista todos los gastos de un caso de estudio específico.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: caso_estudio_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del caso de estudio
 *         example: 1
 *     responses:
 *       '200':
 *         description: Lista de gastos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   caso_estudio_id:
 *                     type: integer
 *                     example: 1
 *                   clasificacion_id:
 *                     type: integer
 *                     example: 2
 *                   nombre_clasificacion:
 *                     type: string
 *                     example: "Transporte"
 *                   descripcion:
 *                     type: string
 *                     example: "Pago de transporte"
 *                   monto:
 *                     type: string
 *                     example: "1500.75"
 *                   moneda:
 *                     type: string
 *                     example: "PEN"
 *                   fecha_gasto:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-09-17T00:00:00.000Z"
 *       '400':
 *         description: ID del caso de estudio requerido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "El ID del caso de estudio es requerido en la consulta."
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', GastoController.listarGastos);

/**
 * @openapi
 * /api/gastos/{id}:
 *   delete:
 *     tags:
 *       - Gastos
 *     summary: Elimina un gasto específico por su ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del gasto a eliminar
 *         example: 1
 *     responses:
 *       '204':
 *         description: Gasto eliminado exitosamente.
 *       '400':
 *         description: ID de gasto inválido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "El ID del gasto es inválido."
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *         description: Gasto no encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Gasto no encontrado o no te pertenece."
 */
router.delete('/:id', GastoController.eliminarGasto);

export default router;