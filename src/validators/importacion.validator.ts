import { z } from 'zod';

export const createImportacionSchema = z.object({
    caso_estudio_id: z.number({ required_error: 'El caso de estudio es obligatorio' }).int().positive(),
    es_compra_nacional: z.boolean().default(false),
    tipo_mercancia_id: z.number({ required_error: 'El tipo de mercancía es obligatorio' }).int().positive(),
    subpartida_hs10: z.string().optional(),
    descripcion_mercancia: z.string({ required_error: 'La descripción es obligatoria' }).min(3, 'La descripción debe tener al menos 3 caracteres'),
    moneda: z.enum(['USD', 'PEN'], { required_error: 'La moneda debe ser USD o PEN' }),
    valor_fob: z.number({ required_error: 'El monto es obligatorio' }).nonnegative('El monto no puede ser negativo'),
    valor_flete: z.number().nonnegative().default(0),
    valor_seguro: z.number().nonnegative().default(0),
    habilitar_igv: z.boolean().default(true),
    habilitar_isc: z.boolean().default(false),
    habilitar_percepcion: z.boolean().default(true),
    ad_valorem_tasa_manual: z.number().min(0).max(1).optional(),
    isc_tasa_ingresada: z.number().min(0).max(1).optional(),
    percepcion_tasa_ingresada: z.number().min(0).max(1).optional(),
    antidumping_ingresado: z.number().nonnegative().default(0),
    compensatorio_ingresado: z.number().nonnegative().default(0),
    sda_ingresado: z.number().nonnegative().default(0),
    fecha_operacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).superRefine((data, ctx) => {
    // Subpartida es obligatoria solo para importaciones (no compras nacionales)
    if (!data.es_compra_nacional) {
        if (!data.subpartida_hs10 || data.subpartida_hs10.length !== 10) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'La subpartida es obligatoria para importaciones (10 dígitos)',
                path: ['subpartida_hs10'],
            });
        }
    }
});

export const updateImportacionSchema = z.object({
    caso_estudio_id: z.number().int().positive().optional(),
    es_compra_nacional: z.boolean().optional(),
    tipo_mercancia_id: z.number().int().positive().optional(),
    subpartida_hs10: z.string().length(10, 'La subpartida debe tener 10 dígitos').optional(),
    descripcion_mercancia: z.string().min(3, 'La descripción debe tener al menos 3 caracteres').optional(),
    moneda: z.enum(['USD', 'PEN']).optional(),
    valor_fob: z.number().nonnegative('El monto no puede ser negativo').optional(),
    valor_flete: z.number().nonnegative().optional(),
    valor_seguro: z.number().nonnegative().optional(),
    habilitar_igv: z.boolean().optional(),
    habilitar_isc: z.boolean().optional(),
    habilitar_percepcion: z.boolean().optional(),
    ad_valorem_tasa_manual: z.number().min(0).max(1).optional(),
    isc_tasa_ingresada: z.number().min(0).max(1).optional(),
    percepcion_tasa_ingresada: z.number().min(0).max(1).optional(),
    antidumping_ingresado: z.number().nonnegative().optional(),
    compensatorio_ingresado: z.number().nonnegative().optional(),
    sda_ingresado: z.number().nonnegative().optional(),
    fecha_operacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
