import { dbQuery } from '../db';
// Asumimos que estos tipos están definidos en tu proyecto
import { ImportacionCalculada, ImportacionDB, TributoDB } from '../types/importacion.types'; 
// Si no tienes el tipo ImportacionInputData, puedes usar 'any' como en tu código original
type ImportacionInputData = any;


export class ImportacionService {
  
  static async obtenerTasaAdValorem(hs10: string): Promise<number | null> {
    try {
      const { rows } = await dbQuery(
        'SELECT tasa FROM miaff.ad_valorem WHERE hs10 = $1',
        [hs10]
      );
      return rows.length > 0 ? parseFloat(rows[0].tasa) : null;
    } catch (error) {
      console.error('Error obteniendo tasa ad valorem:', error);
      return null;
    }
  }

  static async obtenerTasasImpuestos(): Promise<{ igv: number; ipm: number }> {
    try {
      const { rows } = await dbQuery(
        'SELECT codigo, tasa FROM miaff.impuesto WHERE codigo IN ($1, $2)',
        ['IGV', 'IPM']
      );
      
      const tasas = { igv: 0.16, ipm: 0.02 }; // valores por defecto
      rows.forEach(row => {
        if (row.codigo === 'IGV') tasas.igv = parseFloat(row.tasa);
        if (row.codigo === 'IPM') tasas.ipm = parseFloat(row.tasa);
      });
      
      return tasas;
    } catch (error) {
      console.error('Error obteniendo tasas de impuestos:', error);
      // Devuelve valores estándar si la BD falla
      return { igv: 0.16, ipm: 0.02 };
    }
  }

  // --- ¡FUNCIÓN DE CÁLCULO TOTALMENTE CORREGIDA! ---
  static calcularImportacion(data: ImportacionInputData, tasasImpuestos: { igv: number; ipm: number }): ImportacionCalculada {
    // 1. Base Imponible (CIF)
    const valorCIF = data.valor_fob + data.valor_flete + data.valor_seguro;
    
    // 2. Ad Valorem
    // Se usa la tasa que ya fue consultada y asignada en el controlador.
    const tasaAdValorem = data.ad_valorem_tasa_manual || 0; 
    const montoAdValorem = valorCIF * tasaAdValorem;
    
    // 3. ISC (Impuesto Selectivo al Consumo)
    // Base ISC = Base Imponible (CIF) + Ad Valorem
    const baseISC = valorCIF + montoAdValorem;
    const montoISC = data.habilitar_isc ? baseISC * (data.isc_tasa_ingresada || 0) : 0;
    
    // 4. IGV / IPM
    // Base IGV/IPM = Base Imponible (CIF) + Ad Valorem + ISC
    const baseIGV = valorCIF + montoAdValorem + montoISC;
    const montoIGV = data.habilitar_igv ? baseIGV * tasasImpuestos.igv : 0;
    const montoIPM = data.habilitar_igv ? baseIGV * tasasImpuestos.ipm : 0;
    
    // 5. Percepciones (¡LÓGICA CORREGIDA!)
    // Base Percepción = Base Imponible (CIF) + Ad Valorem + ISC + IGV + IPM
    const basePercepcion = valorCIF + montoAdValorem + montoISC + montoIGV + montoIPM;
    const tasaPercepcion = data.percepcion_tasa_ingresada || 0; // Si no hay tasa, es 0
    const montoPercepcion = data.habilitar_percepcion ? basePercepcion * tasaPercepcion : 0;
    
    // 6. Deuda Tributaria Aduanera (DTA) - (¡LÓGICA CORREGIDA!)
    // La percepción NO es parte de la DTA.
    const dtaTotal = montoAdValorem + montoISC + montoIGV + montoIPM;

    // 7. Generar array de tributos para guardar en la BD
    const tributos: TributoDB[] = [];
    if (montoAdValorem > 0) tributos.push({ concepto: 'ad_valorem', base_imponible: valorCIF, tasa_aplicada: tasaAdValorem, monto_calculado: montoAdValorem });
    if (montoISC > 0) tributos.push({ concepto: 'isc', base_imponible: baseISC, tasa_aplicada: data.isc_tasa_ingresada || 0, monto_calculado: montoISC });
    if (montoIGV > 0) tributos.push({ concepto: 'igv', base_imponible: baseIGV, tasa_aplicada: tasasImpuestos.igv, monto_calculado: montoIGV });
    if (montoIPM > 0) tributos.push({ concepto: 'ipm', base_imponible: baseIGV, tasa_aplicada: tasasImpuestos.ipm, monto_calculado: montoIPM });
    if (montoPercepcion > 0) tributos.push({ concepto: 'percepcion', base_imponible: basePercepcion, tasa_aplicada: tasaPercepcion, monto_calculado: montoPercepcion });

    // 8. Generar asiento contable básico
    const totalDesembolsado = dtaTotal + montoPercepcion;
    const asientoContable = [
      { cuenta: '601', nombre_cuenta: 'Mercaderías', debe: valorCIF, haber: 0, glosa: `Importación - ${data.descripcion_mercancia}` },
      { cuenta: '40111', nombre_cuenta: 'IGV - Cuenta Propia', debe: montoIGV + montoIPM, haber: 0, glosa: `Tributos de Importación` },
      { cuenta: '60912', nombre_cuenta: 'Derechos Aduaneros', debe: montoAdValorem, haber: 0, glosa: `Tributos de Importación` },
      { cuenta: '40113', nombre_cuenta: 'IGV - Percepciones por Pagar', debe: montoPercepcion, haber: 0, glosa: `Tributos de Importación` },
      { cuenta: '4212', nombre_cuenta: 'Facturas por Pagar - Exterior', debe: 0, haber: totalDesembolsado, glosa: `Total a Pagar por Importación` },
    ];

    return {
      valor_cif: valorCIF,
      monto_ad_valorem: montoAdValorem,
      monto_isc: montoISC,
      monto_igv: montoIGV,
      monto_ipm: montoIPM,
      monto_percepcion: montoPercepcion,
      dta_total: dtaTotal,
      tributos,
      asiento_contable: asientoContable
    };
  }

  static async crearImportacion(
    user_id: string, 
    data: ImportacionInputData
  ): Promise<{ importacion: ImportacionDB; tributos: TributoDB[] }> {
    
    // 1. Obtener tasas de impuestos generales
    const tasasImpuestos = await this.obtenerTasasImpuestos();

    // 2. Obtener tasa de ad valorem automática si el usuario no la especificó
    if (!data.ad_valorem_tasa_manual && data.subpartida_hs10) {
      const tasaAutomatica = await this.obtenerTasaAdValorem(data.subpartida_hs10);
      data.ad_valorem_tasa_manual = tasaAutomatica ?? 0; // Usar 0 si no se encuentra
    }

    // 3. Calcular todos los montos con la lógica corregida
    const calculado = this.calcularImportacion(data, tasasImpuestos);

    // 4. Insertar la importación principal en la base de datos
    const { rows } = await dbQuery(
      `INSERT INTO miaff.importaciones (
        caso_estudio_id, user_id, subpartida_hs10, descripcion_mercancia,
        moneda, valor_fob, valor_flete, valor_seguro,
        habilitar_igv, habilitar_isc, habilitar_percepcion,
        ad_valorem_tasa_manual, isc_tasa_ingresada, percepcion_tasa_ingresada,
        antidumping_ingresado, compensatorio_ingresado, sda_ingresado,
        valor_cif, monto_ad_valorem, monto_isc, monto_igv, monto_ipm,
        monto_percepcion, dta_total, asiento_contable_json, fecha_operacion
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
      ) RETURNING *`,
      [
        data.caso_estudio_id, user_id, data.subpartida_hs10, data.descripcion_mercancia,
        data.moneda, data.valor_fob, data.valor_flete, data.valor_seguro,
        data.habilitar_igv, data.habilitar_isc, data.habilitar_percepcion,
        data.ad_valorem_tasa_manual, data.isc_tasa_ingresada, data.percepcion_tasa_ingresada,
        data.antidumping_ingresado, data.compensatorio_ingresado, data.sda_ingresado,
        calculado.valor_cif, calculado.monto_ad_valorem, calculado.monto_isc,
        calculado.monto_igv, calculado.monto_ipm, calculado.monto_percepcion,
        calculado.dta_total, JSON.stringify(calculado.asiento_contable),
        data.fecha_operacion || new Date().toISOString().split('T')[0]
      ]
    );

    const importacionCreada = rows[0];

    // 5. Insertar los tributos detallados en su tabla
    for (const tributo of calculado.tributos) {
      await dbQuery(
        `INSERT INTO miaff.importacion_tributos (
          importacion_id, concepto, base_imponible, tasa_aplicada, monto_calculado
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          importacionCreada.id, tributo.concepto, tributo.base_imponible,
          tributo.tasa_aplicada, tributo.monto_calculado
        ]
      );
    }

    return {
      importacion: importacionCreada,
      tributos: calculado.tributos
    };
  }

  static async listarImportaciones(user_id: string, caso_estudio_id?: number): Promise<ImportacionDB[]> {
    let sql = `
      SELECT i.*, ce.nombre_caso, s.descripcion as subpartida_descripcion
      FROM miaff.importaciones i
      JOIN miaff.casos_de_estudio ce ON ce.id = i.caso_estudio_id
      LEFT JOIN miaff.subpartida s ON s.hs10 = i.subpartida_hs10
      WHERE i.user_id = $1
    `;
    
    const params: any[] = [user_id];
    
    if (caso_estudio_id) {
      sql += ` AND i.caso_estudio_id = $${params.length + 1}`;
      params.push(caso_estudio_id);
    }
    
    sql += ` ORDER BY i.created_at DESC`;
    
    const { rows } = await dbQuery(sql, params);
    return rows;
  }

  static async obtenerImportacion(id: string, user_id: string): Promise<{ importacion: ImportacionDB; tributos: TributoDB[] } | null> {
    const { rows } = await dbQuery(
      `SELECT i.*, ce.nombre_caso, s.descripcion as subpartida_descripcion
       FROM miaff.importaciones i
       JOIN miaff.casos_de_estudio ce ON ce.id = i.caso_estudio_id
       LEFT JOIN miaff.subpartida s ON s.hs10 = i.subpartida_hs10
       WHERE i.id = $1 AND i.user_id = $2`,
      [id, user_id]
    );

    if (rows.length === 0) {
      return null;
    }

    // Obtener tributos
    const { rows: tributos } = await dbQuery(
      'SELECT concepto, base_imponible, tasa_aplicada, monto_calculado FROM miaff.importacion_tributos WHERE importacion_id = $1',
      [id]
    );

    return {
      importacion: rows[0],
      tributos
    };
  }

  static async verificarCasoEstudioUsuario(caso_estudio_id: number, user_id: string): Promise<boolean> {
    const { rows } = await dbQuery(
      'SELECT id FROM miaff.casos_de_estudio WHERE id = $1 AND user_id = $2',
      [caso_estudio_id, user_id]
    );
    return rows.length > 0;
  }
}