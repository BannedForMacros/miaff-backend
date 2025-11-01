// En Exportacion.service.ts
import { dbQuery } from '../db';
import { CrearExportacionInput, ExportacionDB, ActualizarExportacionInput } from '../types/exportacion.types';

export class ExportacionService {

    static async crear(userId: string, data: CrearExportacionInput): Promise<ExportacionDB> {
        const {
            caso_estudio_id,
            es_venta_nacional,
            incoterm,
            descripcion_venta,
            pais_origen,
            pais_destino,
            valor_venta,
            moneda,
            fecha_operacion
        } = data;

        const sql = `
            INSERT INTO miaff.exportaciones (
                user_id, caso_estudio_id, es_venta_nacional, incoterm,
                descripcion_venta, pais_origen, pais_destino, valor_venta,
                moneda, fecha_operacion, activo
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *;
        `;

        const params = [
            userId,
            caso_estudio_id,
            es_venta_nacional,
            incoterm,
            descripcion_venta,
            pais_origen,
            pais_destino,
            valor_venta,
            moneda,
            fecha_operacion || new Date().toISOString().split('T')[0],
            true // activo
        ];

        const { rows } = await dbQuery<ExportacionDB>(sql, params);
        return rows[0];
    }

    static async listar(userId: string, casoEstudioId?: number): Promise<ExportacionDB[]> {
        let sql = `
      SELECT * FROM miaff.exportaciones
      WHERE user_id = $1 AND activo = true
    `;
        const params: any[] = [userId];

        if (casoEstudioId) {
            sql += ` AND caso_estudio_id = $${params.length + 1}`;
            params.push(casoEstudioId);
        }

        sql += ` ORDER BY fecha_operacion DESC, created_at DESC;`;

        const { rows } = await dbQuery<ExportacionDB>(sql, params);
        return rows;
    }

    static async obtenerPorId(id: number, userId: string): Promise<ExportacionDB | null> {
        const { rows } = await dbQuery<ExportacionDB>(
            'SELECT * FROM miaff.exportaciones WHERE id = $1 AND user_id = $2 AND activo = true',
            [id, userId]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    static async actualizar(id: number, userId: string, data: Partial<CrearExportacionInput>): Promise<ExportacionDB | null> {
        // Verificar que la exportación existe y pertenece al usuario
        const existente = await this.obtenerPorId(id, userId);
        if (!existente) {
            return null;
        }

        const camposPermitidos = [
            'caso_estudio_id', 'es_venta_nacional', 'incoterm', 'descripcion_venta',
            'pais_origen', 'pais_destino', 'valor_venta', 'moneda', 'fecha_operacion'
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

        if (updates.length === 0) {
            throw new Error('No se proporcionaron campos para actualizar');
        }

        // Agregar updated_at
        updates.push('updated_at = CURRENT_TIMESTAMP');

        values.push(id, userId);

        const sql = `
      UPDATE miaff.exportaciones 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1} AND activo = true
      RETURNING *;
    `;

        const { rows } = await dbQuery<ExportacionDB>(sql, values);
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

    // Verificar que el usuario tiene acceso al caso de estudio
    static async verificarCasoEstudioUsuario(caso_estudio_id: number, user_id: string): Promise<boolean> {
        const { rows } = await dbQuery(
            `SELECT id FROM miaff.casos_de_estudio
       WHERE id = $1 AND user_id = $2 AND estado != 'eliminado'`,
            [caso_estudio_id, user_id]
        );
        return rows.length > 0;
    }
}