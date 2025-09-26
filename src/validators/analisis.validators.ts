// validators/analisis.validators.ts

import { z } from 'zod';

// Validador para obtener análisis de rentabilidad
export const obtenerAnalisisSchema = z.object({
  caso_id: z.string()
    .transform(val => parseInt(val))
    .refine(val => !isNaN(val) && val > 0, { 
      message: 'El ID del caso debe ser un número entero positivo.' 
    }),
});

// Validador para query parameters del análisis
export const analisisQuerySchema = z.object({
  incluir_detalles: z.enum(['true', 'false'])
    .optional()
    .default('true')
    .transform(val => val === 'true'),
  moneda_base: z.enum(['USD', 'PEN'])
    .optional()
    .default('USD'),
});

// Validador para análisis comparativo
export const analisisComparativoSchema = z.object({
  limite: z.string()
    .optional()
    .transform(val => val ? parseInt(val) : 10)
    .refine(val => !isNaN(val) && val > 0 && val <= 50, { 
      message: 'El límite debe ser un número entre 1 y 50.' 
    }),
});

// Validador para configuración de tipo de cambio
export const tipoCambioSchema = z.object({
  tipo_cambio: z.number()
    .min(0.1, 'El tipo de cambio debe ser mayor a 0.1')
    .max(10, 'El tipo de cambio debe ser menor a 10')
    .optional(),
});

// Validador combinado para el endpoint principal
export const analisisCompletoSchema = z.object({
  params: obtenerAnalisisSchema,
  query: analisisQuerySchema,
});

// Tipo inferido para TypeScript
export type ObtenerAnalisisInput = z.infer<typeof obtenerAnalisisSchema>;
export type AnalisisQueryInput = z.infer<typeof analisisQuerySchema>;
export type AnalisisComparativoInput = z.infer<typeof analisisComparativoSchema>;
export type TipoCambioInput = z.infer<typeof tipoCambioSchema>;