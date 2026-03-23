// exportacion.service.ts
import { dbQuery } from '../db';
import {
    CrearExportacionInput,
    ExportacionDB,
    ActualizarExportacionInput,
    TipoProductoVenta,
    AsientoContableExportacion,
    AsientoContableDetalle, AsientoContableExportacionDB
} from '../types/exportacion.types';
import { ExchangeRateService } from './exchangeRate.service';

// exportacion.service.ts

export class ExportacionService {

    // ====== CALCULAR MONTOS (sin cambios) ======
    private static calcularMontos(valor_venta: number, esVentaNacional: boolean): {
        base: number;
        igv: number;
        total: number
    } {
        if (esVentaNacional) {
            const base = Math.round((valor_venta / 1.18) * 100) / 100;
            const igv = valor_venta - base;
            return { base, igv, total: valor_venta };
        } else {
            return { base: valor_venta, igv: 0, total: valor_venta };
        }
    }

    // ====== LISTAR TIPOS DE PRODUCTO (sin cambios) ======
    static async listarTiposProducto(): Promise<TipoProductoVenta[]> {
        const sql = `
            SELECT id, nombre, cuenta_contable, requiere_igv
            FROM miaff.tipo_producto_venta
            ORDER BY cuenta_contable;
        `;
        const { rows } = await dbQuery<TipoProductoVenta>(sql);
        return rows;
    }

    // ====== GENERAR Y GUARDAR ASIENTO CONTABLE ======
    static async generarYGuardarAsientoContable(
        exportacionId: number,
        userId: string
    ): Promise<AsientoContableExportacionDB> {
        // 1. Obtener exportación con tipo de producto
        const sql = `
            SELECT
                e.*,
                tp.nombre as tipo_producto_nombre,
                tp.cuenta_contable as cuenta_venta,
                tp.requiere_igv
            FROM miaff.exportaciones e
                     JOIN miaff.tipo_producto_venta tp ON e.tipo_producto_id = tp.id
            WHERE e.id = $1 AND e.user_id = $2 AND e.activo = true;
        `;

        const { rows } = await dbQuery<ExportacionDB & {
            tipo_producto_nombre: string;
            cuenta_venta: string;
            requiere_igv: boolean;
        }>(sql, [exportacionId, userId]);

        if (rows.length === 0) {
            throw new Error('Exportación no encontrada');
        }

        const exportacion = rows[0];
        const detalles: AsientoContableDetalle[] = [];

        const montoBase = parseFloat(exportacion.monto_base);
        const montoIgv = parseFloat(exportacion.monto_igv);
        const montoTotal = parseFloat(exportacion.valor_venta);

        // 2. DEBE: Cuenta por cobrar
        const cuentaCobrar = exportacion.es_venta_nacional ? '1211' : '1212';
        const denominacionCobrar = exportacion.es_venta_nacional
            ? 'Facturas, boletas y otros comprobantes por cobrar nacionales'
            : 'Facturas, boletas y otros comprobantes por cobrar internacionales';

        detalles.push({
            codigo_cuenta: cuentaCobrar,
            denominacion: denominacionCobrar,
            debe: montoTotal,
            haber: 0
        });

        // 3. HABER: Cuenta de venta (7011, 7012, 7021, 7022)
        detalles.push({
            codigo_cuenta: exportacion.cuenta_venta,
            denominacion: exportacion.tipo_producto_nombre,
            debe: 0,
            haber: montoBase
        });

        // 4. HABER: IGV si es venta nacional
        if (exportacion.es_venta_nacional && montoIgv > 0) {
            detalles.push({
                codigo_cuenta: '40111',
                denominacion: 'IGV - Cuenta propia',
                debe: 0,
                haber: montoIgv
            });
        }

        const totalDebe = detalles.reduce((sum, d) => sum + d.debe, 0);
        const totalHaber = detalles.reduce((sum, d) => sum + d.haber, 0);

        const asientoContable: AsientoContableExportacion = {
            fecha: exportacion.fecha_operacion,
            descripcion: `Asiento por ${exportacion.es_venta_nacional ? 'venta nacional' : 'exportación'}: ${exportacion.descripcion_venta}`,
            detalles,
            total_debe: totalDebe,
            total_haber: totalHaber
        };

        // 5. GUARDAR EN BASE DE DATOS
        const insertSql = `
      INSERT INTO miaff.asientos_contables_exportacion (
        exportacion_id, caso_estudio_id, user_id, fecha, descripcion, 
        detalles, total_debe, total_haber, activo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      ON CONFLICT (exportacion_id) 
      DO UPDATE SET
        fecha = EXCLUDED.fecha,
        descripcion = EXCLUDED.descripcion,
        detalles = EXCLUDED.detalles,
        total_debe = EXCLUDED.total_debe,
        total_haber = EXCLUDED.total_haber,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

        const { rows: asientoRows } = await dbQuery<AsientoContableExportacionDB>(insertSql, [
            exportacionId,
            exportacion.caso_estudio_id,
            userId,
            asientoContable.fecha,
            asientoContable.descripcion,
            JSON.stringify(asientoContable.detalles),
            asientoContable.total_debe,
            asientoContable.total_haber
        ]);

        return asientoRows[0];
    }

    // ====== OBTENER ASIENTO CONTABLE GUARDADO ======
    static async obtenerAsientoContable(
        exportacionId: number,
        userId: string
    ): Promise<AsientoContableExportacionDB | null> {
        const sql = `
      SELECT * FROM miaff.asientos_contables_exportacion
      WHERE exportacion_id = $1 AND user_id = $2 AND activo = true;
    `;
        const { rows } = await dbQuery<AsientoContableExportacionDB>(sql, [exportacionId, userId]);
        return rows.length > 0 ? rows[0] : null;
    }

    // ====== LISTAR ASIENTOS POR CASO DE ESTUDIO ======
    static async listarAsientosPorCaso(
        casoEstudioId: number,
        userId: string
    ): Promise<AsientoContableExportacionDB[]> {
        const sql = `
            SELECT * FROM miaff.asientos_contables_exportacion
            WHERE caso_estudio_id = $1 AND user_id = $2 AND activo = true
            ORDER BY fecha DESC, created_at DESC;
        `;
        const { rows } = await dbQuery<AsientoContableExportacionDB>(sql, [casoEstudioId, userId]);
        return rows;
    }

    // ====== CREAR EXPORTACIÓN Y GENERAR ASIENTO ======
    static async crear(userId: string, data: CrearExportacionInput): Promise<{
        exportacion: ExportacionDB;
        asiento: AsientoContableExportacionDB;
    }> {
        const {
            caso_estudio_id,
            es_venta_nacional,
            tipo_producto_id,
            incoterm,
            descripcion_venta,
            pais_origen,
            pais_destino,
            valor_venta,
            moneda,
            fecha_operacion
        } = data;

        const calculado = this.calcularMontos(valor_venta, es_venta_nacional);

        // Obtener TC de la fecha de operación
        const fechaOp = fecha_operacion || new Date().toISOString().split('T')[0];
        let tipoCambioFecha: number | null = null;
        try {
            tipoCambioFecha = await ExchangeRateService.getExchangeRate(fechaOp);
        } catch (e) {
            console.warn('⚠️ No se pudo obtener TC para fecha', fechaOp, e);
        }

        const sql = `
      INSERT INTO miaff.exportaciones (
        user_id, caso_estudio_id, es_venta_nacional, tipo_producto_id, incoterm,
        descripcion_venta, pais_origen, pais_destino,
        valor_venta, monto_base, monto_igv, moneda, fecha_operacion, tipo_cambio_fecha, activo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
      RETURNING *;
    `;

        const params = [
            userId,
            caso_estudio_id,
            es_venta_nacional,
            tipo_producto_id,
            incoterm || null,
            descripcion_venta,
            pais_origen || null,
            pais_destino || null,
            calculado.total,
            calculado.base,
            calculado.igv,
            moneda,
            fechaOp,
            tipoCambioFecha
        ];

        const { rows } = await dbQuery<ExportacionDB>(sql, params);
        const exportacion = rows[0];

        // GENERAR Y GUARDAR ASIENTO CONTABLE AUTOMÁTICAMENTE
        const asiento = await this.generarYGuardarAsientoContable(exportacion.id, userId);

        return { exportacion, asiento };
    }

    // ====== ACTUALIZAR EXPORTACIÓN Y REGENERAR ASIENTO ======
    static async actualizar(
        id: number,
        userId: string,
        data: Partial<CrearExportacionInput>
    ): Promise<{
        exportacion: ExportacionDB;
        asiento: AsientoContableExportacionDB;
    } | null> {
        const existente = await this.obtenerPorId(id, userId);
        if (!existente) return null;

        const esVentaNacionalCambiada = data.es_venta_nacional !== undefined;
        const valorVentaCambiado = data.valor_venta !== undefined;

        let montoBase = parseFloat(existente.monto_base);
        let montoIgv = parseFloat(existente.monto_igv);
        let valorVenta = parseFloat(existente.valor_venta);

        if (esVentaNacionalCambiada || valorVentaCambiado) {
            const esVentaNacional = data.es_venta_nacional ?? existente.es_venta_nacional;
            const nuevoValorVenta = data.valor_venta ?? parseFloat(existente.valor_venta);

            const calculado = this.calcularMontos(nuevoValorVenta, esVentaNacional);
            montoBase = calculado.base;
            montoIgv = calculado.igv;
            valorVenta = calculado.total;
        }

        const camposPermitidos = [
            'caso_estudio_id', 'es_venta_nacional', 'tipo_producto_id', 'incoterm', 'descripcion_venta',
            'pais_origen', 'pais_destino', 'moneda', 'fecha_operacion'
        ];

        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        camposPermitidos.forEach(campo => {
            if (data[campo as keyof CrearExportacionInput] !== undefined) {
                updates.push(`${campo} = $${paramCount}`);
                values.push(data[campo as keyof CrearExportacionInput]);
                paramCount++;
            }
        });

        updates.push(`valor_venta = $${paramCount}`);
        values.push(valorVenta);
        paramCount++;

        updates.push(`monto_base = $${paramCount}`);
        values.push(montoBase);
        paramCount++;

        updates.push(`monto_igv = $${paramCount}`);
        values.push(montoIgv);
        paramCount++;

        updates.push('updated_at = CURRENT_TIMESTAMP');

        values.push(id, userId);

        const sql = `
            UPDATE miaff.exportaciones
            SET ${updates.join(', ')}
            WHERE id = $${paramCount} AND user_id = $${paramCount + 1} AND activo = true
                RETURNING *;
        `;

        const { rows } = await dbQuery<ExportacionDB>(sql, values);
        if (rows.length === 0) return null;

        const exportacion = rows[0];

        // REGENERAR ASIENTO CONTABLE
        const asiento = await this.generarYGuardarAsientoContable(exportacion.id, userId);

        return { exportacion, asiento };
    }

    // Resto de métodos sin cambios...
    static async listar(userId: string, casoEstudioId?: number): Promise<ExportacionDB[]> {
        let sql = `
      SELECT e.*, tp.nombre as tipo_producto_nombre, tp.cuenta_contable
      FROM miaff.exportaciones e
      LEFT JOIN miaff.tipo_producto_venta tp ON e.tipo_producto_id = tp.id
      WHERE e.user_id = $1 AND e.activo = true
    `;
        const params: any[] = [userId];

        if (casoEstudioId) {
            sql += ` AND e.caso_estudio_id = $${params.length + 1}`;
            params.push(casoEstudioId);
        }

        sql += ` ORDER BY e.fecha_operacion DESC, e.created_at DESC;`;

        const { rows } = await dbQuery<ExportacionDB>(sql, params);
        return rows;
    }

    static async obtenerPorId(id: number, userId: string): Promise<ExportacionDB | null> {
        const sql = `
      SELECT e.*, tp.nombre as tipo_producto_nombre, tp.cuenta_contable
      FROM miaff.exportaciones e
      LEFT JOIN miaff.tipo_producto_venta tp ON e.tipo_producto_id = tp.id
      WHERE e.id = $1 AND e.user_id = $2 AND e.activo = true
    `;
        const { rows } = await dbQuery<ExportacionDB>(sql, [id, userId]);
        return rows.length > 0 ? rows[0] : null;
    }

    static async eliminar(id: number, userId: string): Promise<boolean> {
        const { rows } = await dbQuery(
            `UPDATE miaff.exportaciones 
       SET activo = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND activo = true
       RETURNING id`,
            [id, userId]
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