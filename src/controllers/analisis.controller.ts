// controllers/analisis.controller.ts

import { Request, Response } from 'express';
import { AnalisisService } from '../services/analisis.service';
import { 
  obtenerAnalisisSchema, 
  analisisQuerySchema,
  analisisComparativoSchema 
} from '../validators/analisis.validators';

export class AnalisisController {

static async obtenerAnalisisCompleto(req: Request, res: Response): Promise<void> {
  console.log('🚀 ENTRANDO AL CONTROLADOR');
  console.log('Usuario completo:', (req as any).user);
  console.log('Params:', req.params);
  console.log('Query:', req.query);
  
  try {
    // Validar parámetros
    const { caso_id } = obtenerAnalisisSchema.parse(req.params);
    console.log('✅ Parámetros validados:', { caso_id });
    
    const queryParams = analisisQuerySchema.parse(req.query);
    console.log('✅ Query validado:', queryParams);
    
    // Obtener user_id del middleware de autenticación
    const userId = (req as any).user?.sub; 
    console.log('👤 userId extraído:', userId);
    
    if (!userId) {
      console.log('❌ No hay userId');
      res.status(401).json({
        success: false,
        message: 'No autorizado. Token requerido.'
      });
      return;
    }

    console.log('📊 Llamando a AnalisisService...');
    const analysis = await AnalisisService.obtenerAnalisisRentabilidad(
      caso_id,
      userId,
      queryParams.incluir_detalles
    );
    console.log('✅ Análisis obtenido exitosamente');

    res.status(200).json({
      success: true,
      message: 'Análisis de rentabilidad obtenido exitosamente',
      data: analysis,
      metadata: {
        caso_id,
        incluye_detalles: queryParams.incluir_detalles,
        moneda_base: queryParams.moneda_base,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ ERROR COMPLETO:', error);
    console.error('❌ ERROR MESSAGE:', error.message);
    console.error('❌ ERROR STACK:', error.stack);
    
    // ... resto del manejo de errores
  }
}

  static async obtenerRatiosRentabilidad(req: Request, res: Response): Promise<void> {
    try {
      const { caso_id } = obtenerAnalisisSchema.parse(req.params);
      const userId = (req as any).user?.sub;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'No autorizado. Token requerido.'
        });
        return;
      }

      // Obtener análisis sin detalles
      const analysis = await AnalisisService.obtenerAnalisisRentabilidad(
        caso_id,
        userId,
        false
      );

      // Extraer solo los ratios
      const ratios = {
        caso_estudio_id: analysis.caso_estudio_id,
        nombre_caso: analysis.nombre_caso,
        ratios: {
          margen_bruto: analysis.utilidad_bruta.margen_bruto_porcentaje,
          margen_operativo: analysis.utilidad_operativa.margen_operativo_porcentaje,
          margen_neto: analysis.utilidad_neta.margen_neto_porcentaje
        },
        utilidades: {
          bruta: analysis.utilidad_bruta.utilidad_bruta,
          operativa: analysis.utilidad_operativa.utilidad_operativa,
          neta: analysis.utilidad_neta.utilidad_neta
        },
        resumen_monedas: analysis.resumen_monedas
      };

      res.status(200).json({
        success: true,
        message: 'Ratios de rentabilidad obtenidos exitosamente',
        data: ratios
      });

    } catch (error: any) {
      console.error('Error en obtenerRatiosRentabilidad:', error);
      
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: error.errors
        });
        return;
      }

      if (error.message === 'Caso de estudio no encontrado o no autorizado') {
        res.status(404).json({
          success: false,
          message: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  static async obtenerResumenOperacional(req: Request, res: Response): Promise<void> {
    try {
      const { caso_id } = obtenerAnalisisSchema.parse(req.params);
      const userId = (req as any).user?.sub;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'No autorizado. Token requerido.'
        });
        return;
      }

      const analysis = await AnalisisService.obtenerAnalisisRentabilidad(
        caso_id,
        userId,
        true
      );

      // Crear resumen operacional
      const summary = {
        caso_estudio_id: analysis.caso_estudio_id,
        nombre_caso: analysis.nombre_caso,
        resumen_operaciones: {
          importaciones: {
            cantidad: analysis.detalles.importaciones.length,
            valor_total_cif: analysis.detalles.importaciones.reduce((sum, imp) => sum + imp.valor_cif, 0),
            tributos_totales: analysis.detalles.importaciones.reduce((sum, imp) => sum + imp.dta_total, 0)
          },
          exportaciones: {
            cantidad: analysis.detalles.exportaciones.length,
            valor_total_ventas: analysis.detalles.exportaciones.reduce((sum, exp) => {
              return sum + (exp.moneda === 'USD' ? exp.valor_venta : exp.valor_venta / 3.75);
            }, 0),
            ventas_nacionales: analysis.detalles.exportaciones.filter(exp => exp.es_venta_nacional).length,
            exportaciones_internacionales: analysis.detalles.exportaciones.filter(exp => !exp.es_venta_nacional).length
          },
          gastos: {
            total_operativos: analysis.detalles.gastos.operativos.length,
            total_administrativos: analysis.detalles.gastos.administrativos.length,
            total_ventas: analysis.detalles.gastos.ventas.length,
            total_financieros: analysis.detalles.gastos.financieros.length
          }
        },
        indicadores_clave: {
          eficiencia_importacion: analysis.utilidad_bruta.costo_adquisicion > 0 
            ? (analysis.utilidad_bruta.utilidad_bruta / analysis.utilidad_bruta.costo_adquisicion * 100).toFixed(2)
            : '0.00',
          productividad_ventas: analysis.utilidad_bruta.ventas_totales > 0
            ? (analysis.utilidad_neta.utilidad_neta / analysis.utilidad_bruta.ventas_totales * 100).toFixed(2)
            : '0.00'
        }
      };

      res.status(200).json({
        success: true,
        message: 'Resumen operacional obtenido exitosamente',
        data: summary
      });

    } catch (error: any) {
      console.error('Error en obtenerResumenOperacional:', error);
      
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: error.errors
        });
        return;
      }

      if (error.message === 'Caso de estudio no encontrado o no autorizado') {
        res.status(404).json({
          success: false,
          message: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  static async obtenerAnalisisComparativo(req: Request, res: Response): Promise<void> {
    try {
      const queryParams = analisisComparativoSchema.parse(req.query);
      const userId = (req as any).user?.sub;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'No autorizado. Token requerido.'
        });
        return;
      }

      const comparativeData = await AnalisisService.obtenerComparativo(
        userId, 
        queryParams.limite
      );

      res.status(200).json({
        success: true,
        message: 'Análisis comparativo obtenido exitosamente',
        data: comparativeData
      });

    } catch (error: any) {
      console.error('Error en obtenerAnalisisComparativo:', error);
      
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}