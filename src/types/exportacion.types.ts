// No se necesita RowDataPacket de mysql2, usamos tipos puros.

/**
 * Define la estructura de datos que la aplicación móvil envía para crear una exportación.
 */
export interface CrearExportacionInput {
  caso_estudio_id: number;
  es_venta_nacional: boolean;
  incoterm?: 'EXW' | 'FCA' | 'FAS' | 'FOB' | 'CFR' | 'CIF' | 'CPT' | 'CIP' | 'DPU' | 'DAP' | 'DDP';
  descripcion_venta: string;
  pais_origen?: string;      // <-- AÑADIDO
  pais_destino?: string;     // <-- AÑADIDO
  valor_venta: number;
  moneda: 'USD' | 'PEN';
  fecha_operacion?: string;
}

/**
 * Define la estructura del objeto de exportación tal como existe en la base de datos PostgreSQL.
 */
export interface ExportacionDB {
  id: number;
  caso_estudio_id: number;
  user_id: string;
  es_venta_nacional: boolean;
  incoterm?: string;
  descripcion_venta: string;
  pais_origen?: string | null;  // <-- AÑADIDO
  pais_destino?: string | null; // <-- AÑADIDO
  valor_venta: number;
  moneda: string;
  fecha_operacion: string;
  created_at: Date;
  updated_at: Date;
}