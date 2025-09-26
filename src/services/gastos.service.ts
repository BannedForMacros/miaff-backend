import { dbQuery } from '../db';
import { CrearGastoInput, GastoDB, ClasificacionGastoDB } from '../types/gastos.types';

export class GastoService {

  static async listarClasificaciones(): Promise<ClasificacionGastoDB[]> {
    const sql = `SELECT id, nombre FROM miaff.clasificacion_gastos ORDER BY id;`;
    const { rows } = await dbQuery(sql);
    return rows;
  }

  static async crear(userId: string, data: CrearGastoInput): Promise<GastoDB> {
    const {
      caso_estudio_id,
      clasificacion_id,
      descripcion,
      cuenta_contable_codigo,
      monto,
      moneda,
      fecha_gasto
    } = data;

    const sql = `
      INSERT INTO miaff.gastos (
        user_id, caso_estudio_id, clasificacion_id, descripcion, 
        cuenta_contable_codigo, monto, moneda, fecha_gasto
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    
    const params = [
      userId,
      caso_estudio_id,
      clasificacion_id,
      descripcion,
      cuenta_contable_codigo,
      monto,
      moneda,
      fecha_gasto || new Date()
    ];

    const { rows } = await dbQuery(sql, params);
    return rows[0];
  }

  static async listarPorCaso(userId: string, casoEstudioId: number): Promise<GastoDB[]> {
    const sql = `
      SELECT 
        g.*, 
        cg.nombre as nombre_clasificacion
      FROM 
        miaff.gastos g
      JOIN 
        miaff.clasificacion_gastos cg ON g.clasificacion_id = cg.id
      WHERE 
        g.user_id = $1 AND g.caso_estudio_id = $2
      ORDER BY 
        g.fecha_gasto DESC, g.created_at DESC;
    `;
    const { rows } = await dbQuery(sql, [userId, casoEstudioId]);
    return rows;
  }
  
  static async eliminar(gastoId: number, userId: string): Promise<boolean> {
    const sql = `
      DELETE FROM miaff.gastos
      WHERE id = $1 AND user_id = $2;
    `;
    const { rows } = await dbQuery(sql, [gastoId, userId]);
    // --- CORRECCIÓN CLAVE ---
    // Un DELETE exitoso se mide con rowCount, no con rows.length
    return rows.length > 0;
  }
}