import { dbQuery } from '../db';
import { ImportacionCalculada, ImportacionDB, TributoDB, UpdateImportacionData } from '../types/importacion.types';

type ImportacionInputData = any;

export class ImportacionService {

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

    static calcularImportacion(data: ImportacionInputData, tasasImpuestos: { igv: number; ipm: number }): ImportacionCalculada {
        const valorCIF = data.valor_fob + data.valor_flete + data.valor_seguro;

        const tasaAdValorem = data.ad_valorem_tasa_manual || 0;
        const montoAdValorem = valorCIF * tasaAdValorem;

        const baseISC = valorCIF + montoAdValorem;
        const montoISC = data.habilitar_isc ? baseISC * (data.isc_tasa_ingresada || 0) : 0;

        const baseIGV = valorCIF + montoAdValorem + montoISC;
        const montoIGV = data.habilitar_igv ? baseIGV * tasasImpuestos.igv : 0;
        const montoIPM = data.habilitar_igv ? baseIGV * tasasImpuestos.ipm : 0;

        const basePercepcion = valorCIF + montoAdValorem + montoISC + montoIGV + montoIPM;
        const tasaPercepcion = data.percepcion_tasa_ingresada || 0;
        const montoPercepcion = data.habilitar_percepcion ? basePercepcion * tasaPercepcion : 0;

        const dtaTotal = montoAdValorem + montoISC + montoIGV + montoIPM;

        const tributos: TributoDB[] = [];
        if (montoAdValorem > 0) tributos.push({ concepto: 'ad_valorem', base_imponible: valorCIF, tasa_aplicada: tasaAdValorem, monto_calculado: montoAdValorem });
        if (montoISC > 0) tributos.push({ concepto: 'isc', base_imponible: baseISC, tasa_aplicada: data.isc_tasa_ingresada || 0, monto_calculado: montoISC });
        if (montoIGV > 0) tributos.push({ concepto: 'igv', base_imponible: baseIGV, tasa_aplicada: tasasImpuestos.igv, monto_calculado: montoIGV });
        if (montoIPM > 0) tributos.push({ concepto: 'ipm', base_imponible: baseIGV, tasa_aplicada: tasasImpuestos.ipm, monto_calculado: montoIPM });
        if (montoPercepcion > 0) tributos.push({ concepto: 'percepcion', base_imponible: basePercepcion, tasa_aplicada: tasaPercepcion, monto_calculado: montoPercepcion });

        const totalDesembolsado = dtaTotal + montoPercepcion;
        const asientoContable = [
            { cuenta: '601', nombre_cuenta: 'Mercaderías', debe: valorCIF, haber: 0, glosa: `Importación - ${data.descripcion_mercancia}` },
            { cuenta: '40111', nombre_cuenta: 'IGV - Cuenta Propia', debe: montoIGV + montoIPM, haber: 0, glosa: `Tributos de Importación` },
            { cuenta: '60912', nombre_cuenta: 'Derechos Aduaneros', debe: montoAdValorem, haber: 0, glosa: `Tributos de Importación` },
            { cuenta: '40113', nombre_cuenta: 'IGV - Percepciones por Pagar', debe: montoPercepcion, haber: 0, glosa: `Tributos de Importación` },
            { cuenta: '4212', nombre_cuenta: 'Facturas por Pagar - Exterior', debe: 0, haber: totalDesembolsado, glosa: `Total a Pagar por Importación` },
        ];

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

        if (!data.ad_valorem_tasa_manual && data.subpartida_hs10) {
            const tasaAutomatica = await this.obtenerTasaAdValorem(data.subpartida_hs10);
            data.ad_valorem_tasa_manual = tasaAutomatica ?? 0;
        }

        const calculado = this.calcularImportacion(data, tasasImpuestos);

        const { rows } = await dbQuery<ImportacionDB>(
            `INSERT INTO miaff.importaciones (
        caso_estudio_id, user_id, subpartida_hs10, descripcion_mercancia,
        moneda, valor_fob, valor_flete, valor_seguro,
        habilitar_igv, habilitar_isc, habilitar_percepcion,
        ad_valorem_tasa_manual, isc_tasa_ingresada, percepcion_tasa_ingresada,
        antidumping_ingresado, compensatorio_ingresado, sda_ingresado,
        valor_cif, monto_ad_valorem, monto_isc, monto_igv, monto_ipm,
        monto_percepcion, dta_total, asiento_contable_json, fecha_operacion, activo
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, 1
      ) RETURNING *`,
            [
                data.caso_estudio_id, user_id, data.subpartida_hs10, data.descripcion_mercancia,
                data.moneda, data.valor_fob, data.valor_flete, data.valor_seguro,
                data.habilitar_igv, data.habilitar_isc, data.habilitar_percepcion,
                data.ad_valorem_tasa_manual, data.isc_tasa_ingresada, data.percepcion_tasa_ingresada,
                data.antidumping_ingresado, data.compensatorio_ingresado, data.sda_ingresado,
                calculado.valor_cif, calculado.monto_ad_valorem, calculado.monto_isc,
                calculado.monto_igv, calculado.monto_ipm, calculado.monto_percepcion,
                calculado.dta_total, JSON.stringify(calculado.asiento_contable),
                data.fecha_operacion || new Date().toISOString().split('T')[0]
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
            SELECT i.*, ce.nombre_caso, s.descripcion as subpartida_descripcion
            FROM miaff.importaciones i
                     JOIN miaff.casos_de_estudio ce ON ce.id = i.caso_estudio_id
                     LEFT JOIN miaff.subpartida s ON s.hs10 = i.subpartida_hs10
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
            `SELECT i.*, ce.nombre_caso, s.descripcion as subpartida_descripcion
             FROM miaff.importaciones i
                      JOIN miaff.casos_de_estudio ce ON ce.id = i.caso_estudio_id
                      LEFT JOIN miaff.subpartida s ON s.hs10 = i.subpartida_hs10
             WHERE i.id = $1 AND i.user_id = $2 AND i.activo = 1`,
            [id, user_id]
        );

        if (rows.length === 0) {
            return null;
        }

        const { rows: tributos } = await dbQuery<TributoDB>(
            'SELECT concepto, base_imponible, tasa_aplicada, monto_calculado FROM miaff.importacion_tributos WHERE importacion_id = $1',
            [id]
        );

        return {
            importacion: rows[0],
            tributos
        };
    }

    static async actualizarImportacion(
        id: number,
        user_id: string,
        data: UpdateImportacionData
    ): Promise<{ importacion: ImportacionDB; tributos: TributoDB[] } | null> {

        // Verificar que la importación existe y pertenece al usuario
        const existente = await this.obtenerImportacion(id, user_id);
        if (!existente) {
            return null;
        }

        // Combinar datos existentes con los nuevos
        const datosCompletos = {
            ...existente.importacion,
            ...data
        };

        // Obtener tasas de impuestos
        const tasasImpuestos = await this.obtenerTasasImpuestos();

        // Si cambió la subpartida y no hay tasa manual, obtener nueva tasa
        if (data.subpartida_hs10 && !data.ad_valorem_tasa_manual) {
            const tasaAutomatica = await this.obtenerTasaAdValorem(data.subpartida_hs10);
            datosCompletos.ad_valorem_tasa_manual = tasaAutomatica ?? 0;
        }

        // Recalcular todos los montos
        const calculado = this.calcularImportacion(datosCompletos, tasasImpuestos);

        // Actualizar la importación
        const { rows } = await dbQuery<ImportacionDB>(
            `UPDATE miaff.importaciones
       SET
         caso_estudio_id = $1,
         subpartida_hs10 = $2,
         descripcion_mercancia = $3,
         moneda = $4,
         valor_fob = $5,
         valor_flete = $6,
         valor_seguro = $7,
         habilitar_igv = $8,
         habilitar_isc = $9,
         habilitar_percepcion = $10,
         ad_valorem_tasa_manual = $11,
         isc_tasa_ingresada = $12,
         percepcion_tasa_ingresada = $13,
         antidumping_ingresado = $14,
         compensatorio_ingresado = $15,
         sda_ingresado = $16,
         valor_cif = $17,
         monto_ad_valorem = $18,
         monto_isc = $19,
         monto_igv = $20,
         monto_ipm = $21,
         monto_percepcion = $22,
         dta_total = $23,
         asiento_contable_json = $24,
         fecha_operacion = $25,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $26 AND user_id = $27 AND activo = 1
       RETURNING *`,
            [
                datosCompletos.caso_estudio_id,
                datosCompletos.subpartida_hs10,
                datosCompletos.descripcion_mercancia,
                datosCompletos.moneda,
                datosCompletos.valor_fob,
                datosCompletos.valor_flete,
                datosCompletos.valor_seguro,
                datosCompletos.habilitar_igv,
                datosCompletos.habilitar_isc,
                datosCompletos.habilitar_percepcion,
                datosCompletos.ad_valorem_tasa_manual,
                datosCompletos.isc_tasa_ingresada,
                datosCompletos.percepcion_tasa_ingresada,
                datosCompletos.antidumping_ingresado,
                datosCompletos.compensatorio_ingresado,
                datosCompletos.sda_ingresado,
                calculado.valor_cif,
                calculado.monto_ad_valorem,
                calculado.monto_isc,
                calculado.monto_igv,
                calculado.monto_ipm,
                calculado.monto_percepcion,
                calculado.dta_total,
                JSON.stringify(calculado.asiento_contable),
                datosCompletos.fecha_operacion,
                id,
                user_id
            ]
        );

        if (rows.length === 0) {
            return null;
        }

        // Eliminar tributos anteriores
        await dbQuery(
            'DELETE FROM miaff.importacion_tributos WHERE importacion_id = $1',
            [id]
        );

        // Insertar nuevos tributos
        for (const tributo of calculado.tributos) {
            await dbQuery(
                `INSERT INTO miaff.importacion_tributos (
          importacion_id, concepto, base_imponible, tasa_aplicada, monto_calculado
        ) VALUES ($1, $2, $3, $4, $5)`,
                [id, tributo.concepto, tributo.base_imponible, tributo.tasa_aplicada, tributo.monto_calculado]
            );
        }

        return {
            importacion: rows[0],
            tributos: calculado.tributos
        };
    }

    static async eliminarImportacion(id: number, user_id: string): Promise<boolean> {
        // Soft delete: cambiar activo a 0
        const { rows } = await dbQuery<{ id: number }>(
            `UPDATE miaff.importaciones
       SET activo = 0, updated_at = CURRENT_TIMESTAMP
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
}