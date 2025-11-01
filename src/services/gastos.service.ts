// services/gastos.service.ts
import { dbQuery } from '../db';
import {
    CrearGastoInput,
    GastoDB,
    ClasificacionGastoDB,
    AsientoContableCompleto,
    AsientoContableDetalle,
    ResumenGastosPorTipo,
    CalculoTributario,
    DatosFinancierosInput,
    DatosFinancieros,
    RatiosFinancieros,
    ActualizarGastoInput
} from '../types/gastos.types';

export class GastoService {

    // ====== MÉTODOS BÁSICOS CRUD ======

    static async listarClasificaciones(): Promise<ClasificacionGastoDB[]> {
        const sql = `
            SELECT
                id,
                nombre,
                cuenta_contable,
                tipo_gasto,
                calcula_igv
            FROM miaff.clasificacion_gastos
            ORDER BY tipo_gasto, cuenta_contable;
        `;
        const { rows } = await dbQuery<ClasificacionGastoDB>(sql);
        return rows;
    }

    static async crear(userId: string, data: CrearGastoInput): Promise<GastoDB> {
        const {
            caso_estudio_id,
            clasificacion_id,
            descripcion,
            monto,
            moneda,
            fecha_gasto,
            es_remuneracion,
            tipo_pension
        } = data;

        const sql = `
            INSERT INTO miaff.gastos (
                user_id, caso_estudio_id, clasificacion_id, descripcion,
                monto, moneda, fecha_gasto, es_remuneracion, tipo_pension, activo
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
                RETURNING *;
        `;

        const params = [
            userId,
            caso_estudio_id,
            clasificacion_id,
            descripcion,
            monto,
            moneda,
            fecha_gasto || new Date().toISOString().split('T')[0],
            es_remuneracion || false,
            tipo_pension || null
        ];

        const { rows } = await dbQuery<GastoDB>(sql, params);
        return rows[0];
    }

    static async listarPorCaso(userId: string, casoEstudioId: number): Promise<GastoDB[]> {
        const sql = `
            SELECT
                g.*,
                cg.nombre as nombre_clasificacion,
                cg.cuenta_contable,
                cg.tipo_gasto,
                cg.calcula_igv
            FROM
                miaff.gastos g
                    JOIN
                miaff.clasificacion_gastos cg ON g.clasificacion_id = cg.id
            WHERE
                g.user_id = $1
              AND g.caso_estudio_id = $2
              AND g.activo = 1
            ORDER BY
                cg.tipo_gasto, g.fecha_gasto DESC, g.created_at DESC;
        `;
        const { rows } = await dbQuery<GastoDB>(sql, [userId, casoEstudioId]);
        return rows;
    }

    static async eliminar(gastoId: number, userId: string): Promise<boolean> {
        const sql = `
            UPDATE miaff.gastos
            SET activo = 0, updated_at = NOW()
            WHERE id = $1 AND user_id = $2 AND activo = 1
                RETURNING id;
        `;
        const { rows } = await dbQuery<{ id: number }>(sql, [gastoId, userId]);
        return rows.length > 0;
    }

    static async actualizar(
        gastoId: number,
        userId: string,
        data: ActualizarGastoInput
    ): Promise<GastoDB | null> {

        // 1. Verificar que el gasto existe, pertenece al usuario y está activo
        const getSql = `
            SELECT * FROM miaff.gastos
            WHERE id = $1 AND user_id = $2 AND activo = 1;
        `;
        const { rows: currentRows } = await dbQuery<GastoDB>(getSql, [gastoId, userId]);

        if (currentRows.length === 0) {
            return null; // No encontrado, no autorizado o ya inactivo
        }

        const currentGasto = currentRows[0];

        // 2. Fusionar datos antiguos con los nuevos (los nuevos sobreescriben)
        const mergedGasto = { ...currentGasto, ...data };

        // 3. Lógica de negocio: si se actualiza a 'es_remuneracion: false',
        //    debemos anular el tipo de pensión.
        let finalTipoPension = mergedGasto.tipo_pension;
        if (data.es_remuneracion === false) {
            finalTipoPension = null;
        }

        // 4. Construir y ejecutar la consulta UPDATE
        const updateSql = `
            UPDATE miaff.gastos SET
                                    clasificacion_id = $1,
                                    descripcion = $2,
                                    monto = $3,
                                    moneda = $4,
                                    fecha_gasto = $5,
                                    es_remuneracion = $6,
                                    tipo_pension = $7,
                                    updated_at = NOW()
            WHERE
                id = $8 AND user_id = $9 AND activo = 1
                RETURNING *;
        `;

        const params = [
            mergedGasto.clasificacion_id,
            mergedGasto.descripcion,
            mergedGasto.monto,
            mergedGasto.moneda,
            mergedGasto.fecha_gasto,
            mergedGasto.es_remuneracion,
            finalTipoPension,
            gastoId,
            userId
        ];

        const { rows } = await dbQuery<GastoDB>(updateSql, params);
        return rows[0];
    }

    // ====== MÉTODOS DE CÁLCULO TRIBUTARIO ======

    static async calcularTributosGastos(
        userId: string,
        casoEstudioId: number
    ): Promise<CalculoTributario> {
        const gastos = await this.listarPorCaso(userId, casoEstudioId);

        // Separar remuneraciones (cuentas 621 y 627)
        const remuneraciones = gastos.filter(g =>
            g.cuenta_contable?.startsWith('621') || g.cuenta_contable === '621.1' ||
            g.cuenta_contable === '621.2' || g.cuenta_contable === '621.3'
        );

        // Gastos con IGV (desde 631 hasta 659, excluyendo 627)
        const gastosConIgv = gastos.filter(g =>
                g.calcula_igv === true && g.cuenta_contable && (
                    g.cuenta_contable.startsWith('631') ||
                    g.cuenta_contable.startsWith('632') ||
                    g.cuenta_contable.startsWith('633') ||
                    g.cuenta_contable.startsWith('634') ||
                    g.cuenta_contable.startsWith('635') ||
                    g.cuenta_contable.startsWith('636') ||
                    g.cuenta_contable.startsWith('637') ||
                    g.cuenta_contable.startsWith('639') ||
                    g.cuenta_contable.startsWith('651') ||
                    g.cuenta_contable.startsWith('659')
                )
        );

        // Gastos financieros (cuenta 671)
        const gastosFinancieros = gastos.filter(g =>
            g.cuenta_contable?.startsWith('671')
        );

        // Calcular totales de remuneraciones
        const totalRemuneraciones = remuneraciones.reduce((sum, g) =>
            sum + parseFloat(g.monto), 0
        );

        // ESSALUD: 9% sobre remuneraciones (cuenta 627)
        const essalud = totalRemuneraciones * 0.09;

        // Calcular ONP y AFP por tipo de pensión
        const remuneracionesONP = remuneraciones
            .filter(g => g.tipo_pension === 'ONP')
            .reduce((sum, g) => sum + parseFloat(g.monto), 0);

        const remuneracionesAFP = remuneraciones
            .filter(g => g.tipo_pension === 'AFP')
            .reduce((sum, g) => sum + parseFloat(g.monto), 0);

        const onp = remuneracionesONP * 0.13; // 13% ONP
        const afp = remuneracionesAFP * 0.1137; // 11.37% AFP

        // Remuneraciones por pagar = Total remuneraciones - ONP - AFP
        const remuneracionesPorPagar = totalRemuneraciones - onp - afp;

        // Calcular IGV sobre otros gastos
        const totalGastosConIgv = gastosConIgv.reduce((sum, g) =>
            sum + parseFloat(g.monto), 0
        );
        const igv = totalGastosConIgv * 0.18; // 18% IGV
        const facturasPorPagar = totalGastosConIgv + igv;

        // Gastos financieros (sin IGV)
        const totalGastosFinancieros = gastosFinancieros.reduce((sum, g) =>
            sum + parseFloat(g.monto), 0
        );

        return {
            total_remuneraciones: totalRemuneraciones,
            essalud,
            onp,
            afp,
            remuneraciones_por_pagar: remuneracionesPorPagar,
            total_gastos_con_igv: totalGastosConIgv,
            igv,
            facturas_por_pagar: facturasPorPagar,
            total_gastos_financieros: totalGastosFinancieros
        };
    }

    // ====== ASIENTO CONTABLE ======

    static async generarAsientoContable(
        userId: string,
        casoEstudioId: number
    ): Promise<AsientoContableCompleto> {
        const gastos = await this.listarPorCaso(userId, casoEstudioId);
        const tributos = await this.calcularTributosGastos(userId, casoEstudioId);

        const detalles: AsientoContableDetalle[] = [];

        // Agrupar gastos por cuenta contable para el DEBE
        const gastosPorCuenta = new Map<string, { denominacion: string; total: number }>();

        gastos.forEach(gasto => {
            if (!gasto.cuenta_contable) return;

            const key = gasto.cuenta_contable;
            if (!gastosPorCuenta.has(key)) {
                gastosPorCuenta.set(key, {
                    denominacion: gasto.nombre_clasificacion || '',
                    total: 0
                });
            }
            const actual = gastosPorCuenta.get(key)!;
            actual.total += parseFloat(gasto.monto);
        });

        // DEBE: Todas las cuentas de gasto (clase 6)
        gastosPorCuenta.forEach((valor, codigo) => {
            // 1. Añade el gasto principal (ej: 621.1 por 1200)
            detalles.push({
                codigo_cuenta: codigo,
                denominacion: valor.denominacion,
                debe: valor.total,
                haber: 0
            });

            // Si es una cuenta de remuneración (621.x), calcula y añade
            // automáticamente su gasto ESSALUD (627.x) al DEBE.
            if (codigo.startsWith('621')) {
                const essaludGasto = valor.total * 0.09; // 9%

                // Si el gasto es 0, no añadir la línea de ESSALUD
                if (essaludGasto === 0) return;

                const essaludCodigo = codigo.replace('621', '627'); // '621.1' -> '627.1'

                // Asigna la denominación correcta según tu memoria
                let essaludDenominacion = 'Seguridad, previsión social (ESSALUD)';
                if (codigo.endsWith('.1')) essaludDenominacion += ' operativos';
                else if (codigo.endsWith('.2')) essaludDenominacion += ' administrativas';
                else if (codigo.endsWith('.3')) essaludDenominacion += ' de ventas';

                detalles.push({
                    codigo_cuenta: essaludCodigo,
                    denominacion: essaludDenominacion,
                    debe: essaludGasto,
                    haber: 0
                });
            }
        });

        // DEBE: IGV (40111)
        if (tributos.igv > 0) {
            detalles.push({
                codigo_cuenta: '40111',
                denominacion: 'IGV - Cuenta propia',
                debe: tributos.igv,
                haber: 0
            });
        }

        // HABER: Tributos y cuentas por pagar
        if (tributos.essalud > 0) {
            detalles.push({
                codigo_cuenta: '4031',
                denominacion: 'Instituciones públicas - ESSALUD',
                debe: 0,
                haber: tributos.essalud
            });
        }

        if (tributos.onp > 0) {
            detalles.push({
                codigo_cuenta: '4032',
                denominacion: 'Instituciones públicas - ONP',
                debe: 0,
                haber: tributos.onp
            });
        }

        if (tributos.afp > 0) {
            detalles.push({
                codigo_cuenta: '407',
                denominacion: 'Administradoras de fondos de pensiones',
                debe: 0,
                haber: tributos.afp
            });
        }

        if (tributos.remuneraciones_por_pagar > 0) {
            detalles.push({
                codigo_cuenta: '411',
                denominacion: 'Remuneraciones por pagar',
                debe: 0,
                haber: tributos.remuneraciones_por_pagar
            });
        }

        if (tributos.facturas_por_pagar > 0) {
            detalles.push({
                codigo_cuenta: '4211',
                denominacion: 'Facturas, boletas y otros comprobantes por pagar',
                debe: 0,
                haber: tributos.facturas_por_pagar
            });
        }

        if (tributos.total_gastos_financieros > 0) {
            detalles.push({
                codigo_cuenta: '101',
                denominacion: 'Caja y bancos',
                debe: 0,
                haber: tributos.total_gastos_financieros
            });
        }

        const totalDebe = detalles.reduce((sum, d) => sum + d.debe, 0);
        const totalHaber = detalles.reduce((sum, d) => sum + d.haber, 0);

        return {
            fecha: new Date().toISOString().split('T')[0],
            descripcion: `Asiento por gastos del caso de estudio #${casoEstudioId}`,
            detalles,
            total_debe: totalDebe,
            total_haber: totalHaber
        };
    }

    // ====== RESUMEN POR TIPO DE GASTO ======

    static async obtenerResumenPorTipo(
        userId: string,
        casoEstudioId: number
    ): Promise<ResumenGastosPorTipo[]> {
        const gastos = await this.listarPorCaso(userId, casoEstudioId);

        const tipos = ['OPERATIVO', 'ADMINISTRATIVO', 'VENTA', 'FINANCIERO'];
        const resumen: ResumenGastosPorTipo[] = [];

        tipos.forEach(tipo => {
            const gastosTipo = gastos.filter(g => g.tipo_gasto === tipo);

            const gastosDetalle = gastosTipo.map(g => ({
                cuenta: g.cuenta_contable || '',
                descripcion: g.nombre_clasificacion || g.descripcion,
                monto: parseFloat(g.monto)
            }));

            const total = gastosDetalle.reduce((sum, g) => sum + g.monto, 0);

            if (gastosDetalle.length > 0) {
                resumen.push({
                    tipo,
                    gastos: gastosDetalle,
                    total
                });
            }
        });

        return resumen;
    }

    // ====== DATOS FINANCIEROS ======

    static async guardarDatosFinancieros(
        userId: string,
        data: DatosFinancierosInput
    ): Promise<DatosFinancieros> {
        const { caso_estudio_id, activos_totales, patrimonio, moneda } = data;

        // Verificar si ya existen datos para este caso de estudio
        const existeSql = `
      SELECT id FROM miaff.datos_financieros 
      WHERE user_id = $1 AND caso_estudio_id = $2;
    `;
        const { rows: existentes } = await dbQuery<{ id: number }>(
            existeSql,
            [userId, caso_estudio_id]
        );

        if (existentes.length > 0) {
            // Actualizar
            const updateSql = `
        UPDATE miaff.datos_financieros 
        SET activos_totales = $1, patrimonio = $2, moneda = $3, updated_at = NOW()
        WHERE user_id = $4 AND caso_estudio_id = $5
        RETURNING *;
      `;
            const { rows } = await dbQuery<DatosFinancieros>(
                updateSql,
                [activos_totales, patrimonio, moneda, userId, caso_estudio_id]
            );
            return rows[0];
        } else {
            // Insertar
            const insertSql = `
        INSERT INTO miaff.datos_financieros 
        (user_id, caso_estudio_id, activos_totales, patrimonio, moneda)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
            const { rows } = await dbQuery<DatosFinancieros>(
                insertSql,
                [userId, caso_estudio_id, activos_totales, patrimonio, moneda]
            );
            return rows[0];
        }
    }

    static async obtenerDatosFinancieros(
        userId: string,
        casoEstudioId: number
    ): Promise<DatosFinancieros | null> {
        const sql = `
      SELECT * FROM miaff.datos_financieros 
      WHERE user_id = $1 AND caso_estudio_id = $2;
    `;
        const { rows } = await dbQuery<DatosFinancieros>(sql, [userId, casoEstudioId]);
        return rows[0] || null;
    }

    // ====== RATIOS FINANCIEROS ======

    static async calcularRatiosFinancieros(
        userId: string,
        casoEstudioId: number
    ): Promise<RatiosFinancieros | null> {
        // Obtener datos financieros
        const datosFinancieros = await this.obtenerDatosFinancieros(userId, casoEstudioId);
        if (!datosFinancieros) {
            return null;
        }

        // Obtener ventas totales del módulo de ventas (asumiendo que existe)
        const ventasSql = `
      SELECT COALESCE(SUM(monto_sin_igv), 0) as total_ventas
      FROM miaff.ventas 
      WHERE user_id = $1 AND caso_estudio_id = $2;
    `;
        const { rows: ventasRows } = await dbQuery<{ total_ventas: string }>(
            ventasSql,
            [userId, casoEstudioId]
        );
        const ventasTotalesSinIgv = parseFloat(ventasRows[0]?.total_ventas || '0');

        // Obtener costos de producción (asumiendo módulo de producción)
        const costosSql = `
      SELECT COALESCE(SUM(monto), 0) as total_costos
      FROM miaff.costos_produccion 
      WHERE user_id = $1 AND caso_estudio_id = $2;
    `;
        const { rows: costosRows } = await dbQuery<{ total_costos: string }>(
            costosSql,
            [userId, casoEstudioId]
        );
        const totalCostos = parseFloat(costosRows[0]?.total_costos || '0');

        // Obtener gastos totales (solo activos)
        const gastos = await this.listarPorCaso(userId, casoEstudioId);
        const totalGastos = gastos.reduce((sum, g) => sum + parseFloat(g.monto), 0);

        // Calcular utilidades
        const utilidadBruta = ventasTotalesSinIgv - totalCostos;
        const utilidadOperativa = utilidadBruta - totalGastos;

        // Utilidad neta (asumiendo impuesto a la renta del 29.5%)
        const utilidadNeta = utilidadOperativa * 0.705;

        // Calcular márgenes
        const margenBrutoPorcentaje = ventasTotalesSinIgv > 0
            ? (utilidadBruta / ventasTotalesSinIgv) * 100
            : 0;
        const margenOperativoPorcentaje = ventasTotalesSinIgv > 0
            ? (utilidadOperativa / ventasTotalesSinIgv) * 100
            : 0;
        const margenNetoPorcentaje = ventasTotalesSinIgv > 0
            ? (utilidadNeta / ventasTotalesSinIgv) * 100
            : 0;

        // Calcular ratios de rentabilidad
        const activosTotales = parseFloat(datosFinancieros.activos_totales);
        const patrimonio = parseFloat(datosFinancieros.patrimonio);

        const ros = ventasTotalesSinIgv > 0
            ? (utilidadNeta / ventasTotalesSinIgv) * 100
            : 0;
        const roa = activosTotales > 0
            ? (utilidadNeta / activosTotales) * 100
            : 0;
        const roe = patrimonio > 0
            ? (utilidadNeta / patrimonio) * 100
            : 0;

        return {
            margen_bruto_porcentaje: margenBrutoPorcentaje,
            margen_operativo_porcentaje: margenOperativoPorcentaje,
            margen_neto_porcentaje: margenNetoPorcentaje,
            rentabilidad_sobre_ventas_ros: ros,
            rentabilidad_sobre_activos_roa: roa,
            rentabilidad_sobre_patrimonio_roe: roe,
            ventas_totales_sin_igv: ventasTotalesSinIgv,
            utilidad_bruta: utilidadBruta,
            utilidad_operativa: utilidadOperativa,
            utilidad_neta: utilidadNeta,
            activos_totales: activosTotales,
            patrimonio
        };
    }
}