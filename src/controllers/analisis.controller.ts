// controllers/analisis.controller.ts - VERSIÓN CORREGIDA COMPLETA

import { Request, Response } from 'express';
import { AnalisisService } from '../services/analisis.service';
import { ExchangeRateService } from '../services/exchangeRate.service';
import {
    obtenerAnalisisSchema,
    analisisQuerySchema,
    analisisComparativoSchema
} from '../validators/analisis.validators';

export class AnalisisController {

    static async obtenerAnalisisCompleto(req: Request, res: Response): Promise<void> {
        console.log('🚀 INICIANDO obtenerAnalisisCompleto');

        try {
            // Validar parámetros
            const { caso_id } = obtenerAnalisisSchema.parse(req.params);
            console.log('✅ Parámetros validados - caso_id:', caso_id);

            const queryParams = analisisQuerySchema.parse(req.query);
            console.log('✅ Query validado - incluir_detalles:', queryParams.incluir_detalles);

            // Obtener user_id del middleware de autenticación
            const userId = (req as any).user?.sub;
            console.log('👤 userId extraído:', userId);

            if (!userId) {
                console.log('❌ No hay userId - Usuario no autenticado');
                res.status(401).json({
                    success: false,
                    message: 'No autorizado. Token requerido.'
                });
                return;
            }

            console.log('📊 Llamando a AnalisisService...');
            const analysis = await AnalisisService.obtenerAnalisisRentabilidad(
                caso_id,
                userId,
                queryParams.incluir_detalles
            );

            console.log('✅ Análisis obtenido exitosamente');
            console.log('📈 Estructura del análisis:', {
                caso_id: analysis.caso_estudio_id,
                nombre_caso: analysis.nombre_caso,
                tiene_detalles: {
                    importaciones: analysis.detalles.importaciones.length,
                    exportaciones: analysis.detalles.exportaciones.length,
                    gastos: {
                        operativos: analysis.detalles.gastos.operativos.length,
                        administrativos: analysis.detalles.gastos.administrativos.length,
                        ventas: analysis.detalles.gastos.ventas.length,
                        financieros: analysis.detalles.gastos.financieros.length
                    }
                },
                tiene_estado_resultados: !!analysis.estado_resultados,
                tiene_ratios: !!analysis.ratios_financieros,
                ventas_sin_igv: analysis.utilidad_bruta.ventas_totales_sin_igv
            });

            res.status(200).json({
                success: true,
                message: 'Análisis de rentabilidad obtenido exitosamente',
                data: analysis,
                metadata: {
                    caso_id,
                    incluye_detalles: queryParams.incluir_detalles,
                    incluye_estado_resultados: true,
                    incluye_ratios_financieros: true,
                    tipo_cambio_usado: analysis.resumen_monedas.tipo_cambio_usado,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error: any) {
            console.error('❌ ERROR EN CONTROLADOR:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });

            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    message: 'Errores de validación en los parámetros',
                    errors: error.errors
                });
                return;
            }

            if (error.message === 'Caso de estudio no encontrado o no autorizado') {
                res.status(404).json({
                    success: false,
                    message: error.message
                });
                return;
            }

            res.status(500).json({
                success: false,
                message: 'Error interno del servidor al obtener análisis',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    static async obtenerRatiosRentabilidad(req: Request, res: Response): Promise<void> {
        try {
            const { caso_id } = obtenerAnalisisSchema.parse(req.params);
            const userId = (req as any).user?.sub;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    message: 'No autorizado. Token requerido.'
                });
                return;
            }

            // Obtener análisis sin detalles
            const analysis = await AnalisisService.obtenerAnalisisRentabilidad(
                caso_id,
                userId,
                false
            );

            // ✅ ACTUALIZADO: Solo ventas SIN IGV
            const ratios = {
                caso_estudio_id: analysis.caso_estudio_id,
                nombre_caso: analysis.nombre_caso,
                ratios: {
                    margen_bruto: analysis.ratios_financieros.margen_bruto,
                    margen_operativo: analysis.ratios_financieros.margen_operativo,
                    margen_neto: analysis.ratios_financieros.margen_neto,
                    ros: analysis.ratios_financieros.ros,
                    roa: analysis.ratios_financieros.roa,
                    roe: analysis.ratios_financieros.roe
                },
                utilidades: {
                    bruta: analysis.utilidad_bruta.utilidad_bruta,
                    operativa: analysis.utilidad_operativa.utilidad_operativa,
                    neta: analysis.utilidad_neta.utilidad_neta
                },
                ventas: {
                    total_sin_igv: analysis.utilidad_bruta.ventas_totales_sin_igv // ✅ SOLO SIN IGV
                },
                costo_ventas: analysis.utilidad_bruta.costo_ventas, // ✅ NUEVO
                resumen_monedas: analysis.resumen_monedas,
                nota: 'ROA y ROE requieren inputs de Activos Totales y Patrimonio (calculados en frontend)'
            };

            res.status(200).json({
                success: true,
                message: 'Ratios de rentabilidad obtenidos exitosamente',
                data: ratios
            });

        } catch (error: any) {
            console.error('Error en obtenerRatiosRentabilidad:', error);

            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    message: 'Errores de validación',
                    errors: error.errors
                });
                return;
            }

            if (error.message === 'Caso de estudio no encontrado o no autorizado') {
                res.status(404).json({
                    success: false,
                    message: error.message
                });
                return;
            }

            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // ✅ ACTUALIZADO: Estado de Resultados
    static async obtenerEstadoResultados(req: Request, res: Response): Promise<void> {
        try {
            const { caso_id } = obtenerAnalisisSchema.parse(req.params);
            const userId = (req as any).user?.sub;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    message: 'No autorizado. Token requerido.'
                });
                return;
            }

            const analysis = await AnalisisService.obtenerAnalisisRentabilidad(
                caso_id,
                userId,
                false
            );

            // ✅ Extraer Estado de Resultados con ventas SIN IGV
            const estadoResultados = {
                caso_estudio_id: analysis.caso_estudio_id,
                nombre_caso: analysis.nombre_caso,
                estado_resultados: analysis.estado_resultados,
                resumen: {
                    ventas_sin_igv: analysis.estado_resultados.ventas.total_ventas_sin_igv, // ✅ SIN IGV
                    costo_ventas: analysis.estado_resultados.costo_ventas.total_costo_ventas,
                    utilidad_bruta: analysis.estado_resultados.utilidad_bruta,
                    utilidad_operativa: analysis.estado_resultados.utilidad_operativa,
                    utilidad_neta: analysis.estado_resultados.utilidad_neta
                },
                tipo_cambio_usado: analysis.resumen_monedas.tipo_cambio_usado
            };

            res.status(200).json({
                success: true,
                message: 'Estado de Resultados obtenido exitosamente',
                data: estadoResultados
            });

        } catch (error: any) {
            console.error('Error en obtenerEstadoResultados:', error);

            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    message: 'Errores de validación',
                    errors: error.errors
                });
                return;
            }

            if (error.message === 'Caso de estudio no encontrado o no autorizado') {
                res.status(404).json({
                    success: false,
                    message: error.message
                });
                return;
            }

            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // ✅ ACTUALIZADO: Resumen Operacional
    static async obtenerResumenOperacional(req: Request, res: Response): Promise<void> {
        try {
            const { caso_id } = obtenerAnalisisSchema.parse(req.params);
            const userId = (req as any).user?.sub;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    message: 'No autorizado. Token requerido.'
                });
                return;
            }

            console.log('🔄 Obteniendo tipo de cambio para resumen...');
            const exchangeRate = await ExchangeRateService.getExchangeRate();
            console.log(`✅ Tasa de cambio obtenida: ${exchangeRate.toFixed(4)}`);

            const analysis = await AnalisisService.obtenerAnalisisRentabilidad(
                caso_id,
                userId,
                true
            );

            // ✅ CORREGIDO: Usar monto_base (sin IGV) en vez de valor_venta
            const summary = {
                caso_estudio_id: analysis.caso_estudio_id,
                nombre_caso: analysis.nombre_caso,
                resumen_operaciones: {
                    importaciones: {
                        cantidad: analysis.detalles.importaciones.length,
                        valor_total_cif: analysis.detalles.importaciones.reduce((sum, imp) => {
                            const cifUSD = imp.moneda === 'USD' ? imp.valor_cif : imp.valor_cif / exchangeRate;
                            return sum + cifUSD;
                        }, 0),
                        tributos_totales: analysis.detalles.importaciones.reduce((sum, imp) => {
                            const dtaUSD = imp.moneda === 'USD' ? imp.dta_total : imp.dta_total / exchangeRate;
                            return sum + dtaUSD;
                        }, 0)
                    },
                    exportaciones: {
                        cantidad: analysis.detalles.exportaciones.length,
                        // ✅ USAR monto_base (sin IGV)
                        valor_total_ventas_sin_igv: analysis.detalles.exportaciones.reduce((sum, exp) => {
                            const baseUSD = exp.moneda === 'USD' ? exp.monto_base : exp.monto_base / exchangeRate;
                            return sum + baseUSD;
                        }, 0),
                        ventas_nacionales: analysis.detalles.exportaciones.filter(exp => exp.es_venta_nacional).length,
                        exportaciones_internacionales: analysis.detalles.exportaciones.filter(exp => !exp.es_venta_nacional).length
                    },
                    gastos: {
                        total_operativos: analysis.detalles.gastos.operativos.length,
                        total_administrativos: analysis.detalles.gastos.administrativos.length,
                        total_ventas: analysis.detalles.gastos.ventas.length,
                        total_financieros: analysis.detalles.gastos.financieros.length,
                        // ✅ SUMAR monto_base (sin IGV)
                        monto_total_operativos: analysis.detalles.gastos.operativos.reduce((sum, g) => {
                            const baseUSD = g.moneda === 'USD' ? g.monto_base : g.monto_base / exchangeRate;
                            return sum + baseUSD;
                        }, 0),
                        monto_total_administrativos: analysis.detalles.gastos.administrativos.reduce((sum, g) => {
                            const baseUSD = g.moneda === 'USD' ? g.monto_base : g.monto_base / exchangeRate;
                            return sum + baseUSD;
                        }, 0),
                        monto_total_ventas: analysis.detalles.gastos.ventas.reduce((sum, g) => {
                            const baseUSD = g.moneda === 'USD' ? g.monto_base : g.monto_base / exchangeRate;
                            return sum + baseUSD;
                        }, 0),
                        monto_total_financieros: analysis.detalles.gastos.financieros.reduce((sum, g) => {
                            const baseUSD = g.moneda === 'USD' ? g.monto_base : g.monto_base / exchangeRate;
                            return sum + baseUSD;
                        }, 0)
                    }
                },
                indicadores_clave: {
                    eficiencia_importacion: analysis.utilidad_bruta.costo_ventas > 0
                        ? ((analysis.utilidad_bruta.utilidad_bruta / analysis.utilidad_bruta.costo_ventas) * 100).toFixed(2)
                        : '0.00',
                    productividad_ventas: analysis.utilidad_bruta.ventas_totales_sin_igv > 0
                        ? ((analysis.utilidad_neta.utilidad_neta / analysis.utilidad_bruta.ventas_totales_sin_igv) * 100).toFixed(2)
                        : '0.00',
                    margen_bruto: analysis.ratios_financieros.margen_bruto.toFixed(2),
                    margen_operativo: analysis.ratios_financieros.margen_operativo.toFixed(2),
                    margen_neto: analysis.ratios_financieros.margen_neto.toFixed(2)
                },
                tipo_cambio_usado: exchangeRate
            };

            res.status(200).json({
                success: true,
                message: 'Resumen operacional obtenido exitosamente',
                data: summary
            });

        } catch (error: any) {
            console.error('Error en obtenerResumenOperacional:', error);

            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    message: 'Errores de validación',
                    errors: error.errors
                });
                return;
            }

            if (error.message === 'Caso de estudio no encontrado o no autorizado') {
                res.status(404).json({
                    success: false,
                    message: error.message
                });
                return;
            }

            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    static async obtenerAnalisisComparativo(req: Request, res: Response): Promise<void> {
        try {
            const queryParams = analisisComparativoSchema.parse(req.query);
            const userId = (req as any).user?.sub;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    message: 'No autorizado. Token requerido.'
                });
                return;
            }

            const comparativeData = await AnalisisService.obtenerComparativo(
                userId,
                queryParams.limite
            );

            res.status(200).json({
                success: true,
                message: 'Análisis comparativo obtenido exitosamente',
                data: comparativeData
            });

        } catch (error: any) {
            console.error('Error en obtenerAnalisisComparativo:', error);

            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    message: 'Errores de validación',
                    errors: error.errors
                });
                return;
            }

            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // ✅ ACTUALIZADO: Asiento Consolidado con diferencia expuesta
    static async obtenerAsientoContableConsolidado(req: Request, res: Response): Promise<void> {
        console.log('🚀 INICIANDO obtenerAsientoContableConsolidado');

        try {
            const { caso_id } = obtenerAnalisisSchema.parse(req.params);

            // ✅ OBTENER MONEDA DESDE QUERY PARAMS
            const moneda = (req.query.moneda as string)?.toUpperCase() === 'PEN' ? 'PEN' : 'USD';
            console.log('✅ Parámetros validados - caso_id:', caso_id, '- moneda:', moneda);

            const userId = (req as any).user?.sub;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    message: 'No autorizado. Token requerido.'
                });
                return;
            }

            console.log('📊 Generando asiento contable consolidado...');
            const asiento = await AnalisisService.generarAsientoContableConsolidado(caso_id, userId, moneda);

            console.log('✅ Asiento generado exitosamente');
            console.log('📈 Total de líneas:', asiento.detalles.length);
            console.log(`💰 Total Debe: ${asiento.totalDebe} ${asiento.moneda}`);
            console.log(`💰 Total Haber: ${asiento.totalHaber} ${asiento.moneda}`);
            console.log(`⚖️  Diferencia: ${asiento.diferencia} ${asiento.moneda}`);

            // ✅ ADVERTENCIA SI HAY DIFERENCIA
            if (Math.abs(asiento.diferencia) > 0.01) {
                console.warn(`⚠️  ADVERTENCIA: Asiento descuadrado por ${asiento.diferencia}`);
            }

            res.status(200).json({
                success: true,
                message: 'Asiento contable consolidado generado exitosamente',
                data: asiento,
                metadata: {
                    caso_id,
                    total_lineas: asiento.detalles.length,
                    diferencia: asiento.diferencia, // ✅ EXPONER DIFERENCIA
                    esta_balanceado: Math.abs(asiento.diferencia) <= 0.01,
                    moneda: asiento.moneda,
                    tipo_cambio: asiento.tipo_cambio,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error: any) {
            console.error('❌ ERROR EN CONTROLADOR:', error);

            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    message: 'Errores de validación en los parámetros',
                    errors: error.errors
                });
                return;
            }

            if (error.message === 'Caso de estudio no encontrado') {
                res.status(404).json({
                    success: false,
                    message: error.message
                });
                return;
            }

            res.status(500).json({
                success: false,
                message: 'Error interno del servidor al generar asiento consolidado',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}