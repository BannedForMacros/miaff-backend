import { z } from 'zod';

export const createImportacionSchema = z.object({
    caso_estudio_id: z.number({ required_error: 'El caso de estudio es obligatorio' }).int().positive(),
    tipo_mercancia_id: z.number({ required_error: 'El tipo de mercancía es obligatorio' }).int().positive(), // NUEVO
    subpartida_hs10: z.string({ required_error: 'La subpartida es obligatoria' }).length(10, 'La subpartida debe tener 10 dígitos'),
    descripcion_mercancia: z.string({ required_error: 'La descripción es obligatoria' }).min(3, 'La descripción debe tener al menos 3 caracteres'),
    moneda: z.enum(['USD', 'PEN'], { required_error: 'La moneda debe ser USD o PEN' }),
    valor_fob: z.number({ required_error: 'El valor FOB es obligatorio' }).nonnegative('El valor FOB no puede ser negativo'),
    valor_flete: z.number({ required_error: 'El valor del flete es obligatorio' }).nonnegative('El flete no puede ser negativo'),
    valor_seguro: z.number({ required_error: 'El valor del seguro es obligatorio' }).nonnegative('El seguro no puede ser negativo'),
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
});

export const updateImportacionSchema = z.object({
    caso_estudio_id: z.number().int().positive().optional(),
    tipo_mercancia_id: z.number().int().positive().optional(), // NUEVO
    subpartida_hs10: z.string().length(10, 'La subpartida debe tener 10 dígitos').optional(),
    descripcion_mercancia: z.string().min(3, 'La descripción debe tener al menos 3 caracteres').optional(),
    moneda: z.enum(['USD', 'PEN']).optional(),
    valor_fob: z.number().nonnegative('El valor FOB no puede ser negativo').optional(),
    valor_flete: z.number().nonnegative('El flete no puede ser negativo').optional(),
    valor_seguro: z.number().nonnegative('El seguro no puede ser negativo').optional(),
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