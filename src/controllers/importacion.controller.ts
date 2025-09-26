import { Request, Response } from 'express';
import { ImportacionService } from '../services/importacion.service';
import { createImportacionSchema } from '../validators/importacion.validator';
import { JwtUser } from '../types/importacion.types';

export class ImportacionController {
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
      // Verificar que el caso de estudio pertenece al usuario
      const casoValido = await ImportacionService.verificarCasoEstudioUsuario(data.caso_estudio_id, user.sub);
      if (!casoValido) {
        return res.status(404).json({ message: 'Caso de estudio no encontrado' });
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

  static async obtenerImportacion(req: Request, res: Response) {
    const { id } = req.params;
    const user = (req as any).user as JwtUser;

    try {
      const importacion = await ImportacionService.obtenerImportacion(id, user.sub);

      if (!importacion) {
        return res.status(404).json({ message: 'Importación no encontrada' });
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
}