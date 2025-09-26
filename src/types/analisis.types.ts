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
  tributos: ImportacionTributo[];
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

export interface UtilidadBruta {
  ventas_totales: number;
  costo_adquisicion: number;
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

export interface RentabilityAnalysis {
  caso_estudio_id: number;
  nombre_caso: string;
  utilidad_bruta: UtilidadBruta;
  utilidad_operativa: UtilidadOperativa;
  utilidad_neta: UtilidadNeta;
  detalles: {
    importaciones: ImportacionDetalle[];
    exportaciones: ExportacionDetalle[];
    gastos: GastosPorClasificacion;
  };
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