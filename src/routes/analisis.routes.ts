// routes/analisis.routes.ts - VERSIÓN CORREGIDA COMPLETA

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
 *         estado_resultados:
 *           $ref: '#/components/schemas/EstadoResultados'
 *         ratios_financieros:
 *           $ref: '#/components/schemas/RatiosFinancieros'
 *         resumen_monedas:
 *           $ref: '#/components/schemas/ResumenMonedas'
 *
 *     UtilidadBruta:
 *       type: object
 *       properties:
 *         ventas_totales_sin_igv:
 *           type: number
 *           format: float
 *           example: 25000.50
 *           description: "Ventas totales SIN IGV (base imponible)"
 *         costo_ventas:
 *           type: number
 *           format: float
 *           example: 15000.00
 *           description: "Solo incluye cuentas 601-604 y 609 (AD, CVD, SDA)"
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
 *     EstadoResultados:
 *       type: object
 *       description: "Estado de Resultados completo en moneda base (USD)"
 *       properties:
 *         ventas:
 *           type: object
 *           properties:
 *             mercaderias_nacionales:
 *               type: number
 *               format: float
 *               example: 5000.00
 *             mercaderias_internacionales:
 *               type: number
 *               format: float
 *               example: 15000.00
 *             productos_terminados_nacionales:
 *               type: number
 *               format: float
 *               example: 3000.00
 *             productos_terminados_internacionales:
 *               type: number
 *               format: float
 *               example: 2000.50
 *             total_ventas_sin_igv:
 *               type: number
 *               format: float
 *               example: 25000.50
 *               description: "Total de ventas SIN IGV"
 *         costo_ventas:
 *           type: object
 *           properties:
 *             mercaderias:
 *               type: number
 *               format: float
 *               example: 10000.00
 *               description: "Cuenta 601"
 *             materias_primas:
 *               type: number
 *               format: float
 *               example: 3000.00
 *               description: "Cuenta 602"
 *             materiales_auxiliares:
 *               type: number
 *               format: float
 *               example: 1000.00
 *               description: "Cuenta 603"
 *             envases_embalajes:
 *               type: number
 *               format: float
 *               example: 500.00
 *               description: "Cuenta 604"
 *             costos_vinculados:
 *               type: number
 *               format: float
 *               example: 500.00
 *               description: "Cuenta 609: Solo Antidumping, Compensatorios y SDA"
 *             total_costo_ventas:
 *               type: number
 *               format: float
 *               example: 15000.00
 *         utilidad_bruta:
 *           type: number
 *           format: float
 *           example: 10000.50
 *         gastos_operativos:
 *           type: object
 *           properties:
 *             remuneraciones:
 *               type: number
 *               format: float
 *             seguridad_social:
 *               type: number
 *               format: float
 *             transporte_viajes:
 *               type: number
 *               format: float
 *             asesoria_consultoria:
 *               type: number
 *               format: float
 *             produccion_terceros:
 *               type: number
 *               format: float
 *               description: "Cuenta 633"
 *             mantenimiento_reparaciones:
 *               type: number
 *               format: float
 *             alquileres:
 *               type: number
 *               format: float
 *             servicios_basicos:
 *               type: number
 *               format: float
 *             otros_servicios:
 *               type: number
 *               format: float
 *             seguros:
 *               type: number
 *               format: float
 *             otros_gastos:
 *               type: number
 *               format: float
 *             total_gastos_operativos:
 *               type: number
 *               format: float
 *         utilidad_operativa:
 *           type: number
 *           format: float
 *         gastos_administrativos:
 *           type: object
 *           properties:
 *             remuneraciones:
 *               type: number
 *               format: float
 *             seguridad_social:
 *               type: number
 *               format: float
 *             transporte_viajes:
 *               type: number
 *               format: float
 *             asesoria_consultoria:
 *               type: number
 *               format: float
 *             mantenimiento_reparaciones:
 *               type: number
 *               format: float
 *             alquileres:
 *               type: number
 *               format: float
 *             servicios_basicos:
 *               type: number
 *               format: float
 *             otros_servicios:
 *               type: number
 *               format: float
 *             seguros:
 *               type: number
 *               format: float
 *             otros_gastos:
 *               type: number
 *               format: float
 *             total_gastos_administrativos:
 *               type: number
 *               format: float
 *         gastos_ventas:
 *           type: object
 *           properties:
 *             remuneraciones:
 *               type: number
 *               format: float
 *             seguridad_social:
 *               type: number
 *               format: float
 *             transporte_viajes:
 *               type: number
 *               format: float
 *             asesoria_consultoria:
 *               type: number
 *               format: float
 *             mantenimiento_reparaciones:
 *               type: number
 *               format: float
 *             alquileres:
 *               type: number
 *               format: float
 *             servicios_basicos:
 *               type: number
 *               format: float
 *             publicidad:
 *               type: number
 *               format: float
 *               description: "Cuenta 637"
 *             otros_servicios:
 *               type: number
 *               format: float
 *             seguros:
 *               type: number
 *               format: float
 *             otros_gastos:
 *               type: number
 *               format: float
 *             total_gastos_ventas:
 *               type: number
 *               format: float
 *         gastos_financieros:
 *           type: object
 *           properties:
 *             intereses_desgravamen:
 *               type: number
 *               format: float
 *             comisiones_bancarias:
 *               type: number
 *               format: float
 *             total_gastos_financieros:
 *               type: number
 *               format: float
 *         utilidad_neta:
 *           type: number
 *           format: float
 *
 *     RatiosFinancieros:
 *       type: object
 *       properties:
 *         margen_bruto:
 *           type: number
 *           format: float
 *           example: 40.00
 *         margen_operativo:
 *           type: number
 *           format: float
 *           example: 32.00
 *         margen_neto:
 *           type: number
 *           format: float
 *           example: 20.00
 *         ros:
 *           type: number
 *           format: float
 *           example: 20.00
 *           description: "Return on Sales (igual a margen_neto)"
 *         roa:
 *           type: number
 *           format: float
 *           nullable: true
 *           example: null
 *           description: "Return on Assets (requiere input de Activos Totales)"
 *         roe:
 *           type: number
 *           format: float
 *           nullable: true
 *           example: null
 *           description: "Return on Equity (requiere input de Patrimonio)"
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
 *         tipo_mercancia_id:
 *           type: integer
 *           example: 1
 *         tipo_mercancia_cuenta:
 *           type: string
 *           example: "601"
 *           description: "601=Mercaderías, 602=Materias Primas, 603=Materiales Auxiliares, 604=Envases"
 *         tipo_mercancia_nombre:
 *           type: string
 *           example: "Mercaderías"
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
 *         antidumping_ingresado:
 *           type: number
 *           format: float
 *           example: 50.00
 *           description: "Monto fijo de Antidumping ingresado"
 *         compensatorio_ingresado:
 *           type: number
 *           format: float
 *           example: 25.00
 *           description: "Monto fijo de Derechos Compensatorios"
 *         sda_ingresado:
 *           type: number
 *           format: float
 *           example: 5.00
 *           description: "Monto fijo de Sistema de Despacho Aduanero"
 *         dta_total:
 *           type: number
 *           format: float
 *           example: 334.41
 *           description: "Deuda Tributaria Aduanera Total"
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           example: "USD"
 *           description: "Moneda original de la importación"
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
 *         tipo_producto_id:
 *           type: integer
 *           example: 1
 *         tipo_producto_nombre:
 *           type: string
 *           example: "Mercaderías"
 *         tipo_producto_cuenta:
 *           type: string
 *           example: "7011"
 *           description: "701=Mercaderías, 702=Productos Terminados"
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
 *           example: 29500.59
 *           description: "Valor total de venta (Base + IGV)"
 *         monto_base:
 *           type: number
 *           format: float
 *           example: 25000.50
 *           description: "Base sin IGV (Valor de Venta / 1.18)"
 *         monto_igv:
 *           type: number
 *           format: float
 *           example: 4500.09
 *           description: "IGV aplicado (18%)"
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           example: "USD"
 *           description: "Moneda original de la venta"
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
 *           example: 1770.89
 *           description: "Monto total (Base + IGV)"
 *         monto_base:
 *           type: number
 *           format: float
 *           example: 1500.75
 *           description: "Monto sin IGV"
 *         monto_igv:
 *           type: number
 *           format: float
 *           example: 270.14
 *           description: "IGV del gasto (18%)"
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           example: "PEN"
 *           description: "Moneda original del gasto"
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
 *           description: "Total de operaciones en USD"
 *         total_pen:
 *           type: number
 *           format: float
 *           example: 2700.75
 *           description: "Total de operaciones en PEN"
 *         tipo_cambio_usado:
 *           type: number
 *           format: float
 *           example: 3.8000
 *           description: "Tipo de cambio usado para conversiones (de API en tiempo real)"
 *
 *     AsientoContableConsolidado:
 *       type: object
 *       properties:
 *         fecha:
 *           type: string
 *           format: date
 *           example: "2025-11-27"
 *         descripcion:
 *           type: string
 *           example: "Asiento consolidado del caso: Importación de Vinos 2025"
 *         detalles:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               cuenta:
 *                 type: string
 *                 example: "12"
 *               nombre_cuenta:
 *                 type: string
 *                 example: "Clientes"
 *               debe:
 *                 type: number
 *                 format: float
 *                 example: 29500.59
 *               haber:
 *                 type: number
 *                 format: float
 *                 example: 0.00
 *               glosa:
 *                 type: string
 *                 example: "Ventas nacionales"
 *         totalDebe:
 *           type: number
 *           format: float
 *           example: 50000.00
 *         totalHaber:
 *           type: number
 *           format: float
 *           example: 50000.00
 *         moneda:
 *           type: string
 *           enum: [USD, PEN]
 *           example: "USD"
 *         tipo_cambio:
 *           type: number
 *           format: float
 *           example: 3.8000
 *         diferencia:
 *           type: number
 *           format: float
 *           example: 0.00
 *           description: "Diferencia entre Debe y Haber (idealmente 0.00)"
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
 *           $ref: '#/components/schemas/RatiosFinancieros'
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
 *         ventas:
 *           type: object
 *           properties:
 *             total_sin_igv:
 *               type: number
 *               format: float
 *               example: 25000.50
 *               description: "Ventas totales SIN IGV"
 *         costo_ventas:
 *           type: number
 *           format: float
 *           example: 15000.00
 *         resumen_monedas:
 *           $ref: '#/components/schemas/ResumenMonedas'
 *         nota:
 *           type: string
 *           example: "ROA y ROE requieren inputs de Activos Totales y Patrimonio (calculados en frontend)"
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
 *                 valor_total_ventas_sin_igv:
 *                   type: number
 *                   format: float
 *                   example: 52400.50
 *                   description: "Total de ventas SIN IGV"
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
 *                 monto_total_operativos:
 *                   type: number
 *                   format: float
 *                   example: 0.00
 *                 monto_total_administrativos:
 *                   type: number
 *                   format: float
 *                   example: 1500.75
 *                 monto_total_ventas:
 *                   type: number
 *                   format: float
 *                   example: 1000.00
 *                 monto_total_financieros:
 *                   type: number
 *                   format: float
 *                   example: 0.00
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
 *             margen_bruto:
 *               type: string
 *               example: "40.00"
 *             margen_operativo:
 *               type: string
 *               example: "32.00"
 *             margen_neto:
 *               type: string
 *               example: "20.00"
 *         tipo_cambio_usado:
 *           type: number
 *           format: float
 *           example: 3.8000
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
 *       - Estado de Resultados completo con ventas SIN IGV
 *       - Costo de Ventas solo con cuentas 601-604 y 609 (AD, CVD, SDA)
 *       - Detalles de importaciones con tipo de mercancía y tributos
 *       - Detalles de exportaciones con monto_base (sin IGV) y monto_igv
 *       - Gastos clasificados con monto_base (sin IGV) y monto_igv
 *       - Ratios financieros (ROA y ROE requieren inputs adicionales)
 *       - Resumen por monedas con tipo de cambio en tiempo real
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
 *                     incluye_estado_resultados:
 *                       type: boolean
 *                       example: true
 *                     incluye_ratios_financieros:
 *                       type: boolean
 *                       example: true
 *                     tipo_cambio_usado:
 *                       type: number
 *                       format: float
 *                       example: 3.8000
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
 * /api/rentability/estado-resultados/{caso_id}:
 *   get:
 *     tags:
 *       - Análisis de Rentabilidad
 *     summary: Obtiene el Estado de Resultados completo
 *     description: |
 *       Retorna el Estado de Resultados detallado:
 *       - Ventas desglosadas (mercaderías/productos, nacionales/internacionales) SIN IGV
 *       - Costo de Ventas solo con cuentas 601-604 y 609 (AD, CVD, SDA)
 *       - Gastos Operativos desglosados (incluye cuenta 633: Producción terceros)
 *       - Gastos Administrativos desglosados
 *       - Gastos de Ventas desglosados (incluye cuenta 637: Publicidad)
 *       - Gastos Financieros (intereses y comisiones)
 *       - Utilidad Bruta, Operativa y Neta
 *     parameters:
 *       - in: path
 *         name: caso_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estado de Resultados obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     caso_estudio_id:
 *                       type: integer
 *                     nombre_caso:
 *                       type: string
 *                     estado_resultados:
 *                       $ref: '#/components/schemas/EstadoResultados'
 *                     resumen:
 *                       type: object
 *                       properties:
 *                         ventas_sin_igv:
 *                           type: number
 *                         costo_ventas:
 *                           type: number
 *                         utilidad_bruta:
 *                           type: number
 *                         utilidad_operativa:
 *                           type: number
 *                         utilidad_neta:
 *                           type: number
 *                     tipo_cambio_usado:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/estado-resultados/:caso_id', AnalisisController.obtenerEstadoResultados);

/**
 * @swagger
 * /api/rentability/asiento-consolidado/{caso_id}:
 *   get:
 *     tags:
 *       - Análisis de Rentabilidad
 *     summary: Obtiene el asiento contable consolidado
 *     description: |
 *       Genera un asiento contable consolidado combinando:
 *       - Importaciones (con conversión de moneda si es necesario)
 *       - Exportaciones (con conversión de moneda si es necesario)
 *       - Gastos (con conversión de moneda si es necesario)
 *
 *       ✅ Usa tipo de cambio en tiempo real desde API
 *       ✅ Soporta USD y PEN con toggle dinámico
 *       ✅ Expone diferencia entre Debe y Haber (no la oculta)
 *       ✅ NO hardcodea valores para cuadrar el asiento
 *
 *       ⚠️ Si hay diferencia > 0.01, se incluye en metadata.diferencia
 *     parameters:
 *       - in: path
 *         name: caso_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *       - in: query
 *         name: moneda
 *         required: false
 *         schema:
 *           type: string
 *           enum: ['USD', 'PEN']
 *           default: 'USD'
 *         description: Moneda base para mostrar el asiento
 *         example: 'USD'
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Asiento consolidado generado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AsientoContableConsolidado'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     caso_id:
 *                       type: integer
 *                     total_lineas:
 *                       type: integer
 *                     diferencia:
 *                       type: number
 *                       description: "Diferencia entre Debe y Haber"
 *                     esta_balanceado:
 *                       type: boolean
 *                       description: "True si diferencia <= 0.01"
 *                     moneda:
 *                       type: string
 *                     tipo_cambio:
 *                       type: number
 *                     timestamp:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/asiento-consolidado/:caso_id', AnalisisController.obtenerAsientoContableConsolidado);

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
 *       - ROS (Return on Sales)
 *       - ROA y ROE (null si no hay inputs de Activos y Patrimonio)
 *       - Utilidades calculadas
 *       - Ventas SIN IGV
 *       - Costo de Ventas
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
 *       - Distribución de gastos por categoría (cantidad y montos)
 *       - Indicadores de eficiencia operacional
 *       - Usa valores SIN IGV (monto_base) para exportaciones y gastos
 *       - Tipo de cambio en tiempo real
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