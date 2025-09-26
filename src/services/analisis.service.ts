// services/analisis.service.ts

import { dbQuery } from '../db';
import {
  RentabilityAnalysis,
  ImportacionDetalle,
  ExportacionDetalle,
  GastoDetalle,
  GastosPorClasificacion,
  UtilidadBruta,
  UtilidadOperativa,
  UtilidadNeta
} from '../types/analisis.types';

export class AnalisisService {

  static async validarCasoExiste(casoId: number, userId: string): Promise<boolean> {
    const sql = `
      SELECT id FROM miaff.casos_de_estudio 
      WHERE id = $1 AND user_id = $2
    `;
    
    const { rows } = await dbQuery(sql, [casoId, userId]);
    return rows.length > 0;
  }

  static async obtenerAnalisisRentabilidad(
    casoId: number, 
    userId: string, 
    incluirDetalles = true
  ): Promise<RentabilityAnalysis> {
    
    // Validar que el caso existe
    const casoExists = await this.validarCasoExiste(casoId, userId);
    if (!casoExists) {
      throw new Error('Caso de estudio no encontrado o no autorizado');
    }

    // Obtener información del caso
    const casoInfo = await this.obtenerInfoCaso(casoId);
    
    // Obtener datos para cálculos
    const importaciones = await this.obtenerImportaciones(casoId);
    const exportaciones = await this.obtenerExportaciones(casoId);
    const gastos = await this.obtenerGastosPorClasificacion(casoId);

    // Calcular utilidades
    const utilidadBruta = this.calcularUtilidadBruta(exportaciones, importaciones);
    const utilidadOperativa = this.calcularUtilidadOperativa(utilidadBruta, gastos.operativos);
    const utilidadNeta = this.calcularUtilidadNeta(utilidadOperativa, gastos);

    // Calcular resumen por monedas
    const resumenMonedas = this.calcularResumenMonedas(importaciones, exportaciones, gastos);

    const result: RentabilityAnalysis = {
      caso_estudio_id: casoId,
      nombre_caso: casoInfo.nombre_caso,
      utilidad_bruta: utilidadBruta,
      utilidad_operativa: utilidadOperativa,
      utilidad_neta: utilidadNeta,
      detalles: {
        importaciones: incluirDetalles ? importaciones : [],
        exportaciones: incluirDetalles ? exportaciones : [],
        gastos: incluirDetalles ? gastos : {
          operativos: [],
          administrativos: [],
          ventas: [],
          financieros: []
        }
      },
      resumen_monedas: resumenMonedas
    };

    return result;
  }

  private static async obtenerInfoCaso(casoId: number) {
    const sql = `
      SELECT nombre_caso, descripcion, estado, created_at
      FROM miaff.casos_de_estudio 
      WHERE id = $1
    `;
    
    const { rows } = await dbQuery(sql, [casoId]);
    return rows[0];
  }

  private static async obtenerImportaciones(casoId: number): Promise<ImportacionDetalle[]> {
    const sql = `
      SELECT 
        i.id,
        i.subpartida_hs10,
        i.descripcion_mercancia,
        i.valor_fob,
        i.valor_flete,
        i.valor_seguro,
        i.valor_cif,
        i.monto_ad_valorem,
        i.monto_isc,
        i.monto_igv,
        i.monto_ipm,
        i.monto_percepcion,
        i.dta_total,
        i.fecha_operacion
      FROM miaff.importaciones i
      WHERE i.caso_estudio_id = $1
      ORDER BY i.fecha_operacion DESC, i.id DESC
    `;

    const { rows } = await dbQuery(sql, [casoId]);
    const importaciones = rows;

    // Obtener tributos para cada importación
    for (const importacion of importaciones) {
      importacion.tributos = await this.obtenerTributosImportacion(importacion.id);
    }

    return importaciones;
  }

  private static async obtenerTributosImportacion(importacionId: number) {
    const sql = `
      SELECT 
        id,
        concepto,
        base_imponible,
        tasa_aplicada,
        monto_calculado
      FROM miaff.importacion_tributos
      WHERE importacion_id = $1
      ORDER BY concepto
    `;

    const { rows } = await dbQuery(sql, [importacionId]);
    return rows;
  }

  private static async obtenerExportaciones(casoId: number): Promise<ExportacionDetalle[]> {
    const sql = `
      SELECT 
        id,
        es_venta_nacional,
        incoterm,
        descripcion_venta,
        valor_venta,
        moneda,
        fecha_operacion,
        pais_origen,
        pais_destino
      FROM miaff.exportaciones
      WHERE caso_estudio_id = $1
      ORDER BY fecha_operacion DESC, id DESC
    `;

    const { rows } = await dbQuery(sql, [casoId]);
    return rows;
  }

  private static async obtenerGastosPorClasificacion(casoId: number): Promise<GastosPorClasificacion> {
    const sql = `
      SELECT 
        g.id,
        g.clasificacion_id,
        cg.nombre as clasificacion_nombre,
        g.descripcion,
        g.cuenta_contable_codigo,
        g.monto,
        g.moneda,
        g.fecha_gasto
      FROM miaff.gastos g
      INNER JOIN miaff.clasificacion_gastos cg ON g.clasificacion_id = cg.id
      WHERE g.caso_estudio_id = $1
      ORDER BY g.fecha_gasto DESC, g.id DESC
    `;

    const { rows } = await dbQuery(sql, [casoId]);
    const gastos = rows;

    // Agrupar por clasificación
    const gastosPorClasificacion: GastosPorClasificacion = {
      operativos: [],
      administrativos: [],
      ventas: [],
      financieros: []
    };

    gastos.forEach(gasto => {
      switch (gasto.clasificacion_nombre.toLowerCase()) {
        case 'operativo':
          gastosPorClasificacion.operativos.push(gasto);
          break;
        case 'administrativo':
          gastosPorClasificacion.administrativos.push(gasto);
          break;
        case 'ventas':
          gastosPorClasificacion.ventas.push(gasto);
          break;
        case 'financiero':
          gastosPorClasificacion.financieros.push(gasto);
          break;
      }
    });

    return gastosPorClasificacion;
  }

private static calcularUtilidadBruta(
  exportaciones: ExportacionDetalle[], 
  importaciones: ImportacionDetalle[]
): UtilidadBruta {
  
  // Calcular ventas totales (exportaciones + ventas nacionales)
  const ventasTotales = exportaciones.reduce((total, exp) => {
    // Asegurar que sea número y convertir todo a USD
    const valorVenta = parseFloat(exp.valor_venta.toString()) || 0;
    const valor = exp.moneda === 'USD' ? valorVenta : valorVenta / 3.75;
    return total + valor;
  }, 0);

  // Calcular costo de adquisición (importaciones)
  const costoAdquisicion = importaciones.reduce((total, imp) => {
    // Asegurar que sean números
    const valorCif = parseFloat(imp.valor_cif.toString()) || 0;
    const dtaTotal = parseFloat(imp.dta_total.toString()) || 0;
    return total + valorCif + dtaTotal;
  }, 0);

  const utilidadBruta = ventasTotales - costoAdquisicion;
  const margenBrutoPorcentaje = ventasTotales > 0 ? (utilidadBruta / ventasTotales) * 100 : 0;

  return {
    ventas_totales: parseFloat(ventasTotales.toFixed(2)),
    costo_adquisicion: parseFloat(costoAdquisicion.toFixed(2)),
    utilidad_bruta: parseFloat(utilidadBruta.toFixed(2)),
    margen_bruto_porcentaje: parseFloat(margenBrutoPorcentaje.toFixed(2))
  };
}

  private static calcularUtilidadOperativa(
    utilidadBruta: UtilidadBruta, 
    gastosOperativos: GastoDetalle[]
  ): UtilidadOperativa {
    
    const gastosOperativosTotal = gastosOperativos.reduce((total, gasto) => {
      // Convertir a USD si es necesario
      const valor = gasto.moneda === 'USD' ? gasto.monto : gasto.monto / 3.75;
      return total + valor;
    }, 0);

    const utilidadOperativa = utilidadBruta.utilidad_bruta - gastosOperativosTotal;
    const margenOperativoPorcentaje = utilidadBruta.ventas_totales > 0 
      ? (utilidadOperativa / utilidadBruta.ventas_totales) * 100 
      : 0;

    return {
      utilidad_bruta: utilidadBruta.utilidad_bruta,
      gastos_operativos: parseFloat(gastosOperativosTotal.toFixed(2)),
      utilidad_operativa: parseFloat(utilidadOperativa.toFixed(2)),
      margen_operativo_porcentaje: parseFloat(margenOperativoPorcentaje.toFixed(2))
    };
  }

  private static calcularUtilidadNeta(
    utilidadOperativa: UtilidadOperativa, 
    gastos: GastosPorClasificacion
  ): UtilidadNeta {
    
    const gastosAdministrativos = this.sumarGastos(gastos.administrativos);
    const gastosVentas = this.sumarGastos(gastos.ventas);
    const gastosFinancieros = this.sumarGastos(gastos.financieros);
    
    const totalOtrosGastos = gastosAdministrativos + gastosVentas + gastosFinancieros;
    const utilidadNeta = utilidadOperativa.utilidad_operativa - totalOtrosGastos;
    
    // Para calcular el margen neto, necesitamos las ventas totales
    // Podemos obtenerlas del contexto anterior o recalcularlas
    const ventasTotales = utilidadOperativa.utilidad_bruta + utilidadOperativa.gastos_operativos;
    const margenNetoPorcentaje = ventasTotales > 0 
      ? (utilidadNeta / ventasTotales) * 100 
      : 0;

    return {
      utilidad_operativa: utilidadOperativa.utilidad_operativa,
      gastos_administrativos: parseFloat(gastosAdministrativos.toFixed(2)),
      gastos_ventas: parseFloat(gastosVentas.toFixed(2)),
      gastos_financieros: parseFloat(gastosFinancieros.toFixed(2)),
      total_otros_gastos: parseFloat(totalOtrosGastos.toFixed(2)),
      utilidad_neta: parseFloat(utilidadNeta.toFixed(2)),
      margen_neto_porcentaje: parseFloat(margenNetoPorcentaje.toFixed(2))
    };
  }

private static sumarGastos(gastos: GastoDetalle[]): number {
  return gastos.reduce((total, gasto) => {
    const monto = parseFloat(gasto.monto.toString()) || 0;
    const valor = gasto.moneda === 'USD' ? monto : monto / 3.75;
    return total + valor;
  }, 0);
}

private static calcularResumenMonedas(
  importaciones: ImportacionDetalle[], 
  exportaciones: ExportacionDetalle[], 
  gastos: GastosPorClasificacion
) {
  let totalUSD = 0;
  let totalPEN = 0;

  // Sumar exportaciones
  exportaciones.forEach(exp => {
    const valorVenta = parseFloat(exp.valor_venta.toString()) || 0;
    if (exp.moneda === 'USD') {
      totalUSD += valorVenta;
    } else {
      totalPEN += valorVenta;
    }
  });

  // Sumar importaciones (siempre en USD)
  importaciones.forEach(imp => {
    const valorCif = parseFloat(imp.valor_cif.toString()) || 0;
    const dtaTotal = parseFloat(imp.dta_total.toString()) || 0;
    totalUSD += valorCif + dtaTotal;
  });

  // Sumar gastos
  const todosGastos = [
    ...gastos.operativos,
    ...gastos.administrativos,
    ...gastos.ventas,
    ...gastos.financieros
  ];

  todosGastos.forEach(gasto => {
    const monto = parseFloat(gasto.monto.toString()) || 0;
    if (gasto.moneda === 'USD') {
      totalUSD += monto;
    } else {
      totalPEN += monto;
    }
  });

  return {
    total_usd: parseFloat(totalUSD.toFixed(2)),
    total_pen: parseFloat(totalPEN.toFixed(2)),
    tipo_cambio_sugerido: 3.75
  };
}

  static async obtenerComparativo(userId: string, limite = 10) {
    // Obtener todos los casos del usuario
    const sql = `
      SELECT id, nombre_caso, created_at 
      FROM miaff.casos_de_estudio 
      WHERE user_id = $1 
      ORDER BY created_at DESC
      LIMIT $2
    `;
    
    const { rows } = await dbQuery(sql, [userId, limite]);

    if (rows.length === 0) {
      return {
        total_casos: 0,
        casos: [],
        estadisticas: {
          mejor_margen: 0,
          peor_margen: 0,
          promedio_margen: '0.00'
        }
      };
    }

    // Obtener análisis para cada caso
    const comparativeData = await Promise.all(
      rows.map(async (caso) => {
        try {
          const analysis = await this.obtenerAnalisisRentabilidad(
            caso.id,
            userId,
            false // Sin detalles para comparación
          );

          return {
            caso_id: caso.id,
            nombre_caso: caso.nombre_caso,
            fecha_creacion: caso.created_at,
            margen_neto: analysis.utilidad_neta.margen_neto_porcentaje,
            utilidad_neta: analysis.utilidad_neta.utilidad_neta,
            ventas_totales: analysis.utilidad_bruta.ventas_totales
          };
        } catch (error) {
          return {
            caso_id: caso.id,
            nombre_caso: caso.nombre_caso,
            fecha_creacion: caso.created_at,
            margen_neto: 0,
            utilidad_neta: 0,
            ventas_totales: 0,
            error: 'Error al calcular análisis'
          };
        }
      })
    );

    const margenes = comparativeData.map(c => c.margen_neto || 0);
    
    return {
      total_casos: rows.length,
      casos: comparativeData,
      estadisticas: {
        mejor_margen: Math.max(...margenes),
        peor_margen: Math.min(...margenes),
        promedio_margen: (margenes.reduce((sum, m) => sum + m, 0) / margenes.length).toFixed(2)
      }
    };
  }
}