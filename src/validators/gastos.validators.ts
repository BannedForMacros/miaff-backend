import { z } from 'zod';

// Validador para crear un nuevo Gasto
export const crearGastoSchema = z.object({
  caso_estudio_id: z.number().int().positive({ message: 'El ID del caso de estudio es requerido.' }),
  clasificacion_id: z.number().int().positive({ message: 'Debe seleccionar una categoría de gasto.' }),
  descripcion: z.string().min(3, 'La descripción debe tener al menos 3 caracteres.'),
  cuenta_contable_codigo: z.string().optional(),
  monto: z.number().positive('El monto debe ser un número mayor a cero.'),
  moneda: z.enum(['USD', 'PEN']),
  fecha_gasto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'El formato de fecha debe ser YYYY-MM-DD').optional(),
});