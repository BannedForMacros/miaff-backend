import { Request, Response } from 'express';
import { GastoService } from '../services/gastos.service';
import { crearGastoSchema } from '../validators/gastos.validators';
import { ImportacionService } from '../services/importacion.service';
import { JwtUser } from '../types/gastos.types';
// Update this import to match the actual export from '../types/gastos.types'
// If 'JwtUser' is not exported, replace with the correct type or remove this line.

export class GastoController {
  
  static async listarClasificaciones(req: Request, res: Response) {
    try {
      const clasificaciones = await GastoService.listarClasificaciones();
      res.status(200).json(clasificaciones);
    } catch (error) {
      console.error('Error al listar clasificaciones de gastos:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }

  static async crearGasto(req: Request, res: Response) {
    const user = (req as any).user as JwtUser;
    const validation = crearGastoSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.flatten().fieldErrors });
    }
    
    try {
      const data = validation.data;
      const casoValido = await ImportacionService.verificarCasoEstudioUsuario(data.caso_estudio_id, user.sub);
      if (!casoValido) {
        return res.status(404).json({ message: 'El caso de estudio no existe o no te pertenece.' });
      }

      const nuevoGasto = await GastoService.crear(user.sub, data);
      res.status(201).json(nuevoGasto);
    } catch (error) {
      console.error('Error al crear gasto:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }

  static async listarGastos(req: Request, res: Response) {
    const user = (req as any).user as JwtUser;
    const casoEstudioId = parseInt(req.query.caso_estudio_id as string, 10);
    if (isNaN(casoEstudioId)) {
      return res.status(400).json({ message: 'El ID del caso de estudio es requerido en la consulta.' });
    }
    try {
      const gastos = await GastoService.listarPorCaso(user.sub, casoEstudioId);
      res.status(200).json(gastos);
    } catch (error) {
      console.error('Error al listar gastos:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }

  static async eliminarGasto(req: Request, res: Response) {
    const user = (req as any).user as JwtUser;
    const gastoId = parseInt(req.params.id, 10);
    if (isNaN(gastoId)) {
      return res.status(400).json({ message: 'El ID del gasto es inválido.' });
    }
    try {
      const eliminado = await GastoService.eliminar(gastoId, user.sub);
      if (eliminado) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: 'Gasto no encontrado o no te pertenece.' });
      }
    } catch (error) {
      console.error('Error al eliminar gasto:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }
}