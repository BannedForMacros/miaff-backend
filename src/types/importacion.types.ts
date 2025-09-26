export interface JwtUser {
  sub: string;
  email: string;
  // otras propiedades...
}

export interface ImportacionCalculada {
  valor_cif: number;
  monto_ad_valorem: number;
  monto_isc: number;
  monto_igv: number;
  monto_ipm: number;
  monto_percepcion: number;
  dta_total: number;
  tributos: Array<{
    concepto: string;
    base_imponible: number;
    tasa_aplicada: number;
    monto_calculado: number;
  }>;
  asiento_contable: any[];
}

export interface CreateImportacionData {
  caso_estudio_id: number;
  subpartida_hs10: string;
  descripcion_mercancia: string;
  moneda: 'USD' | 'PEN';
  valor_fob: number;
  valor_flete: number;
  valor_seguro: number;
  habilitar_igv: boolean;
  habilitar_isc: boolean;
  habilitar_percepcion: boolean;
  ad_valorem_tasa_manual?: number;
  isc_tasa_ingresada?: number;
  percepcion_tasa_ingresada?: number;
  antidumping_ingresado: number;
  compensatorio_ingresado: number;
  sda_ingresado: number;
  fecha_operacion?: string;
}

export interface ImportacionFromSimulation {
  subpartida_hs10: string;
  descripcion_mercancia: string;
  valor_fob: number;
  valor_flete: number;
  valor_seguro: number;
  moneda: 'USD';
  habilitar_igv: boolean;
  habilitar_isc: boolean;
  habilitar_percepcion: boolean;
  ad_valorem_tasa_manual?: number;
  isc_tasa_ingresada?: number;
  percepcion_tasa_ingresada?: number;
  antidumping_ingresado: number;
  compensatorio_ingresado: number;
  sda_ingresado: number;
  // Campos calculados
  valor_cif: number;
  monto_ad_valorem: number;
  monto_isc: number;
  monto_igv: number;
  monto_ipm: number;
  monto_percepcion: number;
  dta_total: number;
}

export interface ImportacionDB {
  id: number;
  caso_estudio_id: number;
  user_id: string;
  subpartida_hs10: string;
  descripcion_mercancia: string;
  moneda: 'USD' | 'PEN';
  valor_fob: number;
  valor_flete: number;
  valor_seguro: number;
  habilitar_igv: boolean;
  habilitar_isc: boolean;
  habilitar_percepcion: boolean;
  ad_valorem_tasa_manual?: number;
  isc_tasa_ingresada?: number;
  percepcion_tasa_ingresada?: number;
  antidumping_ingresado: number;
  compensatorio_ingresado: number;
  sda_ingresado: number;
  valor_cif: number;
  monto_ad_valorem: number;
  monto_isc: number;
  monto_igv: number;
  monto_ipm: number;
  monto_percepcion: number;
  dta_total: number;
  asiento_contable_json: any;
  fecha_operacion: string;
  created_at: Date;
  updated_at: Date;
  nombre_caso?: string;
  subpartida_descripcion?: string;
}

export interface TributoDB {
  concepto: string;
  base_imponible: number;
  tasa_aplicada: number;
  monto_calculado: number;
}