// exportacion.controller.ts
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

            const casoValido = await ExportacionService.verificarCasoEstudioUsuario(data.caso_estudio_id, user.sub);
            if (!casoValido) {
                return res.status(404).json({ message: 'El caso de estudio no existe o no te pertenece.' });
            }

            // ACTUALIZADO: Ahora retorna { exportacion, asiento }
            const { exportacion, asiento } = await ExportacionService.crear(user.sub, data);

            res.status(201).json({
                message: 'Exportación creada exitosamente',
                data: {
                    exportacion,
                    asiento_contable: asiento
                },
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

            const validationResult = actualizarExportacionSchema.safeParse(req.body);

            if (!validationResult.success) {
                return res.status(400).json({
                    message: 'Datos inválidos',
                    errors: validationResult.error.flatten().fieldErrors
                });
            }

            const data = validationResult.data;

            if (data.caso_estudio_id) {
                const casoValido = await ExportacionService.verificarCasoEstudioUsuario(data.caso_estudio_id, user.sub);
                if (!casoValido) {
                    return res.status(404).json({
                        message: 'El caso de estudio no existe o no te pertenece.',
                        success: false
                    });
                }
            }

            // ACTUALIZADO: Ahora retorna { exportacion, asiento }
            const resultado = await ExportacionService.actualizar(id, user.sub, data);

            if (!resultado) {
                return res.status(404).json({
                    message: 'Exportación no encontrada o no tienes permisos para editarla.',
                    success: false
                });
            }

            res.status(200).json({
                message: 'Exportación actualizada exitosamente',
                data: {
                    exportacion: resultado.exportacion,
                    asiento_contable: resultado.asiento
                },
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

    // ====== NUEVO: Listar tipos de producto ======
    static async listarTiposProducto(req: Request, res: Response) {
        try {
            const tipos = await ExportacionService.listarTiposProducto();
            res.status(200).json({
                data: tipos,
                success: true
            });
        } catch (error: any) {
            console.error("Error al listar tipos de producto:", error);
            res.status(500).json({
                message: 'Error interno del servidor',
                success: false
            });
        }
    }

    // ====== ACTUALIZADO: Generar asiento contable (ya no genera, solo lo trae) ======
    static async obtenerAsientoContable(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const id = parseInt(req.params.id, 10);

            if (isNaN(id)) {
                return res.status(400).json({
                    message: 'ID inválido',
                    success: false
                });
            }

            const asiento = await ExportacionService.obtenerAsientoContable(id, user.sub);

            if (!asiento) {
                return res.status(404).json({
                    message: 'Asiento contable no encontrado',
                    success: false
                });
            }

            res.status(200).json({
                data: asiento,
                success: true
            });

        } catch (error: any) {
            console.error("Error al obtener asiento contable:", error);
            res.status(500).json({
                message: 'Error interno del servidor',
                success: false
            });
        }
    }

    // ====== NUEVO: Regenerar asiento contable manualmente (opcional) ======
    static async regenerarAsientoContable(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const id = parseInt(req.params.id, 10);

            if (isNaN(id)) {
                return res.status(400).json({
                    message: 'ID inválido',
                    success: false
                });
            }

            const asiento = await ExportacionService.generarYGuardarAsientoContable(id, user.sub);

            res.status(200).json({
                message: 'Asiento contable regenerado exitosamente',
                data: asiento,
                success: true
            });

        } catch (error: any) {
            console.error("Error al regenerar asiento contable:", error);
            if (error.message === 'Exportación no encontrada') {
                return res.status(404).json({
                    message: error.message,
                    success: false
                });
            }
            res.status(500).json({
                message: 'Error interno del servidor',
                success: false
            });
        }
    }

    // ====== NUEVO: Listar todos los asientos de un caso de estudio ======
    static async listarAsientosPorCaso(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const casoEstudioId = parseInt(req.query.caso_estudio_id as string, 10);

            if (isNaN(casoEstudioId)) {
                return res.status(400).json({
                    message: 'ID de caso de estudio inválido',
                    success: false
                });
            }

            const asientos = await ExportacionService.listarAsientosPorCaso(casoEstudioId, user.sub);

            res.status(200).json({
                data: asientos,
                success: true,
                count: asientos.length
            });

        } catch (error: any) {
            console.error("Error al listar asientos:", error);
            res.status(500).json({
                message: 'Error interno del servidor',
                success: false
            });
        }
    }
}