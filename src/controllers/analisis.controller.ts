// controllers/analisis.controller.ts

import { Request, Response } from 'express';
import { AnalisisService } from '../services/analisis.service';
// ✅ IMPORTADO: Servicio de tipo de cambio
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
                tiene_ratios: !!analysis.ratios_financieros
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

            // ✅ ACTUALIZADO: Incluir ratios financieros completos
            const ratios = {
                caso_estudio_id: analysis.caso_estudio_id,
                nombre_caso: analysis.nombre_caso,
                ratios: {
                    margen_bruto: analysis.ratios_financieros.margen_bruto,
                    margen_operativo: analysis.ratios_financieros.margen_operativo,
                    margen_neto: analysis.ratios_financieros.margen_neto,
                    ros: analysis.ratios_financieros.ros,
                    roa: analysis.ratios_financieros.roa, // null si no hay inputs
                    roe: analysis.ratios_financieros.roe  // null si no hay inputs
                },
                utilidades: {
                    bruta: analysis.utilidad_bruta.utilidad_bruta,
                    operativa: analysis.utilidad_operativa.utilidad_operativa,
                    neta: analysis.utilidad_neta.utilidad_neta
                },
                ventas: {
                    total_con_igv: analysis.utilidad_bruta.ventas_totales,
                    total_sin_igv: analysis.utilidad_bruta.ventas_totales_sin_igv
                },
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

    // ✅ NUEVO: Obtener Estado de Resultados
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

            // Extraer solo el Estado de Resultados
            const estadoResultados = {
                caso_estudio_id: analysis.caso_estudio_id,
                nombre_caso: analysis.nombre_caso,
                estado_resultados: analysis.estado_resultados,
                resumen: {
                    ventas_sin_igv: analysis.estado_resultados.ventas.total_ventas_sin_igv,
                    utilidad_bruta: analysis.estado_resultados.utilidad_bruta,
                    utilidad_operativa: analysis.estado_resultados.utilidad_operativa,
                    utilidad_neta: analysis.estado_resultados.utilidad_neta
                }
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

            // --- INICIO DE CAMBIOS ---

            // 1. Obtener el tipo de cambio primero
            console.log('🔄 Obteniendo tipo de cambio para resumen...');
            const exchangeRate = await ExchangeRateService.getExchangeRate();
            console.log(`✅ Tasa de cambio obtenida: ${exchangeRate}`);

            // 2. Obtener el análisis (como estaba)
            const analysis = await AnalisisService.obtenerAnalisisRentabilidad(
                caso_id,
                userId,
                true
            );

            // 3. Construir el resumen usando la variable 'exchangeRate'
            // ✅ ACTUALIZADO: Usar ventas_totales_sin_igv y costo_ventas
            const summary = {
                caso_estudio_id: analysis.caso_estudio_id,
                nombre_caso: analysis.nombre_caso,
                resumen_operaciones: {
                    importaciones: {
                        cantidad: analysis.detalles.importaciones.length,
                        valor_total_cif: analysis.detalles.importaciones.reduce((sum, imp) => sum + imp.valor_cif, 0),
                        tributos_totales: analysis.detalles.importaciones.reduce((sum, imp) => sum + imp.dta_total, 0)
                    },
                    exportaciones: {
                        cantidad: analysis.detalles.exportaciones.length,
                        // 👇 CAMBIO REALIZADO: Usar 'exchangeRate' en lugar de 3.75
                        valor_total_ventas: analysis.detalles.exportaciones.reduce((sum, exp) => {
                            return sum + (exp.moneda === 'USD' ? exp.valor_venta : exp.valor_venta / exchangeRate);
                        }, 0),
                        ventas_nacionales: analysis.detalles.exportaciones.filter(exp => exp.es_venta_nacional).length,
                        exportaciones_internacionales: analysis.detalles.exportaciones.filter(exp => !exp.es_venta_nacional).length
                    },
                    gastos: {
                        total_operativos: analysis.detalles.gastos.operativos.length,
                        total_administrativos: analysis.detalles.gastos.administrativos.length,
                        total_ventas: analysis.detalles.gastos.ventas.length,
                        total_financieros: analysis.detalles.gastos.financieros.length
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
                }
            };

            // --- FIN DE CAMBIOS ---

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
// controllers/analisis.controller.ts - AGREGAR AL FINAL DE LA CLASE

// controllers/analisis.controller.ts - MODIFICAR EL MÉTODO

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

            res.status(200).json({
                success: true,
                message: 'Asiento contable consolidado generado exitosamente',
                data: asiento,
                metadata: {
                    caso_id,
                    total_lineas: asiento.detalles.length,
                    diferencia: Math.abs(asiento.totalDebe - asiento.totalHaber),
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