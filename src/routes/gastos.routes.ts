// routes/gastos.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { GastoController } from '../controllers/gastos.controller';

const router = Router();
router.use(requireAuth);

/**
 * @openapi
 * tags:
 *   - name: Gastos
 *     description: >
 *       Gestión integral de gastos asociados a casos de estudio de comercio exterior.
 *       Incluye clasificación por tipo (operativo, administrativo, ventas, financiero),
 *       cálculo de tributos (ESSALUD, ONP, AFP, IGV), generación de asientos contables
 *       y análisis de ratios financieros.
 */

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: Token JWT de autenticación (sin prefijo 'Bearer')
 *
 *   schemas:
 *     ClasificacionGasto:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         nombre:
 *           type: string
 *           example: "Remuneraciones directas al producto"
 *         cuenta_contable:
 *           type: string
 *           example: "621.1"
 *         tipo_gasto:
 *           type: string
 *           enum: [OPERATIVO, ADMINISTRATIVO, VENTA, FINANCIERO]
 *           example: "OPERATIVO"
 *         calcula_igv:
 *           type: boolean
 *           example: false
 *         igv_opcional:
 *           type: boolean
 *           description: Indica si el usuario puede decidir si aplica IGV o no
 *           example: true
 *
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
 *           description: ID del caso de estudio asociado
 *           example: 1
 *         clasificacion_id:
 *           type: integer
 *           description: ID de la clasificación del gasto (del catálogo)
 *           example: 2
 *         descripcion:
 *           type: string
 *           minLength: 3
 *           description: Descripción detallada del gasto
 *           example: "Pago de transporte de mercadería"
 *         monto:
 *           type: number
 *           format: float
 *           minimum: 0.01
 *           description: Monto del gasto (sin IGV si aplica)
 *           example: 1500.75
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           example: "PEN"
 *         incluye_igv:
 *           type: boolean
 *           nullable: true
 *           description: Solo aplica si la clasificación tiene igv_opcional=true. Indica si el monto incluye IGV.
 *           example: true
 *
 *     DatosFinancierosResponse:
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
 *           example: "user_123"
 *         activos_totales:
 *           type: string
 *           example: "500000"
 *         patrimonio:
 *           type: string
 *           example: "300000"
 *         moneda:
 *           type: string
 *           example: "PEN"
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     RatiosFinancieros:
 *       type: object
 *       properties:
 *         margen_bruto_porcentaje:
 *           type: number
 *           description: (Utilidad Bruta / Ventas) * 100
 *           example: 45.5
 *         margen_operativo_porcentaje:
 *           type: number
 *           description: (Utilidad Operativa / Ventas) * 100
 *           example: 25.3
 *         margen_neto_porcentaje:
 *           type: number
 *           description: (Utilidad Neta / Ventas) * 100
 *           example: 17.8
 *         rentabilidad_sobre_ventas_ros:
 *           type: number
 *           description: ROS - (Utilidad Neta / Ventas) * 100
 *           example: 17.8
 *         rentabilidad_sobre_activos_roa:
 *           type: number
 *           description: ROA - (Utilidad Neta / Activos Totales) * 100
 *           example: 8.9
 *         rentabilidad_sobre_patrimonio_roe:
 *           type: number
 *           description: ROE - (Utilidad Neta / Patrimonio) * 100
 *           example: 14.8
 *         ventas_totales_sin_igv:
 *           type: number
 *           example: 250000
 *         utilidad_bruta:
 *           type: number
 *           example: 113750
 *         utilidad_operativa:
 *           type: number
 *           example: 63250
 *         utilidad_neta:
 *           type: number
 *           example: 44591.25
 *         activos_totales:
 *           type: number
 *           example: 500000
 *         patrimonio:
 *           type: number
 *           example: 300000
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Error en la operación"
 *         errors:
 *           type: object
 *           description: Detalles de errores de validación (opcional)
 *
 * security:
 *   - bearerAuth: []
 */

// ==================== CLASIFICACIONES ====================

/**
 * @openapi
 * /api/gastos/clasificaciones:
 *   get:
 *     tags:
 *       - Gastos
 *     summary: Lista todas las clasificaciones de gastos disponibles
 *     description: >
 *       Retorna el catálogo completo de clasificaciones de gastos organizadas por tipo
 *       (OPERATIVO, ADMINISTRATIVO, VENTA, FINANCIERO) con sus cuentas contables asociadas
 *       según el Plan Contable General Empresarial peruano.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Lista de clasificaciones exitosa
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ClasificacionGasto'
 *       '401':
 *         description: No autorizado - Token inválido o expirado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/clasificaciones', GastoController.listarClasificaciones);

// ==================== CRUD BÁSICO DE GASTOS ====================

/**
 * @openapi
 * /api/gastos:
 *   post:
 *     tags:
 *       - Gastos
 *     summary: Crea un nuevo gasto asociado a un caso de estudio
 *     description: >
 *       Registra un gasto clasificado por tipo (operativo, administrativo, ventas, financiero).
 *       Para remuneraciones, es obligatorio especificar el tipo de pensión (ONP o AFP)
 *       para el correcto cálculo de tributos laborales.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearGastoInput'
 *           examples:
 *             gastoOperativo:
 *               summary: Gasto operativo con IGV
 *               value:
 *                 caso_estudio_id: 1
 *                 clasificacion_id: 3
 *                 descripcion: "Transporte de mercadería al puerto"
 *                 monto: 2000
 *                 moneda: "PEN"
 *                 fecha_gasto: "2025-10-15"
 *                 es_remuneracion: false
 *             remuneracionONP:
 *               summary: Remuneración con ONP
 *               value:
 *                 caso_estudio_id: 1
 *                 clasificacion_id: 1
 *                 descripcion: "Sueldo operario de producción - Octubre"
 *                 monto: 2500
 *                 moneda: "PEN"
 *                 fecha_gasto: "2025-10-01"
 *                 es_remuneracion: true
 *                 tipo_pension: "ONP"
 *             remuneracionAFP:
 *               summary: Remuneración con AFP
 *               value:
 *                 caso_estudio_id: 1
 *                 clasificacion_id: 1
 *                 descripcion: "Sueldo jefe de producción - Octubre"
 *                 monto: 4500
 *                 moneda: "PEN"
 *                 fecha_gasto: "2025-10-01"
 *                 es_remuneracion: true
 *                 tipo_pension: "AFP"
 *     responses:
 *       '201':
 *         description: Gasto creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GastoResponse'
 *       '400':
 *         description: Datos inválidos o falta información requerida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *         description: Caso de estudio no encontrado o no pertenece al usuario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', GastoController.crearGasto);

/**
 * @openapi
 * /api/gastos:
 *   get:
 *     tags:
 *       - Gastos
 *     summary: Lista todos los gastos activos de un caso de estudio
 *     description: >
 *       Retorna todos los gastos activos registrados para un caso de estudio específico,
 *       incluyendo información de la clasificación, cuenta contable y tipo de gasto.
 *       Los gastos se ordenan por tipo y fecha. Solo muestra gastos con activo = 1.
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
 *         description: Lista de gastos exitosa
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/GastoResponse'
 *       '400':
 *         description: Falta el parámetro caso_estudio_id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Error interno del servidor
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
 *     summary: Desactiva un gasto específico (soft delete)
 *     description: >
 *       Marca un gasto como inactivo (activo = 0) en lugar de eliminarlo físicamente.
 *       Los gastos desactivados no aparecerán en listados ni cálculos posteriores.
 *       Solo se pueden desactivar gastos que pertenecen al usuario autenticado
 *       y que estén actualmente activos.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del gasto a desactivar
 *         example: 1
 *     responses:
 *       '204':
 *         description: Gasto desactivado exitosamente (sin contenido)
 *       '400':
 *         description: ID de gasto inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *         description: Gasto no encontrado, no pertenece al usuario o ya está inactivo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:id', GastoController.eliminarGasto);

// ==================== EDITA UN GASTO ====================

/**
 * @openapi
 * /api/gastos/{id}:
 *   patch:
 *     tags:
 *       - Gastos
 *     summary: Actualiza un gasto específico
 *     description: >
 *       Actualiza uno o más campos de un gasto existente activo.
 *       Solo los campos enviados en el body serán actualizados.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del gasto a actualizar
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActualizarGastoInput'
 *           example:
 *             monto: 550.75
 *             descripcion: "Pago de recibo de luz (corregido)"
 *     responses:
 *       '200':
 *         description: Gasto actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Gasto'
 *       '400':
 *         description: Datos inválidos o ID de gasto inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: No autorizado
 *       '404':
 *         description: Gasto no encontrado, no pertenece al usuario o está inactivo
 *       '500':
 *         description: Error interno del servidor
 */
router.patch('/:id', GastoController.actualizarGasto);

// ==================== CÁLCULOS TRIBUTARIOS ====================

/**
 * @openapi
 * /api/gastos/tributos:
 *   get:
 *     tags:
 *       - Gastos
 *     summary: Calcula tributos sobre los gastos activos registrados
 *     description: >
 *       Calcula automáticamente todos los tributos asociados a los gastos activos:
 *       - ESSALUD (9% sobre remuneraciones)
 *       - ONP (13% sobre remuneraciones con pensión nacional)
 *       - AFP (11.37% sobre remuneraciones con pensión privada)
 *       - IGV (18% sobre gastos que lo requieren: cuentas 631-659)
 *       También calcula las cuentas por pagar resultantes.
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
 *         description: Cálculo de tributos exitoso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CalculoTributario'
 *       '400':
 *         description: Falta el parámetro caso_estudio_id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/tributos', GastoController.calcularTributos);

// ==================== ASIENTO CONTABLE ====================

/**
 * @openapi
 * /api/gastos/asiento-contable:
 *   get:
 *     tags:
 *       - Gastos
 *     summary: Genera el asiento contable completo de gastos activos
 *     description: >
 *       Genera automáticamente el asiento contable siguiendo el Plan Contable peruano:
 *
 *       **DEBE:**
 *       - Todas las cuentas de gasto clase 6 (621, 627, 631-671)
 *       - Cuenta 40111 (IGV - Cuenta propia)
 *
 *       **HABER:**
 *       - Cuenta 4031 (ESSALUD por pagar)
 *       - Cuenta 4032 (ONP por pagar)
 *       - Cuenta 407 (AFP por pagar)
 *       - Cuenta 411 (Remuneraciones por pagar netas)
 *       - Cuenta 4211 (Facturas por pagar con IGV)
 *       - Cuenta 101 (Caja y bancos para gastos financieros)
 *
 *       El asiento está balanceado (Debe = Haber). Solo considera gastos activos.
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
 *         description: Asiento contable generado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AsientoContableCompleto'
 *       '400':
 *         description: Falta el parámetro caso_estudio_id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/asiento-contable', GastoController.generarAsientoContable);

// Agregar después de la ruta GET /api/gastos/asiento-contable (antes de resumen-por-tipo)

/**
 * @openapi
 * /api/gastos/{id}/asiento-contable:
 *   get:
 *     tags:
 *       - Gastos
 *     summary: Genera el asiento contable de un gasto específico
 *     description: >
 *       Genera automáticamente el asiento contable individual para un gasto activo.
 *
 *       **Para Remuneraciones (621.x):**
 *       - DEBE: Cuenta de gasto (621.x) + ESSALUD (627.x)
 *       - HABER: ESSALUD por pagar (4031), ONP/AFP (4032/407), Remuneraciones netas (411)
 *
 *       **Para Gastos con IGV:**
 *       - DEBE: Cuenta de gasto + IGV (40111)
 *       - HABER: Facturas por pagar (4211)
 *
 *       **Para Gastos Financieros (671.x):**
 *       - DEBE: Cuenta de gasto
 *       - HABER: Caja y bancos (101)
 *
 *       El asiento está balanceado (Debe = Haber) y utiliza monto_base y monto_igv
 *       almacenados en la base de datos para precisión.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del gasto
 *         example: 15
 *     responses:
 *       '200':
 *         description: Asiento contable generado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AsientoContableCompleto'
 *             example:
 *               fecha: "2025-11-23"
 *               descripcion: "Asiento del gasto: Transporte de mercadería al puerto"
 *               detalles:
 *                 - codigo_cuenta: "631.1"
 *                   denominacion: "Transporte, correos y gastos de viaje operativo"
 *                   debe: 1694.92
 *                   haber: 0
 *                 - codigo_cuenta: "40111"
 *                   denominacion: "IGV - Cuenta propia"
 *                   debe: 305.08
 *                   haber: 0
 *                 - codigo_cuenta: "4211"
 *                   denominacion: "Facturas, boletas y otros comprobantes por pagar"
 *                   debe: 0
 *                   haber: 2000
 *               total_debe: 2000
 *               total_haber: 2000
 *       '400':
 *         description: ID de gasto inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *         description: Gasto no encontrado, no pertenece al usuario o está inactivo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Gasto no encontrado"
 *       '500':
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id/asiento-contable', GastoController.generarAsientoContablePorGasto);

// ==================== RESÚMENES Y ANÁLISIS ====================

/**
 * @openapi
 * /api/gastos/resumen-por-tipo:
 *   get:
 *     tags:
 *       - Gastos
 *     summary: Obtiene resumen de gastos activos agrupados por tipo
 *     description: >
 *       Agrupa y totaliza los gastos activos por su naturaleza:
 *       - OPERATIVO: Gastos directamente relacionados con la producción
 *       - ADMINISTRATIVO: Gastos de gestión y administración
 *       - VENTA: Gastos relacionados con comercialización
 *       - FINANCIERO: Intereses, comisiones bancarias, etc.
 *
 *       Útil para análisis de estructura de costos y toma de decisiones.
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
 *         description: Resumen por tipo exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ResumenGastosPorTipo'
 *       '400':
 *         description: Falta el parámetro caso_estudio_id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/resumen-por-tipo', GastoController.obtenerResumenPorTipo);

// ==================== DATOS FINANCIEROS (ROA / ROE) ====================

router.post('/datos-financieros', GastoController.guardarDatosFinancieros);
router.get('/datos-financieros/:caso_id', GastoController.obtenerDatosFinancieros);

export default router;