// En Exportacion.controller.ts
import { Request, Response } from 'express';
import { crearExportacionSchema, actualizarExportacionSchema } from '../validators/exportacion.validators';
import { ExportacionService } from '../services/exportacion.service';
import { JwtUser } from '../types/importacion.types';

export class ExportacionController {

    static async crearExportacion(req: Request, res: Response) {
        try {
            const validationResult = crearExportacionSchema.safeParse(req.body);

            if (!validationResult.success) {
                return res.status(400).json({
                    message: 'Datos inválidos',
                    errors: validationResult.error.flatten().fieldErrors
                });
            }

            const user = (req as any).user as JwtUser;
            const data = validationResult.data;

            // Verificamos que el caso de estudio le pertenece al usuario
            const casoValido = await ExportacionService.verificarCasoEstudioUsuario(data.caso_estudio_id, user.sub);
            if (!casoValido) {
                return res.status(404).json({ message: 'El caso de estudio no existe o no te pertenece.' });
            }

            const nuevaExportacion = await ExportacionService.crear(user.sub, data);

            // Respuesta mejorada con mensaje de éxito
            res.status(201).json({
                message: 'Exportación creada exitosamente',
                data: nuevaExportacion,
                success: true
            });

        } catch (error: any) {
            console.error("Error al crear exportación:", error);
            res.status(500).json({
                message: 'Error interno del servidor',
                success: false
            });
        }
    }

    static async listarExportaciones(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const casoEstudioId = req.query.caso_estudio_id ? parseInt(req.query.caso_estudio_id as string, 10) : undefined;

            const exportaciones = await ExportacionService.listar(user.sub, casoEstudioId);

            res.status(200).json({
                data: exportaciones,
                success: true,
                count: exportaciones.length
            });

        } catch (error: any) {
            console.error("Error al listar exportaciones:", error);
            res.status(500).json({
                message: 'Error interno del servidor',
                success: false
            });
        }
    }

    static async obtenerExportacionPorId(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const id = parseInt(req.params.id, 10);

            if (isNaN(id)) {
                return res.status(400).json({
                    message: 'ID inválido',
                    success: false
                });
            }

            const exportacion = await ExportacionService.obtenerPorId(id, user.sub);
            if (!exportacion) {
                return res.status(404).json({
                    message: 'Exportación no encontrada.',
                    success: false
                });
            }

            res.status(200).json({
                data: exportacion,
                success: true
            });

        } catch (error: any) {
            console.error("Error al obtener exportación:", error);
            res.status(500).json({
                message: 'Error interno del servidor',
                success: false
            });
        }
    }

    static async actualizarExportacion(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const id = parseInt(req.params.id, 10);

            if (isNaN(id)) {
                return res.status(400).json({
                    message: 'ID inválido',
                    success: false
                });
            }

            const validationResult = crearExportacionSchema.partial().safeParse(req.body);

            if (!validationResult.success) {
                return res.status(400).json({
                    message: 'Datos inválidos',
                    errors: validationResult.error.flatten().fieldErrors
                });
            }

            const data = validationResult.data;

            // Si se está actualizando el caso_estudio_id, verificar que existe
            if (data.caso_estudio_id) {
                const casoValido = await ExportacionService.verificarCasoEstudioUsuario(data.caso_estudio_id, user.sub);
                if (!casoValido) {
                    return res.status(404).json({
                        message: 'El caso de estudio no existe o no te pertenece.',
                        success: false
                    });
                }
            }

            const exportacionActualizada = await ExportacionService.actualizar(id, user.sub, data);

            if (!exportacionActualizada) {
                return res.status(404).json({
                    message: 'Exportación no encontrada o no tienes permisos para editarla.',
                    success: false
                });
            }

            res.status(200).json({
                message: 'Exportación actualizada exitosamente',
                data: exportacionActualizada,
                success: true
            });

        } catch (error: any) {
            console.error("Error al actualizar exportación:", error);
            res.status(500).json({
                message: 'Error interno del servidor',
                success: false
            });
        }
    }

    static async eliminarExportacion(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const id = parseInt(req.params.id, 10);

            if (isNaN(id)) {
                return res.status(400).json({
                    message: 'ID inválido',
                    success: false
                });
            }

            const eliminado = await ExportacionService.eliminar(id, user.sub);

            if (!eliminado) {
                return res.status(404).json({
                    message: 'Exportación no encontrada o no tienes permisos para eliminarla.',
                    success: false
                });
            }

            res.status(200).json({
                message: 'Exportación eliminada exitosamente',
                success: true
            });

        } catch (error: any) {
            console.error("Error al eliminar exportación:", error);
            res.status(500).json({
                message: 'Error interno del servidor',
                success: false
            });
        }
    }
}