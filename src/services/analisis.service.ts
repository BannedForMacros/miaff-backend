// services/analisis.service.ts - VERSIÓN FINAL CON TIPO DE CAMBIO DINÁMICO Y FILTROS ACTIVO

import { dbQuery } from '../db';
import { GastoService } from './gastos.service';

import {
    RentabilityAnalysis,
    ImportacionDetalle,
    ExportacionDetalle,
    GastoDetalle,
    GastosPorClasificacion,
    UtilidadBruta,
    UtilidadOperativa,
    UtilidadNeta,
    EstadoResultados,
    RatiosFinancieros
} from '../types/analisis.types';
import { ExchangeRateService } from './exchangeRate.service'; // ✅ IMPORTAR SERVICIO DE TC

type CasoInfo = {
    nombre_caso: string;
    descripcion: string;
    estado: string;
    created_at: Date;
};

type Tributo = {
    id: number;
    concepto: string;
    base_imponible: number;
    tasa_aplicada: number;
    monto_calculado: number;
};

type CasoSimple = {
    id: number;
    nombre_caso: string;
    created_at: Date;
};

const TASA_IGV = 0.18; // 18%

export class AnalisisService {

    static async validarCasoExiste(casoId: number, userId: string): Promise<boolean> {
        const sql = `SELECT id FROM miaff.casos_de_estudio WHERE id = $1 AND user_id = $2`;
        const { rows } = await dbQuery(sql, [casoId, userId]);
        return rows.length > 0;
    }

    static async obtenerAnalisisRentabilidad(
        casoId: number,
        userId: string,
        incluirDetalles = true
    ): Promise<RentabilityAnalysis> {

        const casoExists = await this.validarCasoExiste(casoId, userId);
        if (!casoExists) {
            throw new Error('Caso de estudio no encontrado o no autorizado');
        }

        // ✅ OBTENER TIPO DE CAMBIO DINÁMICO
        const tipoCambio = await ExchangeRateService.getExchangeRate();
        console.log(`💱 Tipo de cambio actual: S/ ${tipoCambio.toFixed(3)}`);

        const casoInfo = await this.obtenerInfoCaso(casoId);
        const importaciones = await this.obtenerImportaciones(casoId);
        const exportaciones = await this.obtenerExportaciones(casoId);
        const gastos = await this.obtenerGastosPorClasificacion(casoId);

        // ✅ PASAR TIPO DE CAMBIO A LOS CÁLCULOS
        const estadoResultados = this.calcularEstadoResultados(
            exportaciones,
            importaciones,
            gastos,
            tipoCambio // ✅ NUEVO PARÁMETRO
        );

        // Calcular utilidades (compatibilidad)
        const utilidadBruta: UtilidadBruta = {
            ventas_totales: estadoResultados.ventas.total_ventas,
            ventas_totales_sin_igv: estadoResultados.ventas.total_ventas_sin_igv,
            costo_ventas: estadoResultados.costo_ventas.total_costo_ventas,
            utilidad_bruta: estadoResultados.utilidad_bruta,
            margen_bruto_porcentaje: this.calcularPorcentaje(
                estadoResultados.utilidad_bruta,
                estadoResultados.ventas.total_ventas_sin_igv
            )
        };

        const utilidadOperativa: UtilidadOperativa = {
            utilidad_bruta: estadoResultados.utilidad_bruta,
            gastos_operativos: estadoResultados.gastos_operativos.total_gastos_operativos,
            utilidad_operativa: estadoResultados.utilidad_operativa,
            margen_operativo_porcentaje: this.calcularPorcentaje(
                estadoResultados.utilidad_operativa,
                estadoResultados.ventas.total_ventas_sin_igv
            )
        };

        const utilidadNeta: UtilidadNeta = {
            utilidad_operativa: estadoResultados.utilidad_operativa,
            gastos_administrativos: estadoResultados.gastos_administrativos.total_gastos_administrativos,
            gastos_ventas: estadoResultados.gastos_ventas.total_gastos_ventas,
            gastos_financieros: estadoResultados.gastos_financieros.total_gastos_financieros,
            total_otros_gastos:
                estadoResultados.gastos_administrativos.total_gastos_administrativos +
                estadoResultados.gastos_ventas.total_gastos_ventas +
                estadoResultados.gastos_financieros.total_gastos_financieros,
            utilidad_neta: estadoResultados.utilidad_neta,
            margen_neto_porcentaje: this.calcularPorcentaje(
                estadoResultados.utilidad_neta,
                estadoResultados.ventas.total_ventas_sin_igv
            )
        };

        // Calcular ratios financieros (sin ROA/ROE, se calculan en frontend)
        const ratiosFinancieros: RatiosFinancieros = {
            margen_bruto: utilidadBruta.margen_bruto_porcentaje,
            margen_operativo: utilidadOperativa.margen_operativo_porcentaje,
            margen_neto: utilidadNeta.margen_neto_porcentaje,
            ros: utilidadNeta.margen_neto_porcentaje,
            roa: null,
            roe: null
        };

        // ✅ PASAR TIPO DE CAMBIO AL RESUMEN
        const resumenMonedas = this.calcularResumenMonedas(
            importaciones,
            exportaciones,
            gastos,
            tipoCambio // ✅ NUEVO PARÁMETRO
        );

        const result: RentabilityAnalysis = {
            caso_estudio_id: casoId,
            nombre_caso: casoInfo.nombre_caso,
            utilidad_bruta: utilidadBruta,
            utilidad_operativa: utilidadOperativa,
            utilidad_neta: utilidadNeta,
            detalles: {
                importaciones: incluirDetalles ? importaciones : [],
                exportaciones: incluirDetalles ? exportaciones : [],
                gastos: incluirDetalles ? gastos : {
                    operativos: [],
                    administrativos: [],
                    ventas: [],
                    financieros: []
                }
            },
            estado_resultados: estadoResultados,
            ratios_financieros: ratiosFinancieros,
            resumen_monedas: resumenMonedas
        };

        return result;
    }

    private static async obtenerInfoCaso(casoId: number): Promise<CasoInfo> {
        const sql = `
            SELECT nombre_caso, descripcion, estado, created_at
            FROM miaff.casos_de_estudio WHERE id = $1
        `;
        const { rows } = await dbQuery<CasoInfo>(sql, [casoId]);
        return rows[0];
    }

    // ✅ FILTRO AGREGADO: activo = 1
    private static async obtenerImportaciones(casoId: number): Promise<ImportacionDetalle[]> {
        const sql = `
            SELECT i.id, i.subpartida_hs10, i.descripcion_mercancia,
                   i.valor_fob, i.valor_flete, i.valor_seguro, i.valor_cif,
                   i.monto_ad_valorem, i.monto_isc, i.monto_igv, i.monto_ipm,
                   i.monto_percepcion, i.dta_total, i.fecha_operacion
            FROM miaff.importaciones i
            WHERE i.caso_estudio_id = $1 AND i.activo = 1
            ORDER BY i.fecha_operacion DESC, i.id DESC
        `;
        const { rows } = await dbQuery<ImportacionDetalle>(sql, [casoId]);
        const importaciones = rows;
        for (const imp of importaciones) {
            imp.tributos = await this.obtenerTributosImportacion(imp.id);
        }
        return importaciones;
    }

    private static async obtenerTributosImportacion(importacionId: number): Promise<Tributo[]> {
        const sql = `
            SELECT id, concepto, base_imponible, tasa_aplicada, monto_calculado
            FROM miaff.importacion_tributos
            WHERE importacion_id = $1
            ORDER BY concepto
        `;
        const { rows } = await dbQuery<Tributo>(sql, [importacionId]);
        return rows;
    }

    // ✅ FILTRO AGREGADO: activo = true
    private static async obtenerExportaciones(casoId: number): Promise<ExportacionDetalle[]> {
        const sql = `
            SELECT id, es_venta_nacional, incoterm, descripcion_venta,
                   valor_venta, moneda, fecha_operacion, pais_origen, pais_destino
            FROM miaff.exportaciones
            WHERE caso_estudio_id = $1 AND activo = true
            ORDER BY fecha_operacion DESC, id DESC
        `;
        const { rows } = await dbQuery<ExportacionDetalle>(sql, [casoId]);
        return rows;
    }

    private static async obtenerGastosPorClasificacion(casoId: number): Promise<GastosPorClasificacion> {
        const sql = `
            SELECT
                g.id,
                g.clasificacion_id,
                cg.tipo_gasto as clasificacion_nombre,
                g.descripcion,
                g.cuenta_contable_codigo,
                g.monto,
                g.moneda,
                g.fecha_gasto
            FROM miaff.gastos g
                     INNER JOIN miaff.clasificacion_gastos cg ON g.clasificacion_id = cg.id
            WHERE g.caso_estudio_id = $1
            ORDER BY g.fecha_gasto DESC, g.id DESC
        `;

        const { rows } = await dbQuery<GastoDetalle>(sql, [casoId]);

        console.log('📊 Gastos obtenidos:', rows.length);
        if (rows.length > 0) {
            console.log('📋 Ejemplo de gasto:', {
                id: rows[0].id,
                descripcion: rows[0].descripcion,
                clasificacion_nombre: rows[0].clasificacion_nombre,
                monto: rows[0].monto
            });
        }

        const gastosPorClasificacion: GastosPorClasificacion = {
            operativos: [],
            administrativos: [],
            ventas: [],
            financieros: []
        };

        rows.forEach(gasto => {
            const tipoGasto = gasto.clasificacion_nombre.toUpperCase();

            console.log(`🔍 Clasificando gasto ID ${gasto.id}: ${tipoGasto}`);

            if (tipoGasto === 'OPERATIVO') {
                gastosPorClasificacion.operativos.push(gasto);
            } else if (tipoGasto === 'ADMINISTRATIVO') {
                gastosPorClasificacion.administrativos.push(gasto);
            } else if (tipoGasto === 'VENTAS') {
                gastosPorClasificacion.ventas.push(gasto);
            } else if (tipoGasto === 'FINANCIERO') {
                gastosPorClasificacion.financieros.push(gasto);
            } else {
                console.warn(`⚠️ Tipo de gasto no reconocido: ${tipoGasto} para gasto ID ${gasto.id}`);
            }
        });

        console.log('✅ Resumen de clasificación:', {
            operativos: gastosPorClasificacion.operativos.length,
            administrativos: gastosPorClasificacion.administrativos.length,
            ventas: gastosPorClasificacion.ventas.length,
            financieros: gastosPorClasificacion.financieros.length
        });

        return gastosPorClasificacion;
    }

    // ✅ CALCULAR ESTADO DE RESULTADOS CON TIPO DE CAMBIO DINÁMICO
    private static calcularEstadoResultados(
        exportaciones: ExportacionDetalle[],
        importaciones: ImportacionDetalle[],
        gastos: GastosPorClasificacion,
        tipoCambio: number // ✅ NUEVO PARÁMETRO
    ): EstadoResultados {

        console.log(`💱 Calculando Estado de Resultados con TC: S/ ${tipoCambio.toFixed(3)}`);

        // 1. VENTAS
        let mercaderiasNacionales = 0;
        let mercaderiasInternacionales = 0;
        let productosNacionales = 0;
        let productosInternacionales = 0;

        exportaciones.forEach(exp => {
            const valorUSD = exp.moneda === 'USD'
                ? parseFloat(exp.valor_venta.toString())
                : parseFloat(exp.valor_venta.toString()) / tipoCambio; // ✅ USAR TC DINÁMICO

            if (exp.es_venta_nacional) {
                mercaderiasNacionales += valorUSD;
            } else {
                mercaderiasInternacionales += valorUSD;
            }
        });

        const totalVentas = mercaderiasNacionales + mercaderiasInternacionales + productosNacionales + productosInternacionales;
        const totalVentasSinIgv = totalVentas / (1 + TASA_IGV);

        // 2. COSTO DE VENTAS
        let materiasPrimas = 0;
        let materialesAuxiliares = 0;
        let envasesEmbalajes = 0;
        let costosVinculados = 0;

        importaciones.forEach(imp => {
            const valorCif = parseFloat(imp.valor_cif.toString()) || 0;
            const dtaTotal = parseFloat(imp.dta_total.toString()) || 0;

            const tributos = imp.tributos || [];
            const costosVinculadosImp = tributos
                .filter(t => ['antidumping', 'compensatorio', 'sda'].includes(t.concepto.toLowerCase()))
                .reduce((sum, t) => sum + (parseFloat(t.monto_calculado.toString()) || 0), 0);

            costosVinculados += costosVinculadosImp;
            materiasPrimas += (valorCif + dtaTotal - costosVinculadosImp);
        });

        const totalCostoVentas = materiasPrimas + materialesAuxiliares + envasesEmbalajes + costosVinculados;

        // 3. UTILIDAD BRUTA
        const utilidadBruta = totalVentasSinIgv - totalCostoVentas;

        // 4. GASTOS OPERATIVOS (desglosados) ✅ PASAR TC
        const gastosOperativosDetalle = this.desglosarGastos(gastos.operativos, tipoCambio);
        const totalGastosOperativos = gastosOperativosDetalle.total;

        // 5. UTILIDAD OPERATIVA
        const utilidadOperativa = utilidadBruta - totalGastosOperativos;

        // 6. GASTOS ADMINISTRATIVOS (desglosados) ✅ PASAR TC
        const gastosAdministrativosDetalle = this.desglosarGastos(gastos.administrativos, tipoCambio);
        const totalGastosAdministrativos = gastosAdministrativosDetalle.total;

        // 7. GASTOS DE VENTAS (desglosados) ✅ PASAR TC
        const gastosVentasDetalle = this.desglosarGastosVentas(gastos.ventas, tipoCambio);
        const totalGastosVentas = gastosVentasDetalle.total;

        // 8. GASTOS FINANCIEROS (desglosados) ✅ PASAR TC
        const gastosFinancierosDetalle = this.desglosarGastosFinancieros(gastos.financieros, tipoCambio);
        const totalGastosFinancieros = gastosFinancierosDetalle.total;

        // 9. UTILIDAD NETA
        const utilidadNeta = utilidadOperativa - totalGastosAdministrativos - totalGastosVentas - totalGastosFinancieros;

        return {
            ventas: {
                mercaderias_nacionales: this.redondear(mercaderiasNacionales),
                mercaderias_internacionales: this.redondear(mercaderiasInternacionales),
                productos_terminados_nacionales: this.redondear(productosNacionales),
                productos_terminados_internacionales: this.redondear(productosInternacionales),
                total_ventas: this.redondear(totalVentas),
                total_ventas_sin_igv: this.redondear(totalVentasSinIgv)
            },
            costo_ventas: {
                materias_primas: this.redondear(materiasPrimas),
                materiales_auxiliares: this.redondear(materialesAuxiliares),
                envases_embalajes: this.redondear(envasesEmbalajes),
                costos_vinculados: this.redondear(costosVinculados),
                total_costo_ventas: this.redondear(totalCostoVentas)
            },
            utilidad_bruta: this.redondear(utilidadBruta),
            gastos_operativos: {
                ...gastosOperativosDetalle,
                total_gastos_operativos: this.redondear(totalGastosOperativos)
            },
            utilidad_operativa: this.redondear(utilidadOperativa),
            gastos_administrativos: {
                ...gastosAdministrativosDetalle,
                total_gastos_administrativos: this.redondear(totalGastosAdministrativos)
            },
            gastos_ventas: {
                ...gastosVentasDetalle,
                total_gastos_ventas: this.redondear(totalGastosVentas)
            },
            gastos_financieros: {
                ...gastosFinancierosDetalle,
                total_gastos_financieros: this.redondear(totalGastosFinancieros)
            },
            utilidad_neta: this.redondear(utilidadNeta)
        };
    }

    // ✅ DESGLOSAR GASTOS CON TIPO DE CAMBIO DINÁMICO
    private static desglosarGastos(gastos: GastoDetalle[], tipoCambio: number) {
        let remuneraciones = 0;
        let seguridadSocial = 0;
        let transporteViajes = 0;
        let asesoriaConsultoria = 0;
        let produccionTerceros = 0;
        let mantenimientoReparaciones = 0;
        let alquileres = 0;
        let serviciosBasicos = 0;
        let otrosServicios = 0;
        let seguros = 0;
        let otrosGastos = 0;

        gastos.forEach(gasto => {
            const monto = this.convertirAUSD(gasto.monto, gasto.moneda, tipoCambio); // ✅ PASAR TC
            const desc = gasto.descripcion.toLowerCase();
            const cuenta = (gasto.cuenta_contable_codigo || '').toLowerCase();

            if (desc.includes('remunerac') || cuenta.startsWith('621')) remuneraciones += monto;
            else if (desc.includes('seguridad') || desc.includes('social') || desc.includes('essalud') || cuenta.startsWith('627')) seguridadSocial += monto;
            else if (desc.includes('transport') || desc.includes('viaje') || cuenta.startsWith('631')) transporteViajes += monto;
            else if (desc.includes('asesor') || desc.includes('consult') || cuenta.startsWith('632')) asesoriaConsultoria += monto;
            else if (desc.includes('producc') || desc.includes('tercer') || cuenta.startsWith('633')) produccionTerceros += monto;
            else if (desc.includes('mantenimiento') || desc.includes('reparac') || cuenta.startsWith('634')) mantenimientoReparaciones += monto;
            else if (desc.includes('alquiler') || cuenta.startsWith('635')) alquileres += monto;
            else if (desc.includes('luz') || desc.includes('agua') || desc.includes('internet') || cuenta.startsWith('636')) serviciosBasicos += monto;
            else if (desc.includes('servicio') || cuenta.startsWith('639')) otrosServicios += monto;
            else if (desc.includes('seguro') || cuenta.startsWith('651')) seguros += monto;
            else otrosGastos += monto;
        });

        return {
            remuneraciones: this.redondear(remuneraciones),
            seguridad_social: this.redondear(seguridadSocial),
            transporte_viajes: this.redondear(transporteViajes),
            asesoria_consultoria: this.redondear(asesoriaConsultoria),
            produccion_terceros: this.redondear(produccionTerceros),
            mantenimiento_reparaciones: this.redondear(mantenimientoReparaciones),
            alquileres: this.redondear(alquileres),
            servicios_basicos: this.redondear(serviciosBasicos),
            otros_servicios: this.redondear(otrosServicios),
            seguros: this.redondear(seguros),
            otros_gastos: this.redondear(otrosGastos),
            total: remuneraciones + seguridadSocial + transporteViajes + asesoriaConsultoria +
                produccionTerceros + mantenimientoReparaciones + alquileres +
                serviciosBasicos + otrosServicios + seguros + otrosGastos
        };
    }

    // ✅ DESGLOSAR GASTOS DE VENTAS CON TC
    private static desglosarGastosVentas(gastos: GastoDetalle[], tipoCambio: number) {
        const base = this.desglosarGastos(gastos, tipoCambio); // ✅ PASAR TC
        let publicidad = 0;

        gastos.forEach(gasto => {
            const monto = this.convertirAUSD(gasto.monto, gasto.moneda, tipoCambio); // ✅ PASAR TC
            const desc = gasto.descripcion.toLowerCase();
            const cuenta = (gasto.cuenta_contable_codigo || '').toLowerCase();

            if (desc.includes('publicidad') || desc.includes('marketing') || desc.includes('publicacion') || cuenta.startsWith('637')) {
                publicidad += monto;
            }
        });

        return {
            ...base,
            publicidad: this.redondear(publicidad)
        };
    }

    // ✅ DESGLOSAR GASTOS FINANCIEROS CON TC
    private static desglosarGastosFinancieros(gastos: GastoDetalle[], tipoCambio: number) {
        let interesesDesgravamen = 0;
        let comisionesBancarias = 0;

        gastos.forEach(gasto => {
            const monto = this.convertirAUSD(gasto.monto, gasto.moneda, tipoCambio); // ✅ PASAR TC
            const desc = gasto.descripcion.toLowerCase();
            const cuenta = (gasto.cuenta_contable_codigo || '').toLowerCase();

            if (desc.includes('interes') || desc.includes('desgravamen') || cuenta.startsWith('67')) {
                interesesDesgravamen += monto;
            } else if (desc.includes('comision') || desc.includes('bancari') || cuenta.startsWith('639')) {
                comisionesBancarias += monto;
            }
        });

        return {
            intereses_desgravamen: this.redondear(interesesDesgravamen),
            comisiones_bancarias: this.redondear(comisionesBancarias),
            total: interesesDesgravamen + comisionesBancarias
        };
    }

    // ✅ CONVERTIR A USD CON TIPO DE CAMBIO DINÁMICO
    private static convertirAUSD(monto: number, moneda: string, tipoCambio: number): number {
        const valor = parseFloat(monto.toString()) || 0;
        return moneda === 'USD' ? valor : valor / tipoCambio; // ✅ USAR TC DINÁMICO
    }

    private static redondear(valor: number): number {
        return parseFloat(valor.toFixed(2));
    }

    private static calcularPorcentaje(valor: number, base: number): number {
        if (base === 0) return 0;
        return this.redondear((valor / base) * 100);
    }

    // ✅ CALCULAR RESUMEN DE MONEDAS CON TC DINÁMICO
    private static calcularResumenMonedas(
        importaciones: ImportacionDetalle[],
        exportaciones: ExportacionDetalle[],
        gastos: GastosPorClasificacion,
        tipoCambio: number // ✅ NUEVO PARÁMETRO
    ) {
        let totalUSD = 0;
        let totalPEN = 0;

        exportaciones.forEach(exp => {
            const valorVenta = parseFloat(exp.valor_venta.toString()) || 0;
            if (exp.moneda === 'USD') totalUSD += valorVenta;
            else totalPEN += valorVenta;
        });

        importaciones.forEach(imp => {
            const valorCif = parseFloat(imp.valor_cif.toString()) || 0;
            const dtaTotal = parseFloat(imp.dta_total.toString()) || 0;
            totalUSD += valorCif + dtaTotal;
        });

        const todosGastos = [
            ...gastos.operativos,
            ...gastos.administrativos,
            ...gastos.ventas,
            ...gastos.financieros
        ];

        todosGastos.forEach(gasto => {
            const monto = parseFloat(gasto.monto.toString()) || 0;
            if (gasto.moneda === 'USD') totalUSD += monto;
            else totalPEN += monto;
        });

        return {
            total_usd: parseFloat(totalUSD.toFixed(2)),
            total_pen: parseFloat(totalPEN.toFixed(2)),
            tipo_cambio_sugerido: tipoCambio
        };
    }

    static async obtenerComparativo(userId: string, limite = 10) {
        const sql = `
            SELECT id, nombre_caso, created_at
            FROM miaff.casos_de_estudio
            WHERE user_id = $1
            ORDER BY created_at DESC
                LIMIT $2
        `;

        const { rows } = await dbQuery<CasoSimple>(sql, [userId, limite]);

        if (rows.length === 0) {
            return {
                total_casos: 0,
                casos: [],
                estadisticas: {
                    mejor_margen: 0,
                    peor_margen: 0,
                    promedio_margen: '0.00'
                }
            };
        }

        const comparativeData = await Promise.all(
            rows.map(async (caso) => {
                try {
                    const analysis = await this.obtenerAnalisisRentabilidad(caso.id, userId, false);
                    return {
                        caso_id: caso.id,
                        nombre_caso: caso.nombre_caso,
                        fecha_creacion: caso.created_at,
                        margen_neto: analysis.utilidad_neta.margen_neto_porcentaje,
                        utilidad_neta: analysis.utilidad_neta.utilidad_neta,
                        ventas_totales: analysis.utilidad_bruta.ventas_totales
                    };
                } catch (error) {
                    return {
                        caso_id: caso.id,
                        nombre_caso: caso.nombre_caso,
                        fecha_creacion: caso.created_at,
                        margen_neto: 0,
                        utilidad_neta: 0,
                        ventas_totales: 0,
                        error: 'Error al calcular análisis'
                    };
                }
            })
        );

        const margenes = comparativeData.map(c => c.margen_neto || 0);

        return {
            total_casos: rows.length,
            casos: comparativeData,
            estadisticas: {
                mejor_margen: Math.max(...margenes),
                peor_margen: Math.min(...margenes),
                promedio_margen: (margenes.reduce((sum, m) => sum + m, 0) / margenes.length).toFixed(2)
            }
        };
    }

    private static async _obtenerReglasContables(): Promise<Map<string, { cuenta: string; nombre_cuenta: string }>> {
        try {
            const { rows } = await dbQuery(`
                SELECT
                    cc.concepto,
                    cu.codigo as cuenta,
                    cu.nombre as nombre_cuenta
                FROM
                    miaff.concepto_cuenta cc
                        JOIN
                    miaff.cuenta_contable cu ON cu.id = cc.cuenta_id
            `);

            const reglasMap = new Map<string, { cuenta: string; nombre_cuenta: string }>();
            rows.forEach(row => {
                reglasMap.set(row.concepto, { cuenta: row.cuenta, nombre_cuenta: row.nombre_cuenta });
            });
            return reglasMap;

        } catch (error) {
            console.error('Error fatal: No se pudieron cargar las reglas contables.', error);
            throw new Error('No se pudieron cargar las reglas contables desde la base de datos.');
        }
    }

    static async generarAsientoContableConsolidado(
        casoId: number,
        userId: string,
        monedaBase: 'USD' | 'PEN' = 'USD'
    ): Promise<{
        fecha: string;
        descripcion: string;
        detalles: Array<{
            cuenta: string;
            nombre_cuenta: string;
            debe: number;
            haber: number;
            glosa: string;
        }>;
        totalDebe: number;
        totalHaber: number;
        moneda: string;
        tipo_cambio: number;
    }> {
        try {
            console.log('🔍 ========================================');
            console.log('   INICIANDO ASIENTO CONTABLE CONSOLIDADO');
            console.log('========================================');
            console.log('   Caso ID:', casoId);
            console.log('   User ID:', userId);
            console.log('   Moneda Base:', monedaBase);

            // ===== VALIDACIONES =====
            const casoExists = await this.validarCasoExiste(casoId, userId);
            if (!casoExists) {
                throw new Error('Caso de estudio no encontrado');
            }

            const casoInfo = await this.obtenerInfoCaso(casoId);
            console.log('✅ Caso validado:', casoInfo.nombre_caso);

            // ===== TIPO DE CAMBIO =====
            const tipoCambio = await ExchangeRateService.getExchangeRate();
            console.log(`💱 Tipo de cambio: S/ ${tipoCambio.toFixed(4)}`);

            // ===== MAPA DE CUENTAS CONSOLIDADO =====
            const cuentasMap = new Map<string, {
                nombre_cuenta: string;
                debe: number;
                haber: number;
                glosa: string;
            }>();

            // ========================================
            // 1. IMPORTACIONES
            // ========================================
            console.log('\n📦 PASO 1: Procesando IMPORTACIONES...');

            const importacionesSql = `
                SELECT id, asiento_contable_json, descripcion_mercancia
                FROM miaff.importaciones
                WHERE caso_estudio_id = $1 AND activo = 1
                ORDER BY fecha_operacion, id
            `;
            const { rows: importaciones } = await dbQuery<any>(importacionesSql, [casoId]);
            console.log(`   📋 ${importaciones.length} importaciones encontradas`);

            importaciones.forEach((imp: any, idx: number) => {
                console.log(`   [${idx + 1}/${importaciones.length}] Importación ID ${imp.id}`);

                if (!imp.asiento_contable_json) {
                    console.log(`      ⚠️  Sin asiento contable, saltando...`);
                    return;
                }

                try {
                    const asiento = typeof imp.asiento_contable_json === 'string'
                        ? JSON.parse(imp.asiento_contable_json)
                        : imp.asiento_contable_json;

                    if (!Array.isArray(asiento)) {
                        console.log(`      ⚠️  asiento_contable_json no es array, saltando...`);
                        return;
                    }

                    console.log(`      ✓ ${asiento.length} líneas en el asiento`);

                    asiento.forEach((linea: any) => {
                        const cuenta = linea.cuenta || linea.codigo_cuenta;
                        const nombreCuenta = linea.nombre_cuenta || linea.denominacion;
                        let debe = parseFloat(linea.debe) || 0;
                        let haber = parseFloat(linea.haber) || 0;

                        // ✅ CONVERTIR A MONEDA BASE (importaciones están en USD)
                        if (monedaBase === 'PEN') {
                            debe = debe * tipoCambio;
                            haber = haber * tipoCambio;
                        }

                        const glosa = linea.glosa || `Importación - ${imp.descripcion_mercancia}`;

                        if (!cuenta) return;

                        if (!cuentasMap.has(cuenta)) {
                            cuentasMap.set(cuenta, {
                                nombre_cuenta: nombreCuenta,
                                debe: 0,
                                haber: 0,
                                glosa: glosa
                            });
                        }

                        const existing = cuentasMap.get(cuenta)!;
                        existing.debe += debe;
                        existing.haber += haber;
                    });
                } catch (parseError: any) {
                    console.error(`      ❌ Error parseando asiento:`, parseError.message);
                }
            });

            console.log(`   ✅ Importaciones completadas. Cuentas: ${cuentasMap.size}`);

            // ========================================
            // 2. EXPORTACIONES
            // ========================================
            console.log('\n🚢 PASO 2: Procesando EXPORTACIONES...');

            const exportacionesSql = `
                SELECT id, es_venta_nacional, descripcion_venta, valor_venta, moneda
                FROM miaff.exportaciones
                WHERE caso_estudio_id = $1 AND activo = true
                ORDER BY fecha_operacion, id
            `;
            const { rows: exportaciones } = await dbQuery<any>(exportacionesSql, [casoId]);
            console.log(`   📋 ${exportaciones.length} exportaciones encontradas`);

            if (exportaciones.length > 0) {
                const reglas = await this._obtenerReglasContables();
                const reglaClientes = reglas.get('clientes') || { cuenta: '12', nombre_cuenta: 'Clientes' };
                const reglaVentas = reglas.get('ventas') || { cuenta: '70', nombre_cuenta: 'Ventas' };
                const reglaIGV = reglas.get('igv') || { cuenta: '40111', nombre_cuenta: 'IGV – Cuenta propia' };

                console.log('   🔧 Reglas aplicadas:');
                console.log(`      - Clientes: ${reglaClientes.cuenta}`);
                console.log(`      - Ventas: ${reglaVentas.cuenta}`);
                console.log(`      - IGV: ${reglaIGV.cuenta}`);

                exportaciones.forEach((exp: any, idx: number) => {
                    console.log(`   [${idx + 1}/${exportaciones.length}] Exportación ID ${exp.id}`);

                    const valorVenta = parseFloat(exp.valor_venta) || 0;

                    // ✅ CONVERTIR A MONEDA BASE
                    let valorEnMonedaBase: number;
                    if (monedaBase === 'USD') {
                        valorEnMonedaBase = exp.moneda === 'USD' ? valorVenta : valorVenta / tipoCambio;
                    } else {
                        valorEnMonedaBase = exp.moneda === 'PEN' ? valorVenta : valorVenta * tipoCambio;
                    }

                    console.log(`      💰 Valor: ${valorVenta} ${exp.moneda} → ${valorEnMonedaBase.toFixed(2)} ${monedaBase}`);

                    if (exp.es_venta_nacional) {
                        // Venta nacional: incluye IGV (18%)
                        const valorSinIgv = valorEnMonedaBase / 1.18;
                        const igvVenta = valorEnMonedaBase - valorSinIgv;

                        console.log(`      ✓ Venta Nacional: Base ${valorSinIgv.toFixed(2)} + IGV ${igvVenta.toFixed(2)}`);

                        // 12 - Clientes (DEBE)
                        if (!cuentasMap.has(reglaClientes.cuenta)) {
                            cuentasMap.set(reglaClientes.cuenta, {
                                nombre_cuenta: reglaClientes.nombre_cuenta,
                                debe: 0,
                                haber: 0,
                                glosa: 'Ventas nacionales'
                            });
                        }
                        cuentasMap.get(reglaClientes.cuenta)!.debe += valorEnMonedaBase;

                        // 70 - Ventas (HABER)
                        if (!cuentasMap.has(reglaVentas.cuenta)) {
                            cuentasMap.set(reglaVentas.cuenta, {
                                nombre_cuenta: reglaVentas.nombre_cuenta,
                                debe: 0,
                                haber: 0,
                                glosa: 'Ventas de mercaderías'
                            });
                        }
                        cuentasMap.get(reglaVentas.cuenta)!.haber += valorSinIgv;

                        // 40111 - IGV (HABER)
                        if (!cuentasMap.has(reglaIGV.cuenta)) {
                            cuentasMap.set(reglaIGV.cuenta, {
                                nombre_cuenta: reglaIGV.nombre_cuenta,
                                debe: 0,
                                haber: 0,
                                glosa: 'IGV de ventas'
                            });
                        }
                        cuentasMap.get(reglaIGV.cuenta)!.haber += igvVenta;

                    } else {
                        // Exportación: sin IGV
                        console.log(`      ✓ Exportación: ${valorEnMonedaBase.toFixed(2)} (sin IGV)`);

                        // 12 - Clientes (DEBE)
                        if (!cuentasMap.has(reglaClientes.cuenta)) {
                            cuentasMap.set(reglaClientes.cuenta, {
                                nombre_cuenta: reglaClientes.nombre_cuenta,
                                debe: 0,
                                haber: 0,
                                glosa: 'Exportaciones'
                            });
                        }
                        cuentasMap.get(reglaClientes.cuenta)!.debe += valorEnMonedaBase;

                        // 70 - Ventas (HABER)
                        if (!cuentasMap.has(reglaVentas.cuenta)) {
                            cuentasMap.set(reglaVentas.cuenta, {
                                nombre_cuenta: reglaVentas.nombre_cuenta,
                                debe: 0,
                                haber: 0,
                                glosa: 'Ventas de exportación'
                            });
                        }
                        cuentasMap.get(reglaVentas.cuenta)!.haber += valorEnMonedaBase;
                    }
                });
            }

            console.log(`   ✅ Exportaciones completadas. Cuentas: ${cuentasMap.size}`);

            // ========================================
            // 3. GASTOS (USANDO ASIENTO GENERADO)
            // ========================================
            console.log('\n💸 PASO 3: Procesando GASTOS...');

            try {
                // ✅ GENERAR ASIENTO DE GASTOS USANDO EL SERVICE
                const asientoGastos = await GastoService.generarAsientoContable(userId, casoId);
                console.log(`   📋 Asiento de gastos generado: ${asientoGastos.detalles.length} líneas`);
                console.log(`   💰 Total Debe: ${asientoGastos.total_debe.toFixed(2)}`);
                console.log(`   💰 Total Haber: ${asientoGastos.total_haber.toFixed(2)}`);

                // ✅ DETECTAR LA MONEDA DEL ASIENTO DE GASTOS
                const gastosMonedaSql = `
                    SELECT DISTINCT g.moneda
                    FROM miaff.gastos g
                    WHERE g.caso_estudio_id = $1
                `;
                const { rows: monedasGastos } = await dbQuery<{ moneda: string }>(gastosMonedaSql, [casoId]);

                const monedaGastos = monedasGastos.length === 1 ? monedasGastos[0].moneda : 'PEN';
                console.log(`   🔍 Moneda detectada en gastos: ${monedaGastos}`);

                // ✅ PROCESAR CADA LÍNEA DEL ASIENTO DE GASTOS
                asientoGastos.detalles.forEach((linea: any, idx: number) => {
                    const cuenta = linea.codigo_cuenta;
                    const nombreCuenta = linea.denominacion;
                    let debe = parseFloat(linea.debe.toString()) || 0;
                    let haber = parseFloat(linea.haber.toString()) || 0;

                    console.log(`   [${idx + 1}/${asientoGastos.detalles.length}] ${cuenta}: D=${debe.toFixed(2)} H=${haber.toFixed(2)}`);

                    // ✅ CONVERTIR A MONEDA BASE
                    if (monedaGastos === 'PEN' && monedaBase === 'USD') {
                        debe = debe / tipoCambio;
                        haber = haber / tipoCambio;
                        console.log(`      → Convertido a USD: D=${debe.toFixed(2)} H=${haber.toFixed(2)}`);
                    } else if (monedaGastos === 'USD' && monedaBase === 'PEN') {
                        debe = debe * tipoCambio;
                        haber = haber * tipoCambio;
                        console.log(`      → Convertido a PEN: D=${debe.toFixed(2)} H=${haber.toFixed(2)}`);
                    }

                    if (!cuenta) {
                        console.log(`      ⚠️  Línea sin cuenta, saltando...`);
                        return;
                    }

                    if (!cuentasMap.has(cuenta)) {
                        cuentasMap.set(cuenta, {
                            nombre_cuenta: nombreCuenta,
                            debe: 0,
                            haber: 0,
                            glosa: 'Gastos del caso'
                        });
                    }

                    const existing = cuentasMap.get(cuenta)!;
                    existing.debe += debe;
                    existing.haber += haber;
                });

                console.log(`   ✅ Gastos completados. Cuentas: ${cuentasMap.size}`);

            } catch (error: any) {
                console.error('   ❌ ERROR procesando gastos:', error.message);
                throw new Error(`Error procesando gastos: ${error.message}`);
            }

            // ========================================
            // 4. CONSOLIDACIÓN FINAL
            // ========================================
            console.log('\n📊 PASO 4: Consolidando asiento final...');

            const detalles = Array.from(cuentasMap.entries())
                .map(([cuenta, data]) => ({
                    cuenta,
                    nombre_cuenta: data.nombre_cuenta,
                    debe: parseFloat(data.debe.toFixed(2)),
                    haber: parseFloat(data.haber.toFixed(2)),
                    glosa: data.glosa
                }))
                .filter(d => d.debe > 0 || d.haber > 0)
                .sort((a, b) => a.cuenta.localeCompare(b.cuenta));

            const totalDebe = detalles.reduce((sum, d) => sum + d.debe, 0);
            const totalHaber = detalles.reduce((sum, d) => sum + d.haber, 0);
            const diferencia = Math.abs(totalDebe - totalHaber);

            console.log('\n========================================');
            console.log('✅ ASIENTO CONSOLIDADO GENERADO');
            console.log('========================================');
            console.log(`📋 Total líneas: ${detalles.length}`);
            console.log(`💰 Total Debe: ${totalDebe.toFixed(2)} ${monedaBase}`);
            console.log(`💰 Total Haber: ${totalHaber.toFixed(2)} ${monedaBase}`);
            console.log(`⚖️  Diferencia: ${diferencia.toFixed(2)} ${monedaBase}`);

            if (diferencia > 0.01) {
                console.warn(`⚠️  ADVERTENCIA: Asiento descuadrado por ${diferencia.toFixed(2)}`);
            }

            console.log('========================================\n');

            return {
                fecha: new Date().toISOString().split('T')[0],
                descripcion: `Asiento consolidado del caso: ${casoInfo.nombre_caso}`,
                detalles,
                totalDebe: parseFloat(totalDebe.toFixed(2)),
                totalHaber: parseFloat(totalHaber.toFixed(2)),
                moneda: monedaBase,
                tipo_cambio: parseFloat(tipoCambio.toFixed(4))
            };
        } catch (error: any) {
            console.error('\n❌ ========================================');
            console.error('   ERROR GENERAL EN ASIENTO CONSOLIDADO');
            console.error('========================================');
            console.error('Mensaje:', error.message);
            console.error('Stack:', error.stack);
            console.error('========================================\n');
            throw error;
        }
    }
}