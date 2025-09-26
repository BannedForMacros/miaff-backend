import { z } from 'zod';

const asBool = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (['true','1','on','yes','si','sí'].includes(s)) return true;
  if (['false','0','off','no'].includes(s)) return false;
  return v;
}, z.boolean());

export const createImportacionSchema = z.object({
  caso_estudio_id: z.number().int().positive('El caso de estudio es requerido'),
  subpartida_hs10: z.string().length(10, 'La subpartida debe tener exactamente 10 dígitos'),
  descripcion_mercancia: z.string().min(3, 'La descripción debe tener al menos 3 caracteres').max(255),
  moneda: z.enum(['USD', 'PEN'], { required_error: 'Moneda debe ser USD o PEN' }),
  valor_fob: z.number().positive('El valor FOB debe ser mayor a 0'),
  valor_flete: z.number().min(0, 'El valor flete no puede ser negativo'),
  valor_seguro: z.number().min(0, 'El valor seguro no puede ser negativo'),
  habilitar_igv: asBool.default(true),
  habilitar_isc: asBool.default(false),
  habilitar_percepcion: asBool.default(true),
  ad_valorem_tasa_manual: z.number().min(0).max(1).optional(),
  isc_tasa_ingresada: z.number().min(0).max(1).optional(),
  percepcion_tasa_ingresada: z.number().min(0).max(1).optional(),
  antidumping_ingresado: z.number().min(0).default(0),
  compensatorio_ingresado: z.number().min(0).default(0),
  sda_ingresado: z.number().min(0).default(0),
  fecha_operacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateImportacionSchema = createImportacionSchema.partial().omit({ caso_estudio_id: true });