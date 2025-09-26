// routes/analisis.routes.ts

import { Router } from 'express';
import { AnalisisController } from '../controllers/analisis.controller';
import { requireAuth } from '../middlewares/requireAuth';
import { 
  obtenerAnalisisSchema, 
  analisisQuerySchema,
  analisisComparativoSchema 
} from '../validators/analisis.validators';

const router = Router();

// Aplicar autenticación a todas las rutas
router.use(requireAuth);

/**
 * @openapi
 * tags:
 *   - name: Análisis de Rentabilidad
 *     description: Análisis financiero y de rentabilidad de casos de estudio
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
 *     RentabilityAnalysis:
 *       type: object
 *       properties:
 *         caso_estudio_id:
 *           type: integer
 *           example: 1
 *         nombre_caso:
 *           type: string
 *           example: "Importación de Vinos 2025"
 *         utilidad_bruta:
 *           $ref: '#/components/schemas/UtilidadBruta'
 *         utilidad_operativa:
 *           $ref: '#/components/schemas/UtilidadOperativa'
 *         utilidad_neta:
 *           $ref: '#/components/schemas/UtilidadNeta'
 *         detalles:
 *           type: object
 *           properties:
 *             importaciones:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ImportacionDetalle'
 *             exportaciones:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ExportacionDetalle'
 *             gastos:
 *               $ref: '#/components/schemas/GastosPorClasificacion'
 *         resumen_monedas:
 *           $ref: '#/components/schemas/ResumenMonedas'
 * 
 *     UtilidadBruta:
 *       type: object
 *       properties:
 *         ventas_totales:
 *           type: number
 *           format: float
 *           example: 25000.50
 *         costo_adquisicion:
 *           type: number
 *           format: float
 *           example: 15000.00
 *         utilidad_bruta:
 *           type: number
 *           format: float
 *           example: 10000.50
 *         margen_bruto_porcentaje:
 *           type: number
 *           format: float
 *           example: 40.00
 * 
 *     UtilidadOperativa:
 *       type: object
 *       properties:
 *         utilidad_bruta:
 *           type: number
 *           format: float
 *           example: 10000.50
 *         gastos_operativos:
 *           type: number
 *           format: float
 *           example: 2000.00
 *         utilidad_operativa:
 *           type: number
 *           format: float
 *           example: 8000.50
 *         margen_operativo_porcentaje:
 *           type: number
 *           format: float
 *           example: 32.00
 * 
 *     UtilidadNeta:
 *       type: object
 *       properties:
 *         utilidad_operativa:
 *           type: number
 *           format: float
 *           example: 8000.50
 *         gastos_administrativos:
 *           type: number
 *           format: float
 *           example: 1500.00
 *         gastos_ventas:
 *           type: number
 *           format: float
 *           example: 1000.00
 *         gastos_financieros:
 *           type: number
 *           format: float
 *           example: 500.00
 *         total_otros_gastos:
 *           type: number
 *           format: float
 *           example: 3000.00
 *         utilidad_neta:
 *           type: number
 *           format: float
 *           example: 5000.50
 *         margen_neto_porcentaje:
 *           type: number
 *           format: float
 *           example: 20.00
 * 
 *     ImportacionDetalle:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         subpartida_hs10:
 *           type: string
 *           example: "2204100000"
 *         descripcion_mercancia:
 *           type: string
 *           example: "Vino espumoso"
 *         valor_fob:
 *           type: number
 *           format: float
 *           example: 1000.00
 *         valor_flete:
 *           type: number
 *           format: float
 *           example: 150.00
 *         valor_seguro:
 *           type: number
 *           format: float
 *           example: 50.00
 *         valor_cif:
 *           type: number
 *           format: float
 *           example: 1200.00
 *         monto_ad_valorem:
 *           type: number
 *           format: float
 *           example: 72.00
 *         monto_isc:
 *           type: number
 *           format: float
 *           example: 0.00
 *         monto_igv:
 *           type: number
 *           format: float
 *           example: 228.96
 *         monto_ipm:
 *           type: number
 *           format: float
 *           example: 25.44
 *         monto_percepcion:
 *           type: number
 *           format: float
 *           example: 8.01
 *         dta_total:
 *           type: number
 *           format: float
 *           example: 334.41
 *         fecha_operacion:
 *           type: string
 *           format: date
 *           example: "2025-09-16"
 *         tributos:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ImportacionTributo'
 * 
 *     ImportacionTributo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         concepto:
 *           type: string
 *           enum: [ad_valorem, isc, igv, ipm, percepcion, sda, antidumping, compensatorio]
 *           example: "ad_valorem"
 *         base_imponible:
 *           type: number
 *           format: float
 *           example: 1200.00
 *         tasa_aplicada:
 *           type: number
 *           format: float
 *           example: 0.06000
 *         monto_calculado:
 *           type: number
 *           format: float
 *           example: 72.00
 * 
 *     ExportacionDetalle:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         es_venta_nacional:
 *           type: boolean
 *           example: false
 *         incoterm:
 *           type: string
 *           nullable: true
 *           enum: [EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DPU, DAP, DDP]
 *           example: "FOB"
 *         descripcion_venta:
 *           type: string
 *           example: "Venta de arándanos frescos a EE.UU."
 *         valor_venta:
 *           type: number
 *           format: float
 *           example: 25000.50
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           example: "USD"
 *         fecha_operacion:
 *           type: string
 *           format: date
 *           example: "2025-10-20"
 *         pais_origen:
 *           type: string
 *           nullable: true
 *           example: "Perú"
 *         pais_destino:
 *           type: string
 *           nullable: true
 *           example: "Estados Unidos"
 * 
 *     GastosPorClasificacion:
 *       type: object
 *       properties:
 *         operativos:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/GastoDetalle'
 *         administrativos:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/GastoDetalle'
 *         ventas:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/GastoDetalle'
 *         financieros:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/GastoDetalle'
 * 
 *     GastoDetalle:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         clasificacion_id:
 *           type: integer
 *           example: 2
 *         clasificacion_nombre:
 *           type: string
 *           enum: [Operativo, Administrativo, Ventas, Financiero]
 *           example: "Administrativo"
 *         descripcion:
 *           type: string
 *           example: "Pago de transporte"
 *         cuenta_contable_codigo:
 *           type: string
 *           nullable: true
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
 *           example: "2025-09-17"
 * 
 *     ResumenMonedas:
 *       type: object
 *       properties:
 *         total_usd:
 *           type: number
 *           format: float
 *           example: 26534.41
 *         total_pen:
 *           type: number
 *           format: float
 *           example: 2700.75
 *         tipo_cambio_sugerido:
 *           type: number
 *           format: float
 *           example: 3.75
 * 
 *     RentabilityRatios:
 *       type: object
 *       properties:
 *         caso_estudio_id:
 *           type: integer
 *           example: 1
 *         nombre_caso:
 *           type: string
 *           example: "Importación de Vinos 2025"
 *         ratios:
 *           type: object
 *           properties:
 *             margen_bruto:
 *               type: number
 *               format: float
 *               example: 40.00
 *             margen_operativo:
 *               type: number
 *               format: float
 *               example: 32.00
 *             margen_neto:
 *               type: number
 *               format: float
 *               example: 20.00
 *         utilidades:
 *           type: object
 *           properties:
 *             bruta:
 *               type: number
 *               format: float
 *               example: 10000.50
 *             operativa:
 *               type: number
 *               format: float
 *               example: 8000.50
 *             neta:
 *               type: number
 *               format: float
 *               example: 5000.50
 *         resumen_monedas:
 *           $ref: '#/components/schemas/ResumenMonedas'
 * 
 *     OperationalSummary:
 *       type: object
 *       properties:
 *         caso_estudio_id:
 *           type: integer
 *           example: 1
 *         nombre_caso:
 *           type: string
 *           example: "Importación de Vinos 2025"
 *         resumen_operaciones:
 *           type: object
 *           properties:
 *             importaciones:
 *               type: object
 *               properties:
 *                 cantidad:
 *                   type: integer
 *                   example: 3
 *                 valor_total_cif:
 *                   type: number
 *                   format: float
 *                   example: 2550.00
 *                 tributos_totales:
 *                   type: number
 *                   format: float
 *                   example: 700.89
 *             exportaciones:
 *               type: object
 *               properties:
 *                 cantidad:
 *                   type: integer
 *                   example: 4
 *                 valor_total_ventas:
 *                   type: number
 *                   format: float
 *                   example: 52400.50
 *                 ventas_nacionales:
 *                   type: integer
 *                   example: 0
 *                 exportaciones_internacionales:
 *                   type: integer
 *                   example: 4
 *             gastos:
 *               type: object
 *               properties:
 *                 total_operativos:
 *                   type: integer
 *                   example: 0
 *                 total_administrativos:
 *                   type: integer
 *                   example: 1
 *                 total_ventas:
 *                   type: integer
 *                   example: 1
 *                 total_financieros:
 *                   type: integer
 *                   example: 0
 *         indicadores_clave:
 *           type: object
 *           properties:
 *             eficiencia_importacion:
 *               type: string
 *               example: "196.15"
 *               description: "Porcentaje de utilidad sobre costo de importación"
 *             productividad_ventas:
 *               type: string
 *               example: "95.42"
 *               description: "Porcentaje de utilidad neta sobre ventas totales"
 * 
 *     ComparativeAnalysis:
 *       type: object
 *       properties:
 *         total_casos:
 *           type: integer
 *           example: 3
 *         casos:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               caso_id:
 *                 type: integer
 *                 example: 1
 *               nombre_caso:
 *                 type: string
 *                 example: "Importación de Vinos 2025"
 *               fecha_creacion:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-09-16T11:48:34.809941-05:00"
 *               margen_neto:
 *                 type: number
 *                 format: float
 *                 example: 20.00
 *               utilidad_neta:
 *                 type: number
 *                 format: float
 *                 example: 5000.50
 *               ventas_totales:
 *                 type: number
 *                 format: float
 *                 example: 25000.50
 *         estadisticas:
 *           type: object
 *           properties:
 *             mejor_margen:
 *               type: number
 *               format: float
 *               example: 25.50
 *             peor_margen:
 *               type: number
 *               format: float
 *               example: 10.25
 *             promedio_margen:
 *               type: string
 *               example: "18.75"
 * 
 *   responses:
 *     ValidationError:
 *       description: Error de validación en los parámetros
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Errores de validación"
 *               errors:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     field:
 *                       type: string
 *                     message:
 *                       type: string
 *                     value:
 *                       type: string
 * 
 *     UnauthorizedError:
 *       description: No autorizado - Token requerido
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "No autorizado. Token requerido."
 * 
 *     NotFoundError:
 *       description: Caso de estudio no encontrado
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Caso de estudio no encontrado o no autorizado"
 * 
 *     ServerError:
 *       description: Error interno del servidor
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Error interno del servidor"
 *               error:
 *                 type: string
 */

/**
 * @swagger
 * /api/rentability/analysis/{caso_id}:
 *   get:
 *     tags:
 *       - Análisis de Rentabilidad
 *     summary: Obtiene el análisis completo de rentabilidad de un caso de estudio
 *     description: |
 *       Retorna el análisis financiero completo incluyendo:
 *       - Utilidad Bruta, Operativa y Neta con sus respectivos márgenes
 *       - Detalles de todas las importaciones con tributos
 *       - Detalles de todas las exportaciones 
 *       - Gastos clasificados por categoría (Operativos, Administrativos, Ventas, Financieros)
 *       - Resumen por monedas (USD/PEN)
 *     parameters:
 *       - in: path
 *         name: caso_id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID del caso de estudio
 *         example: 1
 *       - in: query
 *         name: incluir_detalles
 *         required: false
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'true'
 *         description: Si incluir detalles completos de operaciones
 *         example: 'true'
 *       - in: query
 *         name: moneda_base
 *         required: false
 *         schema:
 *           type: string
 *           enum: ['USD', 'PEN']
 *           default: 'USD'
 *         description: Moneda base para los cálculos
 *         example: 'USD'
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Análisis obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Análisis de rentabilidad obtenido exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/RentabilityAnalysis'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     caso_id:
 *                       type: integer
 *                       example: 1
 *                     incluye_detalles:
 *                       type: boolean
 *                       example: true
 *                     moneda_base:
 *                       type: string
 *                       example: "USD"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/analysis/:caso_id', AnalisisController.obtenerAnalisisCompleto);

/**
 * @swagger
 * /api/rentability/ratios/{caso_id}:
 *   get:
 *     tags:
 *       - Análisis de Rentabilidad
 *     summary: Obtiene solo los ratios de rentabilidad sin detalles
 *     description: |
 *       Retorna únicamente los indicadores clave de rentabilidad:
 *       - Márgenes (Bruto, Operativo, Neto)
 *       - Utilidades calculadas
 *       - Resumen por monedas
 *     parameters:
 *       - in: path
 *         name: caso_id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID del caso de estudio
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ratios obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Ratios de rentabilidad obtenidos exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/RentabilityRatios'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get(
  '/ratios/:caso_id',
  (req, res, next) => {
    try {
      obtenerAnalisisSchema.parse(req.params);
      next();
    } catch (error) {
      next(error);
    }
  },
  AnalisisController.obtenerRatiosRentabilidad
);

/**
 * @swagger
 * /api/rentability/operational-summary/{caso_id}:
 *   get:
 *     tags:
 *       - Análisis de Rentabilidad
 *     summary: Obtiene resumen operacional del caso
 *     description: |
 *       Retorna un resumen de las operaciones realizadas:
 *       - Cantidad y valores de importaciones/exportaciones
 *       - Distribución de gastos por categoría
 *       - Indicadores de eficiencia operacional
 *     parameters:
 *       - in: path
 *         name: caso_id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID del caso de estudio
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resumen operacional obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Resumen operacional obtenido exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/OperationalSummary'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get(
  '/operational-summary/:caso_id',
  (req, res, next) => {
    try {
      obtenerAnalisisSchema.parse(req.params);
      next();
    } catch (error) {
      next(error);
    }
  },
  AnalisisController.obtenerResumenOperacional
);

/**
 * @swagger
 * /api/rentability/comparative:
 *   get:
 *     tags:
 *       - Análisis de Rentabilidad
 *     summary: Obtiene análisis comparativo entre casos del usuario
 *     description: |
 *       Compara los indicadores de rentabilidad entre todos los casos
 *       de estudio del usuario autenticado, incluyendo estadísticas
 *       como mejor/peor margen y promedios.
 *     parameters:
 *       - in: query
 *         name: limite
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Límite de casos a comparar (máximo 50)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Análisis comparativo obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Análisis comparativo obtenido exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/ComparativeAnalysis'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get(
  '/comparative',
  (req, res, next) => {
    try {
      analisisComparativoSchema.parse(req.query);
      next();
    } catch (error) {
      next(error);
    }
  },
  AnalisisController.obtenerAnalisisComparativo
);

export default router;