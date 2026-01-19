// services/analisis.service.ts - VERSIÓN FINAL CORREGIDA (ALTA PRECISIÓN)

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
import { ExchangeRateService } from './exchangeRate.service';

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

const TASA_IGV = 0.18;

export class AnalisisService {

    static async validarCasoExiste(casoId: number, userId: string): Promise<boolean> {
        const sql = `SELECT id FROM miaff.casos_de_estudio WHERE id = $1 AND user_id = $2`;
        const { rows } = await dbQuery(sql, [casoId, userId]);
        return rows.length > 0;
    }

    // ✅ FUNCIÓN HELPER: Validar y convertir número
    private static validarNumero(valor: any, defecto: number = 0): number {
        if (valor === null || valor === undefined) return defecto;
        const num = parseFloat(valor.toString());
        return isNaN(num) ? defecto : num;
    }

    // ✅ FUNCIÓN HELPER: Redondear con precisión configurable (Default 4 para API)
    private static redondear(valor: number, decimales: number = 4): number {
        const factor = Math.pow(10, decimales);
        // Number.EPSILON ayuda a evitar errores de punto flotante en bordes (ej: 1.005)
        return Math.round((valor + Number.EPSILON) * factor) / factor;
    }

    // ✅ FUNCIÓN HELPER: Convertir SIN PERDER DECIMALES (Raw Float)
    private static convertirAUSD(monto: number, moneda: string, tipoCambio: number): number {
        const valor = this.validarNumero(monto, 0);
        if (!moneda) moneda = 'USD';

        if (moneda === 'USD') {
            return valor;
        } else if (moneda === 'PEN') {
            // CRÍTICO: No redondeamos aquí para mantener la precisión matemática en las sumas
            return valor / tipoCambio;
        } else {
            console.warn(`⚠️ Moneda desconocida: ${moneda}, asumiendo USD`);
            return valor;
        }
    }

    private static calcularPorcentaje(valor: number, base: number): number {
        if (base === 0) return 0;
        // Los porcentajes sí los mantenemos a 2 decimales visualmente
        return parseFloat(((valor / base) * 100).toFixed(2));
    }

    static async obtenerAnalisisRentabilidad(
        casoId: number,
        userId: string,
        incluirDetalles = true
    ): Promise<RentabilityAnalysis> {

        try {
            console.log(`\n🔍 ========================================`);
            console.log(`   INICIANDO ANÁLISIS - Caso ID: ${casoId}`);
            console.log(`========================================`);

            const casoExists = await this.validarCasoExiste(casoId, userId);
            if (!casoExists) {
                throw new Error('Caso de estudio no encontrado o no autorizado');
            }

            // ✅ VALIDAR TIPO DE CAMBIO
            let tipoCambio: number;
            try {
                tipoCambio = await ExchangeRateService.getExchangeRate();
                if (!tipoCambio || tipoCambio <= 0) {
                    console.warn('⚠️ Tipo de cambio inválido, usando valor por defecto: 3.75');
                    tipoCambio = 3.75;
                }
                console.log(`💱 Tipo de cambio: S/ ${tipoCambio.toFixed(4)}`);
            } catch (error) {
                console.error('❌ Error obteniendo tipo de cambio:', error);
                tipoCambio = 3.75; // Valor por defecto
                console.warn(`⚠️ Usando tipo de cambio por defecto: ${tipoCambio}`);
            }

            const casoInfo = await this.obtenerInfoCaso(casoId);
            const importaciones = await this.obtenerImportaciones(casoId);
            const exportaciones = await this.obtenerExportaciones(casoId);
            const gastos = await this.obtenerGastosPorClasificacion(casoId);

            console.log(`\n📊 Datos obtenidos:`);
            console.log(`   Importaciones: ${importaciones.length}`);
            console.log(`   Exportaciones: ${exportaciones.length}`);
            console.log(`   Gastos: ${gastos.operativos.length + gastos.administrativos.length + gastos.ventas.length + gastos.financieros.length}`);

            const estadoResultados = this.calcularEstadoResultados(
                exportaciones,
                importaciones,
                gastos,
                tipoCambio
            );

            const utilidadBruta: UtilidadBruta = {
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
                total_otros_gastos: this.redondear(
                    estadoResultados.gastos_administrativos.total_gastos_administrativos +
                    estadoResultados.gastos_ventas.total_gastos_ventas +
                    estadoResultados.gastos_financieros.total_gastos_financieros
                ),
                utilidad_neta: estadoResultados.utilidad_neta,
                margen_neto_porcentaje: this.calcularPorcentaje(
                    estadoResultados.utilidad_neta,
                    estadoResultados.ventas.total_ventas_sin_igv
                )
            };

            const ratiosFinancieros: RatiosFinancieros = {
                margen_bruto: utilidadBruta.margen_bruto_porcentaje,
                margen_operativo: utilidadOperativa.margen_operativo_porcentaje,
                margen_neto: utilidadNeta.margen_neto_porcentaje,
                ros: utilidadNeta.margen_neto_porcentaje,
                roa: null,
                roe: null
            };

            const resumenMonedas = this.calcularResumenMonedas(
                importaciones,
                exportaciones,
                gastos,
                tipoCambio
            );

            console.log(`\n✅ ANÁLISIS COMPLETADO EXITOSAMENTE`);
            console.log(`========================================\n`);

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

        } catch (error: any) {
            console.error(`\n❌ ERROR EN obtenerAnalisisRentabilidad:`);
            console.error(`   Mensaje: ${error.message}`);
            console.error(`   Stack: ${error.stack}`);
            throw error;
        }
    }

    private static async obtenerInfoCaso(casoId: number): Promise<CasoInfo> {
        const sql = `
            SELECT nombre_caso, descripcion, estado, created_at
            FROM miaff.casos_de_estudio WHERE id = $1
        `;
        const { rows } = await dbQuery<CasoInfo>(sql, [casoId]);
        if (rows.length === 0) {
            throw new Error(`Caso ${casoId} no encontrado`);
        }
        return rows[0];
    }

    // ✅ OBTENER IMPORTACIONES
    private static async obtenerImportaciones(casoId: number): Promise<ImportacionDetalle[]> {
        const sql = `
            SELECT
                i.id,
                i.subpartida_hs10,
                i.descripcion_mercancia,
                i.tipo_mercancia_id,
                tm.cuenta_contable as tipo_mercancia_cuenta,
                tm.nombre as tipo_mercancia_nombre,
                i.valor_fob,
                i.valor_flete,
                i.valor_seguro,
                i.valor_cif,
                i.monto_ad_valorem,
                i.monto_isc,
                i.monto_igv,
                i.monto_ipm,
                i.monto_percepcion,
                i.dta_total,
                i.antidumping_ingresado,
                i.compensatorio_ingresado,
                i.sda_ingresado,
                i.moneda,
                i.fecha_operacion
            FROM miaff.importaciones i
                     LEFT JOIN miaff.tipo_mercancia_importacion tm ON tm.id = i.tipo_mercancia_id
            WHERE i.caso_estudio_id = $1 AND i.activo = 1
            ORDER BY i.fecha_operacion DESC, i.id DESC
        `;

        try {
            const { rows } = await dbQuery<ImportacionDetalle>(sql, [casoId]);

            const importaciones = rows.map(imp => ({
                ...imp,
                valor_fob: this.validarNumero(imp.valor_fob),
                valor_flete: this.validarNumero(imp.valor_flete),
                valor_seguro: this.validarNumero(imp.valor_seguro),
                valor_cif: this.validarNumero(imp.valor_cif),
                monto_ad_valorem: this.validarNumero(imp.monto_ad_valorem),
                monto_isc: this.validarNumero(imp.monto_isc),
                monto_igv: this.validarNumero(imp.monto_igv),
                monto_ipm: this.validarNumero(imp.monto_ipm),
                monto_percepcion: this.validarNumero(imp.monto_percepcion),
                dta_total: this.validarNumero(imp.dta_total),
                antidumping_ingresado: this.validarNumero(imp.antidumping_ingresado),
                compensatorio_ingresado: this.validarNumero(imp.compensatorio_ingresado),
                sda_ingresado: this.validarNumero(imp.sda_ingresado),
                moneda: imp.moneda || 'USD'
            }));

            for (const imp of importaciones) {
                try {
                    imp.tributos = await this.obtenerTributosImportacion(imp.id);
                } catch (error) {
                    console.warn(`⚠️ Error obteniendo tributos para importación ${imp.id}:`, error);
                    imp.tributos = [];
                }
            }
            return importaciones;
        } catch (error: any) {
            console.error(`❌ Error en obtenerImportaciones:`, error);
            throw new Error(`Error obteniendo importaciones: ${error.message}`);
        }
    }

    private static async obtenerTributosImportacion(importacionId: number): Promise<Tributo[]> {
        const sql = `
            SELECT id, concepto, base_imponible, tasa_aplicada, monto_calculado
            FROM miaff.importacion_tributos
            WHERE importacion_id = $1
            ORDER BY concepto
        `;
        try {
            const { rows } = await dbQuery<Tributo>(sql, [importacionId]);
            return rows.map(t => ({
                ...t,
                base_imponible: this.validarNumero(t.base_imponible),
                tasa_aplicada: this.validarNumero(t.tasa_aplicada),
                monto_calculado: this.validarNumero(t.monto_calculado)
            }));
        } catch (error) {
            return [];
        }
    }

    // ✅ OBTENER EXPORTACIONES
    private static async obtenerExportaciones(casoId: number): Promise<ExportacionDetalle[]> {
        const sql = `
            SELECT
                e.id,
                e.es_venta_nacional,
                e.tipo_producto_id,
                tp.nombre as tipo_producto_nombre,
                tp.cuenta_contable as tipo_producto_cuenta,
                e.incoterm,
                e.descripcion_venta,
                e.valor_venta,
                e.monto_base,
                e.monto_igv,
                e.moneda,
                e.fecha_operacion,
                e.pais_origen,
                e.pais_destino
            FROM miaff.exportaciones e
                     LEFT JOIN miaff.tipo_producto_venta tp ON tp.id = e.tipo_producto_id
            WHERE e.caso_estudio_id = $1 AND e.activo = true
            ORDER BY e.fecha_operacion DESC, e.id DESC
        `;

        try {
            const { rows } = await dbQuery<any>(sql, [casoId]);
            return rows.map((row: any) => ({
                ...row,
                valor_venta: this.validarNumero(row.valor_venta),
                monto_base: this.validarNumero(row.monto_base),
                monto_igv: this.validarNumero(row.monto_igv),
                moneda: row.moneda || 'USD',
                es_venta_nacional: row.es_venta_nacional || false
            }));
        } catch (error: any) {
            console.error(`❌ Error en obtenerExportaciones:`, error);
            throw new Error(`Error obteniendo exportaciones: ${error.message}`);
        }
    }

    // ✅ OBTENER GASTOS
    private static async obtenerGastosPorClasificacion(casoId: number): Promise<GastosPorClasificacion> {
        const sql = `
            SELECT
                g.id,
                g.clasificacion_id,
                cg.tipo_gasto as clasificacion_nombre,
                g.descripcion,
                g.cuenta_contable_codigo,
                g.monto,
                g.monto_base,
                g.monto_igv,
                g.moneda,
                g.fecha_gasto
            FROM miaff.gastos g
                     INNER JOIN miaff.clasificacion_gastos cg ON g.clasificacion_id = cg.id
            WHERE g.caso_estudio_id = $1 AND g.activo = 1
            ORDER BY g.fecha_gasto DESC, g.id DESC
        `;

        try {
            const { rows } = await dbQuery<any>(sql, [casoId]);

            const gastos = rows.map((row: any) => ({
                ...row,
                monto: this.validarNumero(row.monto),
                monto_base: this.validarNumero(row.monto_base),
                monto_igv: this.validarNumero(row.monto_igv),
                moneda: row.moneda || 'PEN',
                descripcion: row.descripcion || 'Sin descripción'
            }));

            const gastosPorClasificacion: GastosPorClasificacion = {
                operativos: [],
                administrativos: [],
                ventas: [],
                financieros: []
            };

            gastos.forEach(gasto => {
                const tipoGasto = (gasto.clasificacion_nombre || '').toUpperCase();
                if (tipoGasto === 'OPERATIVO') gastosPorClasificacion.operativos.push(gasto);
                else if (tipoGasto === 'ADMINISTRATIVO') gastosPorClasificacion.administrativos.push(gasto);
                else if (tipoGasto === 'VENTA') gastosPorClasificacion.ventas.push(gasto);
                else if (tipoGasto === 'FINANCIERO') gastosPorClasificacion.financieros.push(gasto);
            });

            return gastosPorClasificacion;
        } catch (error: any) {
            console.error(`❌ Error en obtenerGastosPorClasificacion:`, error);
            throw new Error(`Error obteniendo gastos: ${error.message}`);
        }
    }

    // ✅ CALCULAR ESTADO DE RESULTADOS (LÓGICA MEJORADA DE PRECISIÓN)
    private static calcularEstadoResultados(
        exportaciones: ExportacionDetalle[],
        importaciones: ImportacionDetalle[],
        gastos: GastosPorClasificacion,
        tipoCambio: number
    ): EstadoResultados {

        try {
            console.log(`\n💱 ========================================`);
            console.log(`   CALCULANDO ESTADO DE RESULTADOS`);
            console.log(`   Tipo de Cambio: S/ ${tipoCambio.toFixed(4)}`);
            console.log(`========================================\n`);

            // 1. VENTAS
            let mercaderiasNacionales = 0;
            let mercaderiasInternacionales = 0;
            let productosNacionales = 0;
            let productosInternacionales = 0;

            exportaciones.forEach((exp) => {
                const baseUSD = this.convertirAUSD(exp.monto_base, exp.moneda, tipoCambio);
                if (exp.es_venta_nacional) {
                    if (exp.tipo_producto_cuenta?.startsWith('701')) mercaderiasNacionales += baseUSD;
                    else if (exp.tipo_producto_cuenta?.startsWith('702')) productosNacionales += baseUSD;
                } else {
                    if (exp.tipo_producto_cuenta?.startsWith('701')) mercaderiasInternacionales += baseUSD;
                    else if (exp.tipo_producto_cuenta?.startsWith('702')) productosInternacionales += baseUSD;
                }
            });

            const totalVentasSinIgv = mercaderiasNacionales + mercaderiasInternacionales +
                productosNacionales + productosInternacionales;

            // 2. COSTO DE VENTAS
            let mercaderias = 0;
            let materiasPrimas = 0;
            let materialesAuxiliares = 0;
            let envasesEmbalajes = 0;
            let costosVinculados = 0;

            importaciones.forEach((imp) => {
                const cifUSD = this.convertirAUSD(imp.valor_cif, imp.moneda, tipoCambio);
                const adUSD = this.convertirAUSD(imp.antidumping_ingresado, imp.moneda, tipoCambio);
                const cvdUSD = this.convertirAUSD(imp.compensatorio_ingresado, imp.moneda, tipoCambio);
                const sdaUSD = this.convertirAUSD(imp.sda_ingresado, imp.moneda, tipoCambio);

                switch (imp.tipo_mercancia_cuenta) {
                    case '601': mercaderias += cifUSD; break;
                    case '602': materiasPrimas += cifUSD; break;
                    case '603': materialesAuxiliares += cifUSD; break;
                    case '604': envasesEmbalajes += cifUSD; break;
                }
                costosVinculados += (adUSD + cvdUSD + sdaUSD);
            });

            const totalCostoVentas = mercaderias + materiasPrimas + materialesAuxiliares +
                envasesEmbalajes + costosVinculados;

            // 3. UTILIDAD BRUTA (Cálculo con floats puros)
            const utilidadBruta = totalVentasSinIgv - totalCostoVentas;

            // 4-8. GASTOS (Desglose devuelve valores redondeados, pero total con precisión para cálculo)
            const gastosOperativosDetalle = this.desglosarGastos(gastos.operativos, tipoCambio);
            const gastosAdministrativosDetalle = this.desglosarGastos(gastos.administrativos, tipoCambio);
            const gastosVentasDetalle = this.desglosarGastosVentas(gastos.ventas, tipoCambio);
            const gastosFinancierosDetalle = this.desglosarGastosFinancieros(gastos.financieros, tipoCambio);

            const utilidadOperativa = utilidadBruta - gastosOperativosDetalle.totalRaw;
            const utilidadNeta = utilidadOperativa - gastosAdministrativosDetalle.totalRaw -
                gastosVentasDetalle.totalRaw - gastosFinancierosDetalle.totalRaw;

            console.log(`✅ ESTADO DE RESULTADOS CALCULADO\n`);

            // 🎯 APLICAMOS REDONDEO A 4 DECIMALES AL FINAL PARA EL JSON
            return {
                ventas: {
                    mercaderias_nacionales: this.redondear(mercaderiasNacionales),
                    mercaderias_internacionales: this.redondear(mercaderiasInternacionales),
                    productos_terminados_nacionales: this.redondear(productosNacionales),
                    productos_terminados_internacionales: this.redondear(productosInternacionales),
                    total_ventas_sin_igv: this.redondear(totalVentasSinIgv)
                },
                costo_ventas: {
                    mercaderias: this.redondear(mercaderias),
                    materias_primas: this.redondear(materiasPrimas),
                    materiales_auxiliares: this.redondear(materialesAuxiliares),
                    envases_embalajes: this.redondear(envasesEmbalajes),
                    costos_vinculados: this.redondear(costosVinculados),
                    total_costo_ventas: this.redondear(totalCostoVentas)
                },
                utilidad_bruta: this.redondear(utilidadBruta),
                gastos_operativos: {
                    ...gastosOperativosDetalle.desglose,
                    total_gastos_operativos: this.redondear(gastosOperativosDetalle.totalRaw)
                },
                utilidad_operativa: this.redondear(utilidadOperativa),
                gastos_administrativos: {
                    ...gastosAdministrativosDetalle.desglose,
                    total_gastos_administrativos: this.redondear(gastosAdministrativosDetalle.totalRaw)
                },
                gastos_ventas: {
                    ...gastosVentasDetalle.desglose,
                    total_gastos_ventas: this.redondear(gastosVentasDetalle.totalRaw)
                },
                gastos_financieros: {
                    ...gastosFinancierosDetalle.desglose,
                    total_gastos_financieros: this.redondear(gastosFinancierosDetalle.totalRaw)
                },
                utilidad_neta: this.redondear(utilidadNeta)
            };

        } catch (error: any) {
            console.error(`❌ Error en calcularEstadoResultados:`, error);
            throw new Error(`Error calculando estado de resultados: ${error.message}`);
        }
    }

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
            try {
                const montoUSD = this.convertirAUSD(gasto.monto_base, gasto.moneda, tipoCambio);
                const desc = (gasto.descripcion || '').toLowerCase();
                const cuenta = (gasto.cuenta_contable_codigo || '').toLowerCase();

                if (desc.includes('remunerac') || cuenta.startsWith('621')) remuneraciones += montoUSD;
                else if (desc.includes('seguridad') || desc.includes('social') || desc.includes('essalud') || cuenta.startsWith('627')) seguridadSocial += montoUSD;
                else if (desc.includes('transport') || desc.includes('viaje') || cuenta.startsWith('631')) transporteViajes += montoUSD;
                else if (desc.includes('asesor') || desc.includes('consult') || cuenta.startsWith('632')) asesoriaConsultoria += montoUSD;
                else if (desc.includes('producc') || desc.includes('tercer') || cuenta.startsWith('633')) produccionTerceros += montoUSD;
                else if (desc.includes('mantenimiento') || desc.includes('reparac') || cuenta.startsWith('634')) mantenimientoReparaciones += montoUSD;
                else if (desc.includes('alquiler') || cuenta.startsWith('635')) alquileres += montoUSD;
                else if (desc.includes('luz') || desc.includes('agua') || desc.includes('internet') || cuenta.startsWith('636')) serviciosBasicos += montoUSD;
                else if (desc.includes('servicio') || cuenta.startsWith('639')) otrosServicios += montoUSD;
                else if (desc.includes('seguro') || cuenta.startsWith('651')) seguros += montoUSD;
                else otrosGastos += montoUSD;
            } catch (error) {
                console.warn(`⚠️ Error procesando gasto ${gasto.id}:`, error);
            }
        });

        const totalRaw = remuneraciones + seguridadSocial + transporteViajes + asesoriaConsultoria +
            produccionTerceros + mantenimientoReparaciones + alquileres +
            serviciosBasicos + otrosServicios + seguros + otrosGastos;

        return {
            totalRaw, // Devolvemos el total sin redondear para cálculos superiores
            desglose: {
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
                otros_gastos: this.redondear(otrosGastos)
            }
        };
    }

    private static desglosarGastosVentas(gastos: GastoDetalle[], tipoCambio: number) {
        const base = this.desglosarGastos(gastos, tipoCambio);
        let publicidad = 0;

        gastos.forEach(gasto => {
            try {
                const montoUSD = this.convertirAUSD(gasto.monto_base, gasto.moneda, tipoCambio);
                const desc = (gasto.descripcion || '').toLowerCase();
                const cuenta = (gasto.cuenta_contable_codigo || '').toLowerCase();

                if (desc.includes('publicidad') || desc.includes('marketing') || desc.includes('publicacion') || cuenta.startsWith('637')) {
                    publicidad += montoUSD;
                }
            } catch (error) {
                console.warn(`⚠️ Error procesando gasto de ventas ${gasto.id}:`, error);
            }
        });

        return {
            totalRaw: base.totalRaw, // Usamos el total raw de la base (publicidad ya está incluido en otrosGastos o donde caiga en la base, o si es separado se suma aquí)
            desglose: {
                ...base.desglose,
                publicidad: this.redondear(publicidad)
            }
        };
    }

    private static desglosarGastosFinancieros(gastos: GastoDetalle[], tipoCambio: number) {
        let interesesDesgravamen = 0;
        let comisionesBancarias = 0;

        gastos.forEach(gasto => {
            try {
                const montoUSD = this.convertirAUSD(gasto.monto_base, gasto.moneda, tipoCambio);
                const desc = (gasto.descripcion || '').toLowerCase();
                const cuenta = (gasto.cuenta_contable_codigo || '').toLowerCase();

                if (desc.includes('interes') || desc.includes('desgravamen') || cuenta.startsWith('67')) {
                    interesesDesgravamen += montoUSD;
                } else if (desc.includes('comision') || desc.includes('bancari') || cuenta.startsWith('639')) {
                    comisionesBancarias += montoUSD;
                }
            } catch (error) {
                console.warn(`⚠️ Error procesando gasto financiero ${gasto.id}:`, error);
            }
        });

        const totalRaw = interesesDesgravamen + comisionesBancarias;

        return {
            totalRaw,
            desglose: {
                intereses_desgravamen: this.redondear(interesesDesgravamen),
                comisiones_bancarias: this.redondear(comisionesBancarias)
            }
        };
    }

    private static calcularResumenMonedas(
        importaciones: ImportacionDetalle[],
        exportaciones: ExportacionDetalle[],
        gastos: GastosPorClasificacion,
        tipoCambio: number
    ) {
        let totalUSD = 0;
        let totalPEN = 0;

        // Exportaciones
        exportaciones.forEach(exp => {
            const monto = this.validarNumero(exp.monto_base);
            if (exp.moneda === 'USD') totalUSD += monto;
            else totalPEN += monto;
        });

        // Importaciones
        importaciones.forEach(imp => {
            const monto = this.validarNumero(imp.valor_cif);
            if (imp.moneda === 'USD') totalUSD += monto;
            else totalPEN += monto;
        });

        // Gastos
        const todosGastos = [
            ...gastos.operativos,
            ...gastos.administrativos,
            ...gastos.ventas,
            ...gastos.financieros
        ];

        todosGastos.forEach(gasto => {
            const monto = this.validarNumero(gasto.monto_base);
            if (gasto.moneda === 'USD') totalUSD += monto;
            else totalPEN += monto;
        });

        return {
            total_usd: this.redondear(totalUSD),
            total_pen: this.redondear(totalPEN),
            tipo_cambio_usado: parseFloat(tipoCambio.toFixed(4))
        };
    }

    // ===== RESTO DE MÉTODOS (COMPARATIVO, ASIENTO) =====

    static async obtenerComparativo(userId: string, limite = 10) {
        const sql = `
            SELECT id, nombre_caso, created_at
            FROM miaff.casos_de_estudio
            WHERE user_id = $1 AND estado != 'eliminado'
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
                        ventas_totales: analysis.utilidad_bruta.ventas_totales_sin_igv
                    };
                } catch (error) {
                    console.warn(`⚠️ Error analizando caso ${caso.id}:`, error);
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
        diferencia: number;
    }> {
        try {
            console.log('\n🔍 ========================================');
            console.log('   INICIANDO ASIENTO CONTABLE CONSOLIDADO');
            console.log('========================================');
            console.log('   Caso ID:', casoId);
            console.log('   User ID:', userId);
            console.log('   Moneda Base:', monedaBase);

            const casoExists = await this.validarCasoExiste(casoId, userId);
            if (!casoExists) {
                throw new Error('Caso de estudio no encontrado');
            }

            const casoInfo = await this.obtenerInfoCaso(casoId);
            console.log('✅ Caso validado:', casoInfo.nombre_caso);

            const tipoCambio = await ExchangeRateService.getExchangeRate();
            console.log(`💱 Tipo de cambio: S/ ${tipoCambio.toFixed(4)}`);

            const cuentasMap = new Map<string, {
                nombre_cuenta: string;
                debe: number;
                haber: number;
                glosa: string;
            }>();

            // 1. IMPORTACIONES
            console.log('\n📦 PASO 1: Procesando IMPORTACIONES...');
            const importacionesSql = `
                SELECT id, asiento_contable_json, descripcion_mercancia, moneda
                FROM miaff.importaciones
                WHERE caso_estudio_id = $1 AND activo = 1
                ORDER BY fecha_operacion, id
            `;
            const { rows: importaciones } = await dbQuery<any>(importacionesSql, [casoId]);
            console.log(`   📋 ${importaciones.length} importaciones encontradas`);

            importaciones.forEach((imp: any, idx: number) => {
                if (!imp.asiento_contable_json) return;

                try {
                    const asiento = typeof imp.asiento_contable_json === 'string'
                        ? JSON.parse(imp.asiento_contable_json)
                        : imp.asiento_contable_json;

                    if (!Array.isArray(asiento)) return;

                    asiento.forEach((linea: any) => {
                        const cuenta = linea.cuenta || linea.codigo_cuenta;
                        const nombreCuenta = linea.nombre_cuenta || linea.denominacion;
                        let debe = this.validarNumero(linea.debe);
                        let haber = this.validarNumero(linea.haber);

                        // Aquí usamos conversión RAW y redondeamos solo al final del proceso
                        if (imp.moneda === 'USD' && monedaBase === 'PEN') {
                            debe = debe * tipoCambio;
                            haber = haber * tipoCambio;
                        } else if (imp.moneda === 'PEN' && monedaBase === 'USD') {
                            debe = debe / tipoCambio;
                            haber = haber / tipoCambio;
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

            // 2. EXPORTACIONES
            console.log('\n🚢 PASO 2: Procesando EXPORTACIONES...');
            const exportacionesSql = `
                SELECT 
                    e.id, 
                    e.es_venta_nacional, 
                    e.descripcion_venta, 
                    e.monto_base,
                    e.monto_igv,
                    e.moneda,
                    tp.cuenta_contable as tipo_producto_cuenta
                FROM miaff.exportaciones e
                LEFT JOIN miaff.tipo_producto_venta tp ON tp.id = e.tipo_producto_id
                WHERE e.caso_estudio_id = $1 AND e.activo = true
                ORDER BY e.fecha_operacion, e.id
            `;
            const { rows: exportaciones } = await dbQuery<any>(exportacionesSql, [casoId]);
            console.log(`   📋 ${exportaciones.length} exportaciones encontradas`);

            if (exportaciones.length > 0) {
                const reglas = await this._obtenerReglasContables();
                const reglaClientes = reglas.get('clientes') || { cuenta: '12', nombre_cuenta: 'Clientes' };
                const reglaIGV = reglas.get('igv') || { cuenta: '40111', nombre_cuenta: 'IGV – Cuenta propia' };

                exportaciones.forEach((exp: any, idx: number) => {
                    const montoBase = this.validarNumero(exp.monto_base);
                    const montoIgv = this.validarNumero(exp.monto_igv);
                    const valorTotal = montoBase + montoIgv;

                    let baseEnMonedaBase: number;
                    let igvEnMonedaBase: number;
                    let totalEnMonedaBase: number;

                    // Cálculos sin redondear intermedio
                    if (monedaBase === 'USD') {
                        baseEnMonedaBase = exp.moneda === 'USD' ? montoBase : montoBase / tipoCambio;
                        igvEnMonedaBase = exp.moneda === 'USD' ? montoIgv : montoIgv / tipoCambio;
                        totalEnMonedaBase = exp.moneda === 'USD' ? valorTotal : valorTotal / tipoCambio;
                    } else {
                        baseEnMonedaBase = exp.moneda === 'PEN' ? montoBase : montoBase * tipoCambio;
                        igvEnMonedaBase = exp.moneda === 'PEN' ? montoIgv : montoIgv * tipoCambio;
                        totalEnMonedaBase = exp.moneda === 'PEN' ? valorTotal : valorTotal * tipoCambio;
                    }

                    if (!cuentasMap.has(reglaClientes.cuenta)) {
                        cuentasMap.set(reglaClientes.cuenta, {
                            nombre_cuenta: reglaClientes.nombre_cuenta,
                            debe: 0,
                            haber: 0,
                            glosa: exp.es_venta_nacional ? 'Ventas nacionales' : 'Exportaciones'
                        });
                    }
                    cuentasMap.get(reglaClientes.cuenta)!.debe += totalEnMonedaBase;

                    const cuentaVenta = exp.tipo_producto_cuenta || '7011';
                    if (!cuentasMap.has(cuentaVenta)) {
                        cuentasMap.set(cuentaVenta, {
                            nombre_cuenta: 'Ventas',
                            debe: 0,
                            haber: 0,
                            glosa: 'Ventas de mercaderías'
                        });
                    }
                    cuentasMap.get(cuentaVenta)!.haber += baseEnMonedaBase;

                    if (igvEnMonedaBase > 0) {
                        if (!cuentasMap.has(reglaIGV.cuenta)) {
                            cuentasMap.set(reglaIGV.cuenta, {
                                nombre_cuenta: reglaIGV.nombre_cuenta,
                                debe: 0,
                                haber: 0,
                                glosa: 'IGV de ventas'
                            });
                        }
                        cuentasMap.get(reglaIGV.cuenta)!.haber += igvEnMonedaBase;
                    }
                });
            }

            console.log(`   ✅ Exportaciones completadas. Cuentas: ${cuentasMap.size}`);

            // 3. GASTOS
            console.log('\n💸 PASO 3: Procesando GASTOS...');
            try {
                const asientoGastos = await GastoService.generarAsientoContable(userId, casoId);
                console.log(`   📋 Asiento de gastos generado: ${asientoGastos.detalles.length} líneas`);

                const gastosMonedaSql = `
                    SELECT g.moneda, COUNT(*) as cantidad
                    FROM miaff.gastos g
                    WHERE g.caso_estudio_id = $1 AND g.activo = 1
                    GROUP BY g.moneda
                    ORDER BY cantidad DESC
                    LIMIT 1
                `;
                const { rows: monedasGastos } = await dbQuery<{ moneda: string; cantidad: string }>(gastosMonedaSql, [casoId]);
                const monedaGastos = monedasGastos.length > 0 ? monedasGastos[0].moneda : 'PEN';

                asientoGastos.detalles.forEach((linea: any) => {
                    const cuenta = linea.codigo_cuenta;
                    const nombreCuenta = linea.denominacion;
                    let debe = this.validarNumero(linea.debe);
                    let haber = this.validarNumero(linea.haber);

                    // Conversión sin redondear
                    if (monedaGastos === 'PEN' && monedaBase === 'USD') {
                        debe = debe / tipoCambio;
                        haber = haber / tipoCambio;
                    } else if (monedaGastos === 'USD' && monedaBase === 'PEN') {
                        debe = debe * tipoCambio;
                        haber = haber * tipoCambio;
                    }

                    if (!cuenta) return;

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

            // 4. CONSOLIDACIÓN
            console.log('\n📊 PASO 4: Consolidando asiento final...');

            const detalles = Array.from(cuentasMap.entries())
                .map(([cuenta, data]) => ({
                    cuenta,
                    nombre_cuenta: data.nombre_cuenta,
                    debe: data.debe,
                    haber: data.haber,
                    glosa: data.glosa
                }))
                .filter(d => d.debe > 0.001 || d.haber > 0.001)
                .sort((a, b) => a.cuenta.localeCompare(b.cuenta));

            // Calculamos totales
            const totalDebe = detalles.reduce((sum, d) => sum + d.debe, 0);
            const totalHaber = detalles.reduce((sum, d) => sum + d.haber, 0);
            const diferencia = totalDebe - totalHaber;

            // Redondeamos solo para el output final (2 decimales es estándar para contabilidad)
            // Nota: Aquí sí usamos 2 decimales porque es un asiento contable formal, no un cálculo intermedio para conversión.
            const detallesRedondeados = detalles.map(d => ({
                ...d,
                debe: parseFloat(d.debe.toFixed(2)),
                haber: parseFloat(d.haber.toFixed(2))
            }));

            console.log('\n✅ ASIENTO CONSOLIDADO GENERADO');
            console.log(`📋 Total líneas: ${detallesRedondeados.length}`);
            console.log(`💰 Total Debe: ${totalDebe.toFixed(2)} ${monedaBase}`);
            console.log(`💰 Total Haber: ${totalHaber.toFixed(2)} ${monedaBase}`);
            console.log(`⚖️  Diferencia: ${diferencia.toFixed(2)} ${monedaBase}`);

            return {
                fecha: new Date().toISOString().split('T')[0],
                descripcion: `Asiento consolidado del caso: ${casoInfo.nombre_caso}`,
                detalles: detallesRedondeados,
                totalDebe: parseFloat(totalDebe.toFixed(2)),
                totalHaber: parseFloat(totalHaber.toFixed(2)),
                moneda: monedaBase,
                tipo_cambio: parseFloat(tipoCambio.toFixed(4)),
                diferencia: parseFloat(diferencia.toFixed(2))
            };

        } catch (error: any) {
            console.error('\n❌ ERROR EN generarAsientoContableConsolidado');
            console.error('Mensaje:', error.message);
            console.error('Stack:', error.stack);
            throw error;
        }
    }
}