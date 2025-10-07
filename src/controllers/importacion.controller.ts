import { Request, Response } from 'express';
import { ImportacionService } from '../services/importacion.service';
import { createImportacionSchema, updateImportacionSchema } from '../validators/importacion.validator';
import { JwtUser } from '../types/importacion.types';

export class ImportacionController {

    /**
     * GET /api/importaciones
     * Lista todas las importaciones activas del usuario
     */
    static async listarImportaciones(req: Request, res: Response) {
        const user = (req as any).user as JwtUser;
        const caso_estudio_id = req.query.caso_estudio_id ? Number(req.query.caso_estudio_id) : undefined;

        try {
            const importaciones = await ImportacionService.listarImportaciones(user.sub, caso_estudio_id);
            res.json(importaciones);
        } catch (error) {
            console.error('Error al obtener importaciones:', error);
            res.status(500).json({ message: 'Error al obtener las importaciones' });
        }
    }

    /**
     * POST /api/importaciones
     * Crea una nueva importación
     */
    static async crearImportacion(req: Request, res: Response) {
        const parsed = createImportacionSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: 'Datos inválidos',
                errors: parsed.error.issues
            });
        }

        const user = (req as any).user as JwtUser;
        const data = parsed.data;

        try {
            // Verificar que el caso de estudio pertenece al usuario y está activo
            const casoValido = await ImportacionService.verificarCasoEstudioUsuario(data.caso_estudio_id, user.sub);
            if (!casoValido) {
                return res.status(404).json({ message: 'Caso de estudio no encontrado o no autorizado' });
            }

            const result = await ImportacionService.crearImportacion(user.sub, data);

            res.status(201).json({
                ...result.importacion,
                tributos: result.tributos
            });

        } catch (error) {
            console.error('Error al crear importación:', error);
            res.status(500).json({ message: 'Error al crear la importación' });
        }
    }

    /**
     * GET /api/importaciones/:id
     * Obtiene una importación específica
     */
    static async obtenerImportacion(req: Request, res: Response) {
        const { id } = req.params;
        const numericId = parseInt(id, 10);

        if (isNaN(numericId)) {
            return res.status(400).json({ message: 'El ID proporcionado no es válido' });
        }

        const user = (req as any).user as JwtUser;

        try {
            const importacion = await ImportacionService.obtenerImportacion(numericId, user.sub);

            if (!importacion) {
                return res.status(404).json({ message: 'Importación no encontrada o no autorizada' });
            }

            res.json({
                ...importacion.importacion,
                tributos: importacion.tributos
            });
        } catch (error) {
            console.error('Error al obtener importación:', error);
            res.status(500).json({ message: 'Error al obtener la importación' });
        }
    }

    /**
     * PUT /api/importaciones/:id
     * Actualiza una importación existente y recalcula los tributos
     */
    static async actualizarImportacion(req: Request, res: Response) {
        const { id } = req.params;
        const numericId = parseInt(id, 10);

        if (isNaN(numericId)) {
            return res.status(400).json({ message: 'El ID proporcionado no es válido' });
        }

        const parsed = updateImportacionSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: 'Datos inválidos',
                errors: parsed.error.issues
            });
        }

        const user = (req as any).user as JwtUser;
        const data = parsed.data;

        try {
            // Si se cambia el caso de estudio, verificar que el nuevo caso pertenezca al usuario
            if (data.caso_estudio_id) {
                const casoValido = await ImportacionService.verificarCasoEstudioUsuario(data.caso_estudio_id, user.sub);
                if (!casoValido) {
                    return res.status(404).json({ message: 'Caso de estudio no encontrado o no autorizado' });
                }
            }

            const result = await ImportacionService.actualizarImportacion(numericId, user.sub, data);

            if (!result) {
                return res.status(404).json({ message: 'Importación no encontrada o no autorizada' });
            }

            res.json({
                ...result.importacion,
                tributos: result.tributos
            });

        } catch (error) {
            console.error('Error al actualizar importación:', error);
            res.status(500).json({ message: 'Error al actualizar la importación' });
        }
    }

    /**
     * DELETE /api/importaciones/:id
     * Elimina una importación (soft delete: activo = 0)
     */
    static async eliminarImportacion(req: Request, res: Response) {
        const { id } = req.params;
        const numericId = parseInt(id, 10);

        if (isNaN(numericId)) {
            return res.status(400).json({ message: 'El ID proporcionado no es válido' });
        }

        const user = (req as any).user as JwtUser;

        try {
            const eliminada = await ImportacionService.eliminarImportacion(numericId, user.sub);

            if (!eliminada) {
                return res.status(404).json({ message: 'Importación no encontrada o no autorizada' });
            }

            res.status(204).send();

        } catch (error) {
            console.error('Error al eliminar importación:', error);
            res.status(500).json({ message: 'Error al eliminar la importación' });
        }
    }
}