// exportacion.types.ts
export interface TipoProductoVenta {
    id: number;
    nombre: string;
    cuenta_contable: string;
    requiere_igv: boolean;
}

export interface CrearExportacionInput {
    caso_estudio_id: number;
    es_venta_nacional: boolean;
    tipo_producto_id: number; // NUEVO
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
    tipo_producto_id: number; // NUEVO
    incoterm?: string;
    descripcion_venta: string;
    pais_origen?: string | null;
    pais_destino?: string | null;
    valor_venta: string;
    monto_base: string;
    monto_igv: string;
    moneda: string;
    fecha_operacion: string;
    created_at: Date;
    updated_at: Date;
    activo?: boolean;
}



export interface AsientoContableDetalle {
    codigo_cuenta: string;
    denominacion: string;
    debe: number;
    haber: number;
}

export interface AsientoContableExportacion {
    fecha: string;
    descripcion: string;
    detalles: AsientoContableDetalle[];
    total_debe: number;
    total_haber: number;
}

// NUEVO: Interface para el asiento guardado en BD
export interface AsientoContableExportacionDB {
    id: number;
    exportacion_id: number;
    caso_estudio_id: number;
    user_id: string;
    fecha: string;
    descripcion: string;
    detalles: AsientoContableDetalle[]; // JSONB parseado
    total_debe: string;
    total_haber: string;
    created_at: Date;
    updated_at: Date;
    activo: boolean;
}