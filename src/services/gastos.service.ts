import { dbQuery } from '../db';
import { CrearGastoInput, GastoDB, ClasificacionGastoDB } from '../types/gastos.types';

export class GastoService {

  static async listarClasificaciones(): Promise<ClasificacionGastoDB[]> {
    const sql = `SELECT id, nombre FROM miaff.clasificacion_gastos ORDER BY id;`;
    
    // ✅ CORRECCIÓN: Se especifica el tipo <ClasificacionGastoDB>
    const { rows } = await dbQuery<ClasificacionGastoDB>(sql);
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

    // ✅ CORRECCIÓN: Se especifica el tipo <GastoDB>
    const { rows } = await dbQuery<GastoDB>(sql, params);
    return rows[0];
  }

  static async listarPorCaso(userId: string, casoEstudioId: number): Promise<GastoDB[]> {
    const sql = `
      SELECT 
        g.*, 
        cg.nombre as clasificacion_nombre
      FROM 
        miaff.gastos g
      JOIN 
        miaff.clasificacion_gastos cg ON g.clasificacion_id = cg.id
      WHERE 
        g.user_id = $1 AND g.caso_estudio_id = $2
      ORDER BY 
        g.fecha_gasto DESC, g.created_at DESC;
    `;
    // ✅ CORRECCIÓN: Se especifica el tipo <GastoDB>
    const { rows } = await dbQuery<GastoDB>(sql, [userId, casoEstudioId]);
    return rows;
  }
  
  static async eliminar(gastoId: number, userId: string): Promise<boolean> {
    // ✅ CORRECCIÓN LÓGICA: Se añade 'RETURNING id' a la consulta.
    // Un DELETE normal no devuelve filas. Al añadir 'RETURNING id', la consulta
    // devolverá la fila eliminada, permitiendo que 'rows.length > 0' funcione
    // como se espera para confirmar que algo se borró.
    const sql = `
      DELETE FROM miaff.gastos
      WHERE id = $1 AND user_id = $2
      RETURNING id;
    `;
    
    // ✅ CORRECCIÓN DE TIPO: Se especifica el tipo que retorna la consulta.
    const { rows } = await dbQuery<{ id: number }>(sql, [gastoId, userId]);
    return rows.length > 0;
  }
}