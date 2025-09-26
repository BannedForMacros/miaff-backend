import { z } from 'zod';

const incotermEnum = z.enum([
    'EXW', 'FCA', 'FAS', 'FOB', 
    'CFR', 'CIF', 'CPT', 'CIP',
    'DPU', 'DAP', 'DDP'
]);

export const crearExportacionSchema = z.object({
  caso_estudio_id: z.number({ required_error: 'El ID del caso de estudio es requerido.' }).int().positive(),
  es_venta_nacional: z.boolean().default(false),
  incoterm: incotermEnum.optional(),
  descripcion_venta: z.string({ required_error: 'La descripción es requerida.' }).min(3, 'La descripción debe tener al menos 3 caracteres.'),
  pais_origen: z.string().optional(),      // <-- AÑADIDO
  pais_destino: z.string().optional(),     // <-- AÑADIDO
  valor_venta: z.number({ required_error: 'El valor de la venta es requerido.' }).positive('El valor de la venta debe ser mayor a cero.'),
  moneda: z.enum(['USD', 'PEN'], { required_error: 'La moneda debe ser USD o PEN.' }),
  fecha_operacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'El formato de fecha debe ser YYYY-MM-DD').optional(),
});