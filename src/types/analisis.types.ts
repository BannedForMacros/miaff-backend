// types/analisis.types.ts - VERSIÓN CORREGIDA SIN tipo_cambio

export interface ImportacionDetalle {
    id: number;
    subpartida_hs10: string;
    descripcion_mercancia: string;
    tipo_mercancia_id: number;
    tipo_mercancia_cuenta: string;
    tipo_mercancia_nombre: string;
    valor_fob: number;
    valor_flete: number;
    valor_seguro: number;
    valor_cif: number;
    monto_ad_valorem: number;
    monto_isc: number;
    monto_igv: number;
    monto_ipm: number;
    monto_percepcion: number;
    antidumping_ingresado: number;
    compensatorio_ingresado: number;
    sda_ingresado: number;
    dta_total: number;
    moneda: 'USD' | 'PEN'; // Moneda original
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
    tipo_producto_id: number;
    tipo_producto_nombre: string;
    tipo_producto_cuenta: string;
    incoterm: string | null;
    descripcion_venta: string;
    valor_venta: number; // Valor ORIGINAL en su moneda
    monto_base: number; // Base sin IGV en moneda original
    monto_igv: number; // IGV en moneda original
    moneda: 'USD' | 'PEN'; // Moneda original
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
    monto: number; // Monto total en moneda original
    monto_base: number; // Base sin IGV en moneda original
    monto_igv: number; // IGV en moneda original
    moneda: 'USD' | 'PEN'; // Moneda original
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

// Desglose común para gastos operativos, administrativos y ventas
export interface DesgloseGastos {
    remuneraciones: number;
    seguridad_social: number;
    transporte_viajes: number;
    asesoria_consultoria: number;
    produccion_terceros: number;
    mantenimiento_reparaciones: number;
    alquileres: number;
    servicios_basicos: number;
    publicidad: number;
    otros_servicios: number;
    seguros: number;
    otros_gastos: number;
}

// ✅ Estado de Resultados en USD (moneda base)
export interface EstadoResultados {
    ventas: {
        mercaderias_nacionales: number;
        mercaderias_internacionales: number;
        productos_terminados_nacionales: number;
        productos_terminados_internacionales: number;
        total_ventas_sin_igv: number; // ✅ SOLO SIN IGV
    };
    costo_ventas: {
        // ✅ SOLO CUENTAS 601-604, 609
        mercaderias: number; // 601
        materias_primas: number; // 602
        materiales_auxiliares: number; // 603
        envases_embalajes: number; // 604
        costos_vinculados: number; // 609: AD, CVD, SDA
        total_costo_ventas: number;
    };
    utilidad_bruta: number;
    gastos_operativos: DesgloseGastos & { total_gastos_operativos: number };
    utilidad_operativa: number;
    gastos_administrativos: DesgloseGastos & { total_gastos_administrativos: number };
    gastos_ventas: DesgloseGastos & { total_gastos_ventas: number };
    gastos_financieros: {
        intereses_desgravamen: number;
        comisiones_bancarias: number;
        total_gastos_financieros: number;
    };
    utilidad_neta: number;
}

export interface UtilidadBruta {
    ventas_totales_sin_igv: number; // ✅ SIN IGV
    costo_ventas: number;
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

export interface RatiosFinancieros {
    margen_bruto: number;
    margen_operativo: number;
    margen_neto: number;
    ros: number;
    roa: number | null;
    roe: number | null;
}

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
    estado_resultados: EstadoResultados;
    ratios_financieros: RatiosFinancieros;
    interpretaciones?: InterpretacionRatio[];
    resumen_monedas: {
        total_usd: number;
        total_pen: number;
        tipo_cambio_usado: number; // Para referencia del frontend
    };
}

export interface RentabilityQueryParams {
    caso_id: string;
    incluir_detalles?: 'true' | 'false';
    moneda_base?: 'USD' | 'PEN';
}

export interface InputsFinancieros {
    activos_totales: number | null;
    patrimonio: number | null;
}