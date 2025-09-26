import { Request, Response } from 'express';
import { crearExportacionSchema } from '../validators/exportacion.validators';
import { ExportacionService } from '../services/exportacion.service';
import { ImportacionService } from '../services/importacion.service';
// Importamos el tipo JwtUser desde donde lo tienes definido
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
      
      // --- CORRECCIÓN ---
      // Usamos el mismo método que en tu ImportacionController para obtener el usuario
      const user = (req as any).user as JwtUser;
      const data = validationResult.data;

      // Verificamos que el caso de estudio le pertenece al usuario
      const casoValido = await ImportacionService.verificarCasoEstudioUsuario(data.caso_estudio_id, user.sub);
      if (!casoValido) {
        return res.status(404).json({ message: 'El caso de estudio no existe o no te pertenece.' });
      }

      const nuevaExportacion = await ExportacionService.crear(user.sub, data);
      res.status(201).json(nuevaExportacion);

    } catch (error: any) {
      console.error("Error al crear exportación:", error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }

  static async listarExportaciones(req: Request, res: Response) {
    try {
      // --- CORRECCIÓN ---
      const user = (req as any).user as JwtUser;
      const casoEstudioId = req.query.caso_estudio_id ? parseInt(req.query.caso_estudio_id as string, 10) : undefined;

      const exportaciones = await ExportacionService.listar(user.sub, casoEstudioId);
      res.status(200).json(exportaciones);

    } catch (error: any) {
      console.error("Error al listar exportaciones:", error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }
  
  static async obtenerExportacionPorId(req: Request, res: Response) {
    try {
      // --- CORRECCIÓN ---
      const user = (req as any).user as JwtUser;
      const id = parseInt(req.params.id, 10);

      const exportacion = await ExportacionService.obtenerPorId(id, user.sub);
      if (!exportacion) {
        return res.status(404).json({ message: 'Exportación no encontrada.' });
      }
      res.status(200).json(exportacion);

    } catch (error: any) {
      console.error("Error al obtener exportación:", error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }
}