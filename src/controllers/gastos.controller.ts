// controllers/gastos.controller.ts
import { Request, Response } from 'express';
import { GastoService } from '../services/gastos.service';
import { 
  crearGastoSchema, 
  datosFinancierosSchema,
  actualizarGastoSchema,
} from '../validators/gastos.validators';
import { ImportacionService } from '../services/importacion.service';
import { JwtUser } from '../types/gastos.types';

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
      return res.status(400).json({ 
        message: 'Datos inválidos', 
        errors: validation.error.flatten().fieldErrors 
      });
    }
    
    try {
      const data = validation.data;
      const casoValido = await ImportacionService.verificarCasoEstudioUsuario(
        data.caso_estudio_id, 
        user.sub
      );
      
      if (!casoValido) {
        return res.status(404).json({ 
          message: 'El caso de estudio no existe o no te pertenece.' 
        });
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
      return res.status(400).json({ 
        message: 'El ID del caso de estudio es requerido en la consulta.' 
      });
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
        res.status(404).json({ 
          message: 'Gasto no encontrado o no te pertenece.' 
        });
      }
    } catch (error) {
      console.error('Error al eliminar gasto:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }
    static async actualizarGasto(req: Request, res: Response) {
        const user = (req as any).user as JwtUser;
        const gastoId = parseInt(req.params.id, 10);

        if (isNaN(gastoId)) {
            return res.status(400).json({ message: 'El ID del gasto es inválido.' });
        }

        const validation = actualizarGastoSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                message: 'Datos inválidos',
                errors: validation.error.flatten().fieldErrors
            });
        }

        // Evitar peticiones con cuerpo vacío
        if (Object.keys(validation.data).length === 0) {
            return res.status(400).json({
                message: 'No se enviaron campos para actualizar.'
            });
        }

        try {
            const gastoActualizado = await GastoService.actualizar(
                gastoId,
                user.sub,
                validation.data
            );

            if (gastoActualizado) {
                res.status(200).json(gastoActualizado);
            } else {
                res.status(404).json({
                    message: 'Gasto no encontrado o no te pertenece.'
                });
            }
        } catch (error) {
            console.error('Error al actualizar gasto:', error);
            res.status(500).json({ message: 'Error interno del servidor' });
        }
    }

    static async calcularRatios(req: Request, res: Response) {
        const user = (req as any).user as JwtUser;
        const casoEstudioId = parseInt(req.query.caso_estudio_id as string, 10);

        if (isNaN(casoEstudioId)) {
            return res.status(400).json({
                message: 'El ID del caso de estudio es requerido.'
            });
        }

        try {
            const ratios = await GastoService.calcularRatiosFinancieros(
                user.sub,
                casoEstudioId
            );

            if (ratios) {
                res.status(200).json(ratios);
            } else {
                res.status(404).json({
                    message: 'No se pudieron calcular los ratios. Asegúrate de haber guardado los Datos Financieros (Activos y Patrimonio).'
                });
            }
        } catch (error) {
            console.error('Error al calcular ratios financieros:', error);
            res.status(500).json({ message: 'Error interno del servidor' });
        }
    }

  static async calcularTributos(req: Request, res: Response) {
    const user = (req as any).user as JwtUser;
    const casoEstudioId = parseInt(req.query.caso_estudio_id as string, 10);
    
    if (isNaN(casoEstudioId)) {
      return res.status(400).json({ 
        message: 'El ID del caso de estudio es requerido.' 
      });
    }
    
    try {
      const tributos = await GastoService.calcularTributosGastos(
        user.sub, 
        casoEstudioId
      );
      res.status(200).json(tributos);
    } catch (error) {
      console.error('Error al calcular tributos:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }

  static async generarAsientoContable(req: Request, res: Response) {
    const user = (req as any).user as JwtUser;
    const casoEstudioId = parseInt(req.query.caso_estudio_id as string, 10);
    
    if (isNaN(casoEstudioId)) {
      return res.status(400).json({ 
        message: 'El ID del caso de estudio es requerido.' 
      });
    }
    
    try {
      const asiento = await GastoService.generarAsientoContable(
        user.sub, 
        casoEstudioId
      );
      res.status(200).json(asiento);
    } catch (error) {
      console.error('Error al generar asiento contable:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }

  static async obtenerResumenPorTipo(req: Request, res: Response) {
    const user = (req as any).user as JwtUser;
    const casoEstudioId = parseInt(req.query.caso_estudio_id as string, 10);
    
    if (isNaN(casoEstudioId)) {
      return res.status(400).json({ 
        message: 'El ID del caso de estudio es requerido.' 
      });
    }
    
    try {
      const resumen = await GastoService.obtenerResumenPorTipo(
        user.sub, 
        casoEstudioId
      );
      res.status(200).json(resumen);
    } catch (error) {
      console.error('Error al obtener resumen por tipo:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }

  // ===== NUEVOS MÉTODOS PARA DATOS FINANCIEROS =====

  static async guardarDatosFinancieros(req: Request, res: Response) {
    const user = (req as any).user as JwtUser;
    const validation = datosFinancierosSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        message: 'Datos inválidos', 
        errors: validation.error.flatten().fieldErrors 
      });
    }
    
    try {
      const datos = await GastoService.guardarDatosFinancieros(user.sub, validation.data);
      res.status(200).json(datos);
    } catch (error) {
      console.error('Error al guardar datos financieros:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }

  static async obtenerDatosFinancieros(req: Request, res: Response) {
    const user = (req as any).user as JwtUser;
    const casoEstudioId = parseInt(req.query.caso_estudio_id as string, 10);
    
    if (isNaN(casoEstudioId)) {
      return res.status(400).json({ 
        message: 'El ID del caso de estudio es requerido.' 
      });
    }
    
    try {
      const datos = await GastoService.obtenerDatosFinancieros(user.sub, casoEstudioId);
      if (datos) {
        res.status(200).json(datos);
      } else {
        res.status(404).json({ 
          message: 'No se han ingresado datos financieros para este caso de estudio.' 
        });
      }
    } catch (error) {
      console.error('Error al obtener datos financieros:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }
}