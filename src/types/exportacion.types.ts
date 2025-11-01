// En tu archivo de tipos (exportacion.types.ts)
export interface CrearExportacionInput {
    caso_estudio_id: number;
    es_venta_nacional: boolean;
    incoterm?: 'EXW' | 'FCA' | 'FAS' | 'FOB' | 'CFR' | 'CIF' | 'CPT' | 'CIP' | 'DPU' | 'DAP' | 'DDP';
    descripcion_venta: string;
    pais_origen?: string;
    pais_destino?: string;
    valor_venta: number;
    moneda: 'USD' | 'PEN';
    fecha_operacion?: string;
}

export interface ActualizarExportacionInput extends Partial<CrearExportacionInput> {
    id: number;
}

export interface ExportacionDB {
    id: number;
    caso_estudio_id: number;
    user_id: string;
    es_venta_nacional: boolean;
    incoterm?: string;
    descripcion_venta: string;
    pais_origen?: string | null;
    pais_destino?: string | null;
    valor_venta: number;
    moneda: string;
    fecha_operacion: string;
    created_at: Date;
    updated_at: Date;
    activo?: boolean; // Agregar este campo para soft delete
}