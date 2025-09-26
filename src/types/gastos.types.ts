export interface JwtUser {
  sub: string;
  email: string;
  // otras propiedades...
}
export interface ClasificacionGastoDB {
  id: number;
  nombre: string;
}

export interface CrearGastoInput {
  caso_estudio_id: number;
  clasificacion_id: number;
  descripcion: string;
  cuenta_contable_codigo?: string;
  monto: number;
  moneda: 'USD' | 'PEN';
  fecha_gasto?: string;
}

export interface GastoDB {
  id: number;
  caso_estudio_id: number;
  user_id: string;
  clasificacion_id: number;
  nombre_clasificacion?: string;
  descripcion: string;
  cuenta_contable_codigo?: string | null;
  monto: string; // La BD devuelve numeric como string, lo convertiremos luego
  moneda: string;
  fecha_gasto: string;
  created_at: Date;
  updated_at: Date;
}