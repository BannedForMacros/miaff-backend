// validators/gastos.validators.ts
import { z } from 'zod';

export const crearGastoSchema = z.object({
  caso_estudio_id: z.number().int().positive({ 
    message: 'El ID del caso de estudio es requerido.' 
  }),
  clasificacion_id: z.number().int().positive({ 
    message: 'Debe seleccionar una categoría de gasto.' 
  }),
  descripcion: z.string().min(3, 'La descripción debe tener al menos 3 caracteres.'),
  monto: z.number().positive('El monto debe ser un número mayor a cero.'),
  moneda: z.enum(['USD', 'PEN']),
  fecha_gasto: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'El formato de fecha debe ser YYYY-MM-DD')
    .optional(),
  
  es_remuneracion: z.boolean().optional().default(false),
  tipo_pension: z.enum(['ONP', 'AFP']).nullable().optional(),
  incluye_igv: z.boolean().optional().nullable(),
}).refine((data) => {
  if (data.es_remuneracion && !data.tipo_pension) {
    return false;
  }
  return true;
}, {
  message: 'Las remuneraciones deben indicar el tipo de pensión (ONP o AFP)',
  path: ['tipo_pension'],
});
export const actualizarGastoSchema = z.object({
    clasificacion_id: z.number().int().positive({
        message: 'El ID de clasificación debe ser un entero positivo.'
    }).optional(),

    descripcion: z.string().min(3, 'La descripción debe tener al menos 3 caracteres.').optional(),

    monto: z.number().positive('El monto debe ser un número mayor a cero.').optional(),

    moneda: z.enum(['USD', 'PEN']).optional(),

    fecha_gasto: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'El formato de fecha debe ser YYYY-MM-DD')
        .optional(),

    es_remuneracion: z.boolean().optional(),

    tipo_pension: z.enum(['ONP', 'AFP']).nullable().optional(),

    incluye_igv: z.boolean().optional().nullable(),

}).refine((data) => {
    // Si 'es_remuneracion' se envía como true, 'tipo_pension' no debe ser nulo o indefinido
    if (data.es_remuneracion === true && !data.tipo_pension) {
        return false;
    }
    return true;
}, {
    message: 'Si se marca como remuneración, debe indicar el tipo de pensión (ONP o AFP)',
    path: ['tipo_pension'],
});

export const datosFinancierosSchema = z.object({
  caso_estudio_id: z.number().int().positive({ 
    message: 'El ID del caso de estudio es requerido.' 
  }),
  activos_totales: z.number().positive('Los activos totales deben ser mayores a cero.'),
  patrimonio: z.number().positive('El patrimonio debe ser mayor a cero.'),
  moneda: z.enum(['USD', 'PEN']),
});