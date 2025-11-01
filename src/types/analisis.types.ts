// types/analisis.types.ts

export interface ImportacionDetalle {
    id: number;
    subpartida_hs10: string;
    descripcion_mercancia: string;
    valor_fob: number;
    valor_flete: number;
    valor_seguro: number;
    valor_cif: number;
    monto_ad_valorem: number;
    monto_isc: number;
    monto_igv: number;
    monto_ipm: number;
    monto_percepcion: number;
    dta_total: number;
    fecha_operacion: Date;
    tributos?: ImportacionTributo[];
}

export interface ImportacionTributo {
    id: number;
    concepto: string;
    base_imponible: number;
    tasa_aplicada: number;
    monto_calculado: number;
}

export interface ExportacionDetalle {
    id: number;
    es_venta_nacional: boolean;
    incoterm: string | null;
    descripcion_venta: string;
    valor_venta: number;
    moneda: string;
    fecha_operacion: Date;
    pais_origen: string | null;
    pais_destino: string | null;
}

export interface GastoDetalle {
    id: number;
    clasificacion_id: number;
    clasificacion_nombre: string;
    descripcion: string;
    cuenta_contable_codigo: string | null;
    monto: number;
    moneda: string;
    fecha_gasto: Date;
}

export interface GastosPorClasificacion {
    operativos: GastoDetalle[];
    administrativos: GastoDetalle[];
    ventas: GastoDetalle[];
    financieros: GastoDetalle[];
}

export type DetallesAnalisis = {
    importaciones: ImportacionDetalle[];
    exportaciones: ExportacionDetalle[];
    gastos: GastosPorClasificacion;
};

export interface UtilidadBruta {
    ventas_totales: number;
    ventas_totales_sin_igv: number;  // ✅ NUEVO
    costo_ventas: number;              // ✅ NUEVO (antes costo_adquisicion)
    utilidad_bruta: number;
    margen_bruto_porcentaje: number;
}

export interface UtilidadOperativa {
    utilidad_bruta: number;
    gastos_operativos: number;
    utilidad_operativa: number;
    margen_operativo_porcentaje: number;
}

export interface UtilidadNeta {
    utilidad_operativa: number;
    gastos_administrativos: number;
    gastos_ventas: number;
    gastos_financieros: number;
    total_otros_gastos: number;
    utilidad_neta: number;
    margen_neto_porcentaje: number;
}

// ✅ NUEVO: Estado de Resultados completo
export interface EstadoResultados {
    ventas: {
        mercaderias_nacionales: number;
        mercaderias_internacionales: number;
        productos_terminados_nacionales: number;
        productos_terminados_internacionales: number;
        total_ventas: number;
        total_ventas_sin_igv: number;
    };
    costo_ventas: {
        materias_primas: number;
        materiales_auxiliares: number;
        envases_embalajes: number;
        costos_vinculados: number; // AD, CVD, SDA
        total_costo_ventas: number;
    };
    utilidad_bruta: number;
    gastos_operativos: {
        remuneraciones: number;
        seguridad_social: number;
        transporte_viajes: number;
        asesoria_consultoria: number;
        produccion_terceros: number;
        mantenimiento_reparaciones: number;
        alquileres: number;
        servicios_basicos: number;
        otros_servicios: number;
        seguros: number;
        otros_gastos: number;
        total_gastos_operativos: number;
    };
    utilidad_operativa: number;
    gastos_administrativos: {
        remuneraciones: number;
        seguridad_social: number;
        transporte_viajes: number;
        asesoria_consultoria: number;
        mantenimiento_reparaciones: number;
        alquileres: number;
        servicios_basicos: number;
        otros_servicios: number;
        seguros: number;
        otros_gastos: number;
        total_gastos_administrativos: number;
    };
    gastos_ventas: {
        remuneraciones: number;
        seguridad_social: number;
        transporte_viajes: number;
        asesoria_consultoria: number;
        mantenimiento_reparaciones: number;
        alquileres: number;
        servicios_basicos: number;
        publicidad: number;
        otros_servicios: number;
        seguros: number;
        otros_gastos: number;
        total_gastos_ventas: number;
    };
    gastos_financieros: {
        intereses_desgravamen: number;
        comisiones_bancarias: number;
        total_gastos_financieros: number;
    };
    utilidad_neta: number;
}

// ✅ NUEVO: Ratios Financieros
export interface RatiosFinancieros {
    margen_bruto: number;
    margen_operativo: number;
    margen_neto: number;
    ros: number; // Rentabilidad sobre Ventas (igual a margen_neto)
    roa: number | null; // Rentabilidad sobre Activos (requiere input)
    roe: number | null; // Rentabilidad sobre Patrimonio (requiere input)
}

// ✅ NUEVO: Interpretación de ratio
export interface InterpretacionRatio {
    ratio: string;
    valor: number | null;
    interpretacion: string;
    estado: 'excelente' | 'bueno' | 'aceptable' | 'precaucion' | 'alerta' | 'no_calculado';
    color: string;
}

export interface RentabilityAnalysis {
    caso_estudio_id: number;
    nombre_caso: string;
    utilidad_bruta: UtilidadBruta;
    utilidad_operativa: UtilidadOperativa;
    utilidad_neta: UtilidadNeta;
    detalles: DetallesAnalisis;
    estado_resultados: EstadoResultados;  // ✅ NUEVO
    ratios_financieros: RatiosFinancieros; // ✅ NUEVO
    interpretaciones?: InterpretacionRatio[]; // ✅ NUEVO (se calcula en frontend)
    resumen_monedas: {
        total_usd: number;
        total_pen: number;
        tipo_cambio_sugerido?: number;
    };
}

export interface RentabilityQueryParams {
    caso_id: string;
    incluir_detalles?: 'true' | 'false';
    moneda_base?: 'USD' | 'PEN';
}

// ✅ NUEVO: Inputs opcionales para ratios
export interface InputsFinancieros {
    activos_totales: number | null;
    patrimonio: number | null;
}