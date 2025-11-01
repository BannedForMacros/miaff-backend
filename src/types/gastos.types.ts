// types/gastos.types.ts
export interface JwtUser {
    sub: string;
    email: string;
}

export interface ClasificacionGastoDB {
    id: number;
    nombre: string;
    cuenta_contable: string;
    tipo_gasto: 'OPERATIVO' | 'ADMINISTRATIVO' | 'VENTA' | 'FINANCIERO';
    calcula_igv: boolean;
}

export interface CrearGastoInput {
    caso_estudio_id: number;
    clasificacion_id: number;
    descripcion: string;
    monto: number;
    moneda: 'USD' | 'PEN';
    fecha_gasto?: string;

    // Para remuneraciones
    es_remuneracion?: boolean;
    tipo_pension?: 'ONP' | 'AFP' | null;
}

export interface ActualizarGastoInput {
    clasificacion_id?: number;
    descripcion?: string;
    monto?: number;
    moneda?: 'USD' | 'PEN';
    fecha_gasto?: string;

    es_remuneracion?: boolean;
    tipo_pension?: 'ONP' | 'AFP' | null;
}

export interface GastoDB {
    id: number;
    caso_estudio_id: number;
    user_id: string;
    clasificacion_id: number;
    descripcion: string;
    cuenta_contable_codigo?: string | null;
    monto: string;
    moneda: string;
    fecha_gasto: string;
    es_remuneracion: boolean;
    tipo_pension?: string | null;
    activo: number; // 👈 NUEVO CAMPO
    created_at: Date;
    updated_at: Date;

    // Joins
    nombre_clasificacion?: string;
    cuenta_contable?: string;
    tipo_gasto?: string;
    calcula_igv?: boolean;
}

export interface AsientoContableDetalle {
    codigo_cuenta: string;
    denominacion: string;
    debe: number;
    haber: number;
}

export interface AsientoContableCompleto {
    fecha: string;
    descripcion: string;
    detalles: AsientoContableDetalle[];
    total_debe: number;
    total_haber: number;
}

export interface CalculoTributario {
    total_remuneraciones: number;
    essalud: number; // 9%
    onp: number; // 13%
    afp: number; // 11.37%
    remuneraciones_por_pagar: number;

    total_gastos_con_igv: number;
    igv: number; // 18%
    facturas_por_pagar: number;

    total_gastos_financieros: number;
}

export interface ResumenGastosPorTipo {
    tipo: string;
    gastos: {
        cuenta: string;
        descripcion: string;
        monto: number;
    }[];
    total: number;
}

export interface DatosFinancierosInput {
    caso_estudio_id: number;
    activos_totales: number;
    patrimonio: number;
    moneda: 'USD' | 'PEN';
}

export interface DatosFinancieros {
    id: number;
    caso_estudio_id: number;
    user_id: string;
    activos_totales: string;
    patrimonio: string;
    moneda: string;
    created_at: Date;
    updated_at: Date;
}

export interface RatiosFinancieros {
    margen_bruto_porcentaje: number;
    margen_operativo_porcentaje: number;
    margen_neto_porcentaje: number;
    rentabilidad_sobre_ventas_ros: number;
    rentabilidad_sobre_activos_roa: number;
    rentabilidad_sobre_patrimonio_roe: number;

    ventas_totales_sin_igv: number;
    utilidad_bruta: number;
    utilidad_operativa: number;
    utilidad_neta: number;
    activos_totales: number;
    patrimonio: number;
}