import { dbQuery } from '../db';
import { CrearExportacionInput, ExportacionDB } from '../types/exportacion.types';

export class ExportacionService {

  static async crear(userId: string, data: CrearExportacionInput): Promise<ExportacionDB> {
    const {
      caso_estudio_id,
      es_venta_nacional,
      incoterm,
      descripcion_venta,
      pais_origen,     // <-- AÑADIDO
      pais_destino,    // <-- AÑADIDO
      valor_venta,
      moneda,
      fecha_operacion
    } = data;

    // Se añaden las nuevas columnas a la consulta SQL
    const sql = `
      INSERT INTO miaff.exportaciones (
        user_id, caso_estudio_id, es_venta_nacional, incoterm, 
        descripcion_venta, pais_origen, pais_destino, valor_venta, moneda, fecha_operacion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;
    
    // Se añaden los nuevos parámetros en el orden correcto
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
      fecha_operacion || new Date().toISOString().split('T')[0]
    ];

    const { rows } = await dbQuery(sql, params);
    return rows[0];
  }

  // Las funciones listar y obtenerPorId usan "SELECT *", por lo que no necesitan cambios.
  // Automáticamente incluirán las nuevas columnas.
  static async listar(userId: string, casoEstudioId?: number): Promise<ExportacionDB[]> {
    let sql = `
      SELECT * FROM miaff.exportaciones
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (casoEstudioId) {
      sql += ` AND caso_estudio_id = $2`;
      params.push(casoEstudioId);
    }

    sql += ` ORDER BY fecha_operacion DESC, created_at DESC;`;

    const { rows } = await dbQuery(sql, params);
    return rows;
  }

  static async obtenerPorId(id: number, userId: string): Promise<ExportacionDB | null> {
    const { rows } = await dbQuery(
      'SELECT * FROM miaff.exportaciones WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }
}