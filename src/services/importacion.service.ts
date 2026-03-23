import { dbQuery } from '../db';
import { ImportacionCalculada, ImportacionDB, TributoDB, UpdateImportacionData, TipoMercanciaImportacion } from '../types/importacion.types';
import { ExchangeRateService } from './exchangeRate.service';

type ImportacionInputData = any;

interface ReglaContable {
    cuenta: string;
    nombre_cuenta: string;
}

// Helper para redondear a 2 decimales con precisión
const round2 = (num: number): number => Math.round(num * 100) / 100;

export class ImportacionService {

    private static async _obtenerReglasContables(): Promise<Map<string, ReglaContable>> {
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

            const reglasMap = new Map<string, ReglaContable>();
            rows.forEach(row => {
                reglasMap.set(row.concepto, { cuenta: row.cuenta, nombre_cuenta: row.nombre_cuenta });
            });
            return reglasMap;

        } catch (error) {
            console.error('Error fatal: No se pudieron cargar las reglas contables.', error);
            throw new Error('No se pudieron cargar las reglas contables desde la base de datos.');
        }
    }

    // NUEVO: Listar tipos de mercancía
    static async listarTiposMercancia(): Promise<TipoMercanciaImportacion[]> {
        const sql = `
            SELECT id, nombre, cuenta_contable, descripcion
            FROM miaff.tipo_mercancia_importacion
            ORDER BY cuenta_contable;
        `;
        const { rows } = await dbQuery<TipoMercanciaImportacion>(sql);
        return rows;
    }

    static async obtenerTasaAdValorem(hs10: string): Promise<number | null> {
        try {
            const { rows } = await dbQuery<{ tasa: string }>(
                'SELECT tasa FROM miaff.ad_valorem WHERE hs10 = $1',
                [hs10]
            );
            return rows.length > 0 ? parseFloat(rows[0].tasa) : null;
        } catch (error) {
            console.error('Error obteniendo tasa ad valorem:', error);
            return null;
        }
    }

    static async obtenerTasasImpuestos(): Promise<{ igv: number; ipm: number }> {
        try {
            const { rows } = await dbQuery<{ codigo: string, tasa: string }>(
                'SELECT codigo, tasa FROM miaff.impuesto WHERE codigo IN ($1, $2)',
                ['IGV', 'IPM']
            );

            const tasas = { igv: 0.16, ipm: 0.02 };
            rows.forEach(row => {
                if (row.codigo === 'IGV') tasas.igv = parseFloat(row.tasa);
                if (row.codigo === 'IPM') tasas.ipm = parseFloat(row.tasa);
            });

            return tasas;
        } catch (error) {
            console.error('Error obteniendo tasas de impuestos:', error);
            return { igv: 0.16, ipm: 0.02 };
        }
    }

    static async calcularImportacion(
        data: ImportacionInputData,
        tasasImpuestos: { igv: number; ipm: number },
        tipoMercancia: TipoMercanciaImportacion
    ): Promise<ImportacionCalculada> {
        const reglas = await this._obtenerReglasContables();

        // ===== CÁLCULOS CON PRECISIÓN =====
        const valorCIF = round2(data.valor_fob + data.valor_flete + data.valor_seguro);
        const tasaAdValorem = data.ad_valorem_tasa_manual || 0;
        const montoAdValorem = round2(valorCIF * tasaAdValorem);

        const baseISC = round2(valorCIF + montoAdValorem);
        const montoISC = data.habilitar_isc ? round2(baseISC * (data.isc_tasa_ingresada || 0)) : 0;

        const baseIGV = round2(valorCIF + montoAdValorem + montoISC);
        const montoIGV = data.habilitar_igv ? round2(baseIGV * tasasImpuestos.igv) : 0;
        const montoIPM = data.habilitar_igv ? round2(baseIGV * tasasImpuestos.ipm) : 0;

        const montoAntidumping = round2(data.antidumping_ingresado || 0);
        const montoCompensatorios = round2(data.compensatorio_ingresado || 0);
        const montoSDA = round2(data.sda_ingresado || 0);

        // Base de percepción: CIF + A/V + ISC + IGV + IPM + AD/CVD (SIN SDA)
        const basePercepcion = round2(valorCIF + montoAdValorem + montoISC + montoIGV + montoIPM + montoAntidumping + montoCompensatorios);
        const tasaPercepcion = data.percepcion_tasa_ingresada || 0;
        const montoPercepcion = data.habilitar_percepcion ? round2(basePercepcion * tasaPercepcion) : 0;

        // DTA TOTAL (ORDEN CORRECTO): Ad Valorem + ISC + IGV + IPM + Antidumping + Compensatorio + Percepción + SDA
        const dtaTotal = round2(montoAdValorem + montoISC + montoIGV + montoIPM + montoAntidumping + montoCompensatorios + montoPercepcion + montoSDA);

        // ===== TRIBUTOS PARA BD (ORDEN CORRECTO) =====
        const tributos: TributoDB[] = [];

        // 1. Ad Valorem
        if (montoAdValorem > 0) tributos.push({
            concepto: 'ad_valorem',
            base_imponible: valorCIF,
            tasa_aplicada: tasaAdValorem,
            monto_calculado: montoAdValorem
        });

        // 2. ISC
        if (data.habilitar_isc) tributos.push({
            concepto: 'isc',
            base_imponible: baseISC,
            tasa_aplicada: data.isc_tasa_ingresada || 0,
            monto_calculado: montoISC
        });

        // 3. IGV
        if (montoIGV > 0) tributos.push({
            concepto: 'igv',
            base_imponible: baseIGV,
            tasa_aplicada: tasasImpuestos.igv,
            monto_calculado: montoIGV
        });

        // 4. IPM
        if (montoIPM > 0) tributos.push({
            concepto: 'ipm',
            base_imponible: baseIGV,
            tasa_aplicada: tasasImpuestos.ipm,
            monto_calculado: montoIPM
        });

        // 5. Antidumping
        if (montoAntidumping > 0) tributos.push({
            concepto: 'antidumping',
            base_imponible: 0,
            tasa_aplicada: 0,
            monto_calculado: montoAntidumping
        });

        // 6. Compensatorio
        if (montoCompensatorios > 0) tributos.push({
            concepto: 'compensatorio',
            base_imponible: 0,
            tasa_aplicada: 0,
            monto_calculado: montoCompensatorios
        });

        // 7. Percepción
        if (montoPercepcion > 0) tributos.push({
            concepto: 'percepcion',
            base_imponible: basePercepcion,
            tasa_aplicada: tasaPercepcion,
            monto_calculado: montoPercepcion
        });

        // 8. SDA
        if (montoSDA > 0) tributos.push({
            concepto: 'sda',
            base_imponible: 0,
            tasa_aplicada: 0,
            monto_calculado: montoSDA
        });

        // ===== ASIENTO CONTABLE (ORDEN CORRECTO) =====
        const asientoContable: any[] = [];

        // 1. Cuenta de mercancía (601, 602, 603, 604 según tipo_mercancia_id)
        asientoContable.push({
            cuenta: tipoMercancia.cuenta_contable,
            nombre_cuenta: tipoMercancia.nombre,
            debe: round2(valorCIF),
            haber: 0,
            glosa: `Importación - ${data.descripcion_mercancia}`
        });

        // 2. Ad Valorem (4015)
        if (montoAdValorem > 0) {
            const regla = reglas.get('ad_valorem') || { cuenta: '4015', nombre_cuenta: 'Derechos aduaneros' };
            asientoContable.push({
                cuenta: regla.cuenta,
                nombre_cuenta: regla.nombre_cuenta,
                debe: round2(montoAdValorem),
                haber: 0,
                glosa: 'Derechos Aduaneros (Ad Valorem)'
            });
        }

        // 3. ISC (4012)
        if (data.habilitar_isc) {
            const regla = reglas.get('isc') || { cuenta: '4012', nombre_cuenta: 'Impuesto Selectivo al Consumo' };
            asientoContable.push({
                cuenta: regla.cuenta,
                nombre_cuenta: regla.nombre_cuenta,
                debe: round2(montoISC),
                haber: 0,
                glosa: 'ISC de Importación'
            });
        }

        // 4. IGV + IPM (40111)
        if (montoIGV + montoIPM > 0) {
            const regla = reglas.get('igv') || { cuenta: '40111', nombre_cuenta: 'IGV – Cuenta propia' };
            asientoContable.push({
                cuenta: regla.cuenta,
                nombre_cuenta: regla.nombre_cuenta,
                debe: round2(montoIGV + montoIPM),
                haber: 0,
                glosa: 'IGV e IPM de Importación'
            });
        }

        // 5. Costos vinculados (609): Antidumping + Compensatorio + SDA
        const costosVinculados = round2(montoAntidumping + montoCompensatorios + montoSDA);
        if (costosVinculados > 0) {
            const regla = reglas.get('costos_vinculados') || { cuenta: '609', nombre_cuenta: 'Costos vinculados con las compras' };
            asientoContable.push({
                cuenta: regla.cuenta,
                nombre_cuenta: regla.nombre_cuenta,
                debe: round2(costosVinculados),
                haber: 0,
                glosa: 'Costos vinculados (Antidumping, Compensatorio, SDA)'
            });
        }

        // 6. Percepción (40113)
        if (montoPercepcion > 0) {
            const regla = reglas.get('percepcion') || { cuenta: '40113', nombre_cuenta: 'IGV – Régimen de percepciones' };
            asientoContable.push({
                cuenta: regla.cuenta,
                nombre_cuenta: regla.nombre_cuenta,
                debe: round2(montoPercepcion),
                haber: 0,
                glosa: 'Percepción de IGV'
            });
        }

        // 7. Total a pagar (421) - HABER
        const totalDebe = round2(asientoContable.reduce((sum, linea) => sum + linea.debe, 0));
        const regla421 = reglas.get('proveedores') || { cuenta: '421', nombre_cuenta: 'Facturas, boletas y otros comprobantes por pagar' };
        asientoContable.push({
            cuenta: regla421.cuenta,
            nombre_cuenta: regla421.nombre_cuenta,
            debe: 0,
            haber: round2(totalDebe),
            glosa: 'Total a Pagar por Importación'
        });

        return {
            valor_cif: valorCIF,
            monto_ad_valorem: montoAdValorem,
            monto_isc: montoISC,
            monto_igv: montoIGV,
            monto_ipm: montoIPM,
            monto_percepcion: montoPercepcion,
            dta_total: dtaTotal,
            tributos,
            asiento_contable: asientoContable
        };
    }

    static async crearImportacion(
        user_id: string,
        data: ImportacionInputData
    ): Promise<{ importacion: ImportacionDB; tributos: TributoDB[] }> {

        const tasasImpuestos = await this.obtenerTasasImpuestos();

        // Obtener tipo de mercancía
        const { rows: tipoRows } = await dbQuery<TipoMercanciaImportacion>(
            'SELECT * FROM miaff.tipo_mercancia_importacion WHERE id = $1',
            [data.tipo_mercancia_id]
        );

        if (tipoRows.length === 0) {
            throw new Error('Tipo de mercancía no encontrado');
        }

        const tipoMercancia = tipoRows[0];

        if (!data.ad_valorem_tasa_manual && data.subpartida_hs10) {
            const tasaAutomatica = await this.obtenerTasaAdValorem(data.subpartida_hs10);
            data.ad_valorem_tasa_manual = tasaAutomatica ?? 0;
        }

        const calculado = await this.calcularImportacion(data, tasasImpuestos, tipoMercancia);

        // Obtener TC de la fecha de operación
        const fechaOp = data.fecha_operacion || new Date().toISOString().split('T')[0];
        let tipoCambioFecha: number | null = null;
        try {
            tipoCambioFecha = await ExchangeRateService.getExchangeRate(fechaOp);
        } catch (e) {
            console.warn('⚠️ No se pudo obtener TC para fecha', fechaOp, e);
        }

        const { rows } = await dbQuery<ImportacionDB>(
            `INSERT INTO miaff.importaciones (
                caso_estudio_id, user_id, tipo_mercancia_id, subpartida_hs10, descripcion_mercancia,
                moneda, valor_fob, valor_flete, valor_seguro,
                habilitar_igv, habilitar_isc, habilitar_percepcion,
                ad_valorem_tasa_manual, isc_tasa_ingresada, percepcion_tasa_ingresada,
                antidumping_ingresado, compensatorio_ingresado, sda_ingresado,
                valor_cif, monto_ad_valorem, monto_isc, monto_igv, monto_ipm,
                monto_percepcion, dta_total, asiento_contable_json, fecha_operacion, tipo_cambio_fecha, activo
            ) VALUES (
                         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                         $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
                     ) RETURNING *`,
            [
                data.caso_estudio_id, user_id, data.tipo_mercancia_id, data.subpartida_hs10, data.descripcion_mercancia,
                data.moneda, data.valor_fob, data.valor_flete, data.valor_seguro,
                data.habilitar_igv, data.habilitar_isc, data.habilitar_percepcion,
                data.ad_valorem_tasa_manual, data.isc_tasa_ingresada, data.percepcion_tasa_ingresada,
                data.antidumping_ingresado, data.compensatorio_ingresado, data.sda_ingresado,
                calculado.valor_cif, calculado.monto_ad_valorem, calculado.monto_isc,
                calculado.monto_igv, calculado.monto_ipm, calculado.monto_percepcion,
                calculado.dta_total, JSON.stringify(calculado.asiento_contable),
                fechaOp, tipoCambioFecha,
                1
            ]
        );

        const importacionCreada = rows[0];

        for (const tributo of calculado.tributos) {
            await dbQuery(
                `INSERT INTO miaff.importacion_tributos (
                    importacion_id, concepto, base_imponible, tasa_aplicada, monto_calculado
                ) VALUES ($1, $2, $3, $4, $5)`,
                [
                    importacionCreada.id, tributo.concepto, tributo.base_imponible,
                    tributo.tasa_aplicada, tributo.monto_calculado
                ]
            );
        }

        return {
            importacion: importacionCreada,
            tributos: calculado.tributos
        };
    }

    static async listarImportaciones(user_id: string, caso_estudio_id?: number): Promise<ImportacionDB[]> {
        let sql = `
            SELECT i.*, ce.nombre_caso, s.descripcion as subpartida_descripcion,
                   tm.nombre as tipo_mercancia_nombre, tm.cuenta_contable as tipo_mercancia_cuenta
            FROM miaff.importaciones i
                     JOIN miaff.casos_de_estudio ce ON ce.id = i.caso_estudio_id
                     LEFT JOIN miaff.subpartida s ON s.hs10 = i.subpartida_hs10
                     LEFT JOIN miaff.tipo_mercancia_importacion tm ON tm.id = i.tipo_mercancia_id
            WHERE i.user_id = $1 AND i.activo = 1 AND ce.estado != 'eliminado'
        `;
        const params: any[] = [user_id];
        if (caso_estudio_id) {
            sql += ` AND i.caso_estudio_id = $${params.length + 1}`;
            params.push(caso_estudio_id);
        }
        sql += ` ORDER BY i.created_at DESC`;
        const { rows } = await dbQuery<ImportacionDB>(sql, params);
        return rows;
    }

    static async obtenerImportacion(id: number, user_id: string): Promise<{ importacion: ImportacionDB; tributos: TributoDB[] } | null> {
        const { rows } = await dbQuery<ImportacionDB>(
            `SELECT i.*, ce.nombre_caso, s.descripcion as subpartida_descripcion,
                    tm.nombre as tipo_mercancia_nombre, tm.cuenta_contable as tipo_mercancia_cuenta
             FROM miaff.importaciones i
                      JOIN miaff.casos_de_estudio ce ON ce.id = i.caso_estudio_id
                      LEFT JOIN miaff.subpartida s ON s.hs10 = i.subpartida_hs10
                      LEFT JOIN miaff.tipo_mercancia_importacion tm ON tm.id = i.tipo_mercancia_id
             WHERE i.id = $1 AND i.user_id = $2 AND i.activo = 1`,
            [id, user_id]
        );
        if (rows.length === 0) return null;
        const { rows: tributos } = await dbQuery<TributoDB>(
            'SELECT concepto, base_imponible, tasa_aplicada, monto_calculado FROM miaff.importacion_tributos WHERE importacion_id = $1 ORDER BY id',
            [id]
        );
        return { importacion: rows[0], tributos };
    }

    static async actualizarImportacion(
        id: number,
        user_id: string,
        data: UpdateImportacionData
    ): Promise<{ importacion: ImportacionDB; tributos: TributoDB[] } | null> {
        const existente = await this.obtenerImportacion(id, user_id);
        if (!existente) return null;

        const datosCompletos = { ...existente.importacion, ...data };
        const tasasImpuestos = await this.obtenerTasasImpuestos();

        // Obtener tipo de mercancía
        const tipoMercanciaId = data.tipo_mercancia_id || existente.importacion.tipo_mercancia_id;
        const { rows: tipoRows } = await dbQuery<TipoMercanciaImportacion>(
            'SELECT * FROM miaff.tipo_mercancia_importacion WHERE id = $1',
            [tipoMercanciaId]
        );

        if (tipoRows.length === 0) {
            throw new Error('Tipo de mercancía no encontrado');
        }

        const tipoMercancia = tipoRows[0];

        if (data.subpartida_hs10 && !data.ad_valorem_tasa_manual) {
            const tasaAutomatica = await this.obtenerTasaAdValorem(data.subpartida_hs10);
            datosCompletos.ad_valorem_tasa_manual = tasaAutomatica ?? 0;
        }

        const calculado = await this.calcularImportacion(datosCompletos, tasasImpuestos, tipoMercancia);

        const { rows } = await dbQuery<ImportacionDB>(
            `UPDATE miaff.importaciones
             SET
                 caso_estudio_id = $1, tipo_mercancia_id = $2, subpartida_hs10 = $3, descripcion_mercancia = $4, moneda = $5, valor_fob = $6,
                 valor_flete = $7, valor_seguro = $8, habilitar_igv = $9, habilitar_isc = $10, habilitar_percepcion = $11,
                 ad_valorem_tasa_manual = $12, isc_tasa_ingresada = $13, percepcion_tasa_ingresada = $14,
                 antidumping_ingresado = $15, compensatorio_ingresado = $16, sda_ingresado = $17, valor_cif = $18,
                 monto_ad_valorem = $19, monto_isc = $20, monto_igv = $21, monto_ipm = $22, monto_percepcion = $23,
                 dta_total = $24, asiento_contable_json = $25, fecha_operacion = $26, updated_at = CURRENT_TIMESTAMP
             WHERE id = $27 AND user_id = $28 AND activo = 1
                 RETURNING *`,
            [
                datosCompletos.caso_estudio_id, tipoMercanciaId, datosCompletos.subpartida_hs10, datosCompletos.descripcion_mercancia,
                datosCompletos.moneda, datosCompletos.valor_fob, datosCompletos.valor_flete, datosCompletos.valor_seguro,
                datosCompletos.habilitar_igv, datosCompletos.habilitar_isc, datosCompletos.habilitar_percepcion,
                datosCompletos.ad_valorem_tasa_manual, datosCompletos.isc_tasa_ingresada, datosCompletos.percepcion_tasa_ingresada,
                datosCompletos.antidumping_ingresado, datosCompletos.compensatorio_ingresado, datosCompletos.sda_ingresado,
                calculado.valor_cif, calculado.monto_ad_valorem, calculado.monto_isc, calculado.monto_igv,
                calculado.monto_ipm, calculado.monto_percepcion, calculado.dta_total, JSON.stringify(calculado.asiento_contable),
                datosCompletos.fecha_operacion, id, user_id
            ]
        );

        if (rows.length === 0) return null;

        await dbQuery('DELETE FROM miaff.importacion_tributos WHERE importacion_id = $1', [id]);

        for (const tributo of calculado.tributos) {
            await dbQuery(
                `INSERT INTO miaff.importacion_tributos (
                    importacion_id, concepto, base_imponible, tasa_aplicada, monto_calculado
                ) VALUES ($1, $2, $3, $4, $5)`,
                [id, tributo.concepto, tributo.base_imponible, tributo.tasa_aplicada, tributo.monto_calculado]
            );
        }

        return { importacion: rows[0], tributos: calculado.tributos };
    }

    static async eliminarImportacion(id: number, user_id: string): Promise<boolean> {
        const { rows } = await dbQuery<{ id: number }>(
            `UPDATE miaff.importaciones SET activo = 0, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2 AND activo = 1
                 RETURNING id`,
            [id, user_id]
        );
        return rows.length > 0;
    }

    static async verificarCasoEstudioUsuario(caso_estudio_id: number, user_id: string): Promise<boolean> {
        const { rows } = await dbQuery(
            `SELECT id FROM miaff.casos_de_estudio
             WHERE id = $1 AND user_id = $2 AND estado != 'eliminado'`,
            [caso_estudio_id, user_id]
        );
        return rows.length > 0;
    }

    static async generarAsientoContable(id: number, user_id: string): Promise<any | null> {
        const importacionData = await this.obtenerImportacion(id, user_id);
        if (!importacionData) return null;

        const importacion = importacionData.importacion;
        if (importacion.asiento_contable_json) {
            const asiento = importacion.asiento_contable_json;
            const totalDebe = asiento.reduce((sum: number, linea: any) => sum + Number(linea.debe || 0), 0);
            const totalHaber = asiento.reduce((sum: number, linea: any) => sum + Number(linea.haber || 0), 0);
            return {
                lineas: asiento,
                totalDebe: round2(totalDebe),
                totalHaber: round2(totalHaber)
            };
        }
        return null;
    }
}