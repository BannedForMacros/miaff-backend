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
import { ExchangeRateService } from './exchangeRate.service';

export class GastoService {

    // ====== FUNCIÓN HELPER PARA CALCULAR BASE E IGV ======
    private static calcularMontos(monto: number, incluyeIgv: boolean): {
        base: number;
        igv: number;
        total: number
    } {
        if (incluyeIgv) {
            // Si incluye IGV: extraer base
            const base = Math.round((monto / 1.18) * 100) / 100;
            const igv = monto - base;
            return { base, igv, total: monto };
        } else {
            // Si NO incluye IGV: el monto es la base
            return { base: monto, igv: 0, total: monto };
        }
    }

    // ====== MÉTODOS BÁSICOS CRUD ======

    static async listarClasificaciones(): Promise<ClasificacionGastoDB[]> {
        const sql = `
            SELECT
                id,
                nombre,
                cuenta_contable,
                tipo_gasto,
                calcula_igv,
                igv_opcional
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
            tipo_pension,
            incluye_igv = null
        } = data;

        // OBTENER CLASIFICACIÓN PARA VALIDAR
        const clasificacionSql = `
    SELECT calcula_igv, igv_opcional 
    FROM miaff.clasificacion_gastos 
    WHERE id = $1;
  `;
        const { rows: clasRows } = await dbQuery<{ calcula_igv: boolean; igv_opcional: boolean }>(
            clasificacionSql,
            [clasificacion_id]
        );

        if (clasRows.length === 0) {
            throw new Error('Clasificación no encontrada');
        }

        const { calcula_igv, igv_opcional } = clasRows[0];

        // VALIDAR Y CORREGIR incluye_igv según las reglas
        let incluyeIgvFinal: boolean | null = null;

        if (!calcula_igv) {
            // NO calcula IGV → incluye_igv debe ser false/null
            incluyeIgvFinal = false;
        } else if (calcula_igv && !igv_opcional) {
            // Calcula IGV OBLIGATORIO → incluye_igv SIEMPRE true
            incluyeIgvFinal = true;
        } else if (calcula_igv && igv_opcional) {
            // Calcula IGV OPCIONAL → respetar lo que envió el usuario
            incluyeIgvFinal = incluye_igv ?? false; // Si no envió nada, asumir false
        }

        // Calcular monto_base y monto_igv
        const calculado = this.calcularMontos(monto, incluyeIgvFinal === true);

        // Obtener TC de la fecha del gasto
        const fechaG = fecha_gasto || new Date().toISOString().split('T')[0];
        let tipoCambioFecha: number | null = null;
        try {
            tipoCambioFecha = await ExchangeRateService.getExchangeRate(fechaG);
        } catch (e) {
            console.warn('⚠️ No se pudo obtener TC para fecha', fechaG, e);
        }

        const sql = `
    INSERT INTO miaff.gastos (
      user_id, caso_estudio_id, clasificacion_id, descripcion,
      monto, monto_base, monto_igv, moneda, fecha_gasto,
      es_remuneracion, tipo_pension, incluye_igv, tipo_cambio_fecha, activo
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1)
    RETURNING *;
  `;

        const params = [
            userId,
            caso_estudio_id,
            clasificacion_id,
            descripcion,
            calculado.total,
            calculado.base,
            calculado.igv,
            moneda,
            fechaG,
            es_remuneracion || false,
            tipo_pension || null,
            incluyeIgvFinal,
            tipoCambioFecha
        ];

        const { rows } = await dbQuery<GastoDB>(sql, params);
        return rows[0];
    }

    static async actualizar(
        gastoId: number,
        userId: string,
        data: ActualizarGastoInput
    ): Promise<GastoDB | null> {
        const getSql = `
    SELECT g.*, cg.calcula_igv, cg.igv_opcional
    FROM miaff.gastos g
    JOIN miaff.clasificacion_gastos cg ON g.clasificacion_id = cg.id
    WHERE g.id = $1 AND g.user_id = $2 AND g.activo = 1;
  `;
        const { rows: currentRows } = await dbQuery<GastoDB & { calcula_igv: boolean; igv_opcional: boolean }>(
            getSql,
            [gastoId, userId]
        );

        if (currentRows.length === 0) {
            return null;
        }

        const currentGasto = currentRows[0];
        const mergedGasto = { ...currentGasto, ...data };

        let finalTipoPension = mergedGasto.tipo_pension;
        if (data.es_remuneracion === false) {
            finalTipoPension = null;
        }

        // VALIDAR incluye_igv
        let incluyeIgvFinal = mergedGasto.incluye_igv;

        if (!currentGasto.calcula_igv) {
            incluyeIgvFinal = false;
        } else if (currentGasto.calcula_igv && !currentGasto.igv_opcional) {
            incluyeIgvFinal = true;
        } else if (currentGasto.calcula_igv && currentGasto.igv_opcional) {
            incluyeIgvFinal = mergedGasto.incluye_igv ?? false;
        }

        // Recalcular montos
        let montoBase = parseFloat(currentGasto.monto_base);
        let montoIgv = parseFloat(currentGasto.monto_igv);
        let montoTotal = parseFloat(currentGasto.monto);

        if (data.monto !== undefined) {
            const calculado = this.calcularMontos(data.monto, incluyeIgvFinal === true);
            montoBase = calculado.base;
            montoIgv = calculado.igv;
            montoTotal = calculado.total;
        }

        const updateSql = `
    UPDATE miaff.gastos SET
      clasificacion_id = $1,
      descripcion = $2,
      monto = $3,
      monto_base = $4,
      monto_igv = $5,
      moneda = $6,
      fecha_gasto = $7,
      es_remuneracion = $8,
      tipo_pension = $9,
      incluye_igv = $10,
      updated_at = NOW()
    WHERE
      id = $11 AND user_id = $12 AND activo = 1
    RETURNING *;
  `;

        const params = [
            mergedGasto.clasificacion_id,
            mergedGasto.descripcion,
            montoTotal,
            montoBase,
            montoIgv,
            mergedGasto.moneda,
            mergedGasto.fecha_gasto,
            mergedGasto.es_remuneracion,
            finalTipoPension,
            incluyeIgvFinal,
            gastoId,
            userId
        ];

        const { rows } = await dbQuery<GastoDB>(updateSql, params);
        return rows[0];
    }


    static async listarPorCaso(userId: string, casoEstudioId: number): Promise<GastoDB[]> {
        const sql = `
            SELECT
                g.*,
                cg.nombre as nombre_clasificacion,
                cg.cuenta_contable,
                cg.tipo_gasto,
                cg.calcula_igv,
                cg.igv_opcional
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



    // ====== MÉTODOS DE CÁLCULO TRIBUTARIO ======

    static async calcularTributosGastos(
        userId: string,
        casoEstudioId: number
    ): Promise<CalculoTributario> {
        const gastos = await this.listarPorCaso(userId, casoEstudioId);

        const remuneraciones = gastos.filter(g =>
            g.cuenta_contable?.startsWith('621')
        );

        const gastosConIgv = gastos.filter(g =>
            parseFloat(g.monto_igv) > 0 &&
            !g.cuenta_contable?.startsWith('621') &&
            !g.cuenta_contable?.startsWith('627') &&
            !g.cuenta_contable?.startsWith('671')
        );

        const gastosFinancieros = gastos.filter(g =>
            g.cuenta_contable?.startsWith('671')
        );

        const totalRemuneraciones = remuneraciones.reduce((sum, g) =>
            sum + parseFloat(g.monto_base), 0
        );

        const essalud = totalRemuneraciones * 0.09;

        const remuneracionesONP = remuneraciones
            .filter(g => g.tipo_pension === 'ONP')
            .reduce((sum, g) => sum + parseFloat(g.monto_base), 0);

        const remuneracionesAFP = remuneraciones
            .filter(g => g.tipo_pension === 'AFP')
            .reduce((sum, g) => sum + parseFloat(g.monto_base), 0);

        const onp = remuneracionesONP * 0.13;
        const afp = remuneracionesAFP * 0.1137;

        const remuneracionesPorPagar = totalRemuneraciones - onp - afp;

        const totalGastosConIgv = gastosConIgv.reduce((sum, g) =>
            sum + parseFloat(g.monto_base), 0
        );

        const igv = gastosConIgv.reduce((sum, g) =>
            sum + parseFloat(g.monto_igv), 0
        );

        const facturasPorPagar = totalGastosConIgv + igv;

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

    // Método privado para calcular tributos de gastos ya filtrados
    private static calcularTributosDeGastos(gastos: GastoDB[]): CalculoTributario {
        const remuneraciones = gastos.filter(g => g.cuenta_contable?.startsWith('621'));
        const gastosConIgv = gastos.filter(g =>
            parseFloat(g.monto_igv) > 0 &&
            !g.cuenta_contable?.startsWith('621') &&
            !g.cuenta_contable?.startsWith('627') &&
            !g.cuenta_contable?.startsWith('671')
        );
        const gastosFinancieros = gastos.filter(g => g.cuenta_contable?.startsWith('671'));

        const totalRemuneraciones = remuneraciones.reduce((sum, g) => sum + parseFloat(g.monto_base), 0);
        const essalud = totalRemuneraciones * 0.09;

        const remuneracionesONP = remuneraciones.filter(g => g.tipo_pension === 'ONP')
            .reduce((sum, g) => sum + parseFloat(g.monto_base), 0);
        const remuneracionesAFP = remuneraciones.filter(g => g.tipo_pension === 'AFP')
            .reduce((sum, g) => sum + parseFloat(g.monto_base), 0);

        const onp = remuneracionesONP * 0.13;
        const afp = remuneracionesAFP * 0.1137;
        const remuneracionesPorPagar = totalRemuneraciones - onp - afp;

        const totalGastosConIgv = gastosConIgv.reduce((sum, g) => sum + parseFloat(g.monto_base), 0);
        const igv = gastosConIgv.reduce((sum, g) => sum + parseFloat(g.monto_igv), 0);
        const facturasPorPagar = totalGastosConIgv + igv;

        const totalGastosFinancieros = gastosFinancieros.reduce((sum, g) => sum + parseFloat(g.monto), 0);

        return {
            total_remuneraciones: totalRemuneraciones,
            essalud, onp, afp,
            remuneraciones_por_pagar: remuneracionesPorPagar,
            total_gastos_con_igv: totalGastosConIgv,
            igv,
            facturas_por_pagar: facturasPorPagar,
            total_gastos_financieros: totalGastosFinancieros
        };
    }

    // ====== ASIENTO CONTABLE POR CASO ======

    static async generarAsientoContable(
        userId: string,
        casoEstudioId: number,
        tipoGasto?: string
    ): Promise<AsientoContableCompleto> {
        const todosLosGastos = await this.listarPorCaso(userId, casoEstudioId);

        const gastos = tipoGasto
            ? todosLosGastos.filter(g => g.tipo_gasto === tipoGasto)
            : todosLosGastos;

        const detallesDebeParcial: AsientoContableDetalle[] = [];
        const detallesHaberParcial: AsientoContableDetalle[] = [];

        // 🔥 DETECTAR MONEDAS
        const monedasUnicas = new Set(gastos.map(g => g.moneda));

        // ========== PASO 1: DEBE - Agrupar gastos por cuenta y moneda ==========
        const gastosPorCuentaYMoneda = new Map<string, {
            denominacion: string;
            total: number;
            moneda: string
        }>();

        gastos.forEach(gasto => {
            if (!gasto.cuenta_contable) return;
            const key = `${gasto.cuenta_contable}-${gasto.moneda}`;
            if (!gastosPorCuentaYMoneda.has(key)) {
                gastosPorCuentaYMoneda.set(key, {
                    denominacion: gasto.nombre_clasificacion || '',
                    total: 0,
                    moneda: gasto.moneda
                });
            }
            const actual = gastosPorCuentaYMoneda.get(key)!;
            actual.total += parseFloat(gasto.monto_base);
        });

        // Agregar al DEBE
        gastosPorCuentaYMoneda.forEach((valor, key) => {
            if (valor.total === 0) return;
            const codigo = key.split('-')[0];

            detallesDebeParcial.push({
                codigo_cuenta: codigo,
                denominacion: valor.denominacion,
                debe: valor.total,
                haber: 0,
                moneda: valor.moneda
            });

            // ESSALUD para remuneraciones (también en el DEBE)
            if (codigo.startsWith('621')) {
                const essaludGasto = valor.total * 0.09;
                if (essaludGasto === 0) return;

                const essaludCodigo = codigo.replace('621', '627');
                let essaludDenominacion = 'Seguridad, previsión social (ESSALUD)';
                if (codigo.endsWith('.1')) essaludDenominacion += ' operativos';
                else if (codigo.endsWith('.2')) essaludDenominacion += ' administrativas';
                else if (codigo.endsWith('.3')) essaludDenominacion += ' de ventas';

                detallesDebeParcial.push({
                    codigo_cuenta: essaludCodigo,
                    denominacion: essaludDenominacion,
                    debe: essaludGasto,
                    haber: 0,
                    moneda: valor.moneda
                });
            }
        });

        // ========== PASO 2: Calcular tributos y cuentas por pagar POR MONEDA ==========
        const tributosPorMoneda = new Map<string, {
            igv: number;
            essalud: number;
            onp: number;
            afp: number;
            remuneraciones_por_pagar: number;
            facturas_por_pagar: number;
            gastos_financieros: number;
            gastos_sin_igv: number;
        }>();

        // Inicializar
        monedasUnicas.forEach(moneda => {
            tributosPorMoneda.set(moneda, {
                igv: 0,
                essalud: 0,
                onp: 0,
                afp: 0,
                remuneraciones_por_pagar: 0,
                facturas_por_pagar: 0,
                gastos_financieros: 0,
                gastos_sin_igv: 0
            });
        });

        // Calcular dinámicamente
        gastos.forEach(gasto => {
            const moneda = gasto.moneda;
            const tributo = tributosPorMoneda.get(moneda)!;
            const montoBase = parseFloat(gasto.monto_base);
            const montoIgv = parseFloat(gasto.monto_igv);
            const esRemuneracion = gasto.cuenta_contable?.startsWith('621');
            const esEssalud = gasto.cuenta_contable?.startsWith('627');
            const esFinanciero = gasto.cuenta_contable?.startsWith('671');

            // IGV (solo para gastos con IGV que no sean remuneraciones ni financieros)
            if (montoIgv > 0 && !esRemuneracion && !esEssalud && !esFinanciero) {
                tributo.igv += montoIgv;
                tributo.facturas_por_pagar += montoBase + montoIgv;
            }

            // Remuneraciones
            if (esRemuneracion) {
                const essaludCalculado = montoBase * 0.09;
                tributo.essalud += essaludCalculado;

                let descuento = 0;
                if (gasto.tipo_pension === 'ONP') {
                    descuento = montoBase * 0.13;
                    tributo.onp += descuento;
                } else if (gasto.tipo_pension === 'AFP') {
                    descuento = montoBase * 0.1137;
                    tributo.afp += descuento;
                }

                tributo.remuneraciones_por_pagar += montoBase - descuento;
            }

            // Gastos financieros
            if (esFinanciero) {
                tributo.gastos_financieros += montoBase;
            }

            // Gastos sin IGV (no remuneraciones, no essalud, no financieros)
            if (montoIgv === 0 && !esRemuneracion && !esEssalud && !esFinanciero) {
                tributo.gastos_sin_igv += montoBase;
            }
        });

        // ========== PASO 3: DEBE - Agregar IGV ==========
        tributosPorMoneda.forEach((tributo, moneda) => {
            if (tributo.igv > 0) {
                detallesDebeParcial.push({
                    codigo_cuenta: '40111',
                    denominacion: 'IGV - Cuenta propia',
                    debe: tributo.igv,
                    haber: 0,
                    moneda: moneda
                });
            }
        });

        // ========== PASO 4: HABER - Todas las cuentas por pagar ==========
        tributosPorMoneda.forEach((tributo, moneda) => {
            // ESSALUD por pagar
            if (tributo.essalud > 0) {
                detallesHaberParcial.push({
                    codigo_cuenta: '4031',
                    denominacion: 'Instituciones públicas - ESSALUD',
                    debe: 0,
                    haber: tributo.essalud,
                    moneda: moneda
                });
            }

            // ONP
            if (tributo.onp > 0) {
                detallesHaberParcial.push({
                    codigo_cuenta: '4032',
                    denominacion: 'Instituciones públicas - ONP',
                    debe: 0,
                    haber: tributo.onp,
                    moneda: moneda
                });
            }

            // AFP
            if (tributo.afp > 0) {
                detallesHaberParcial.push({
                    codigo_cuenta: '407',
                    denominacion: 'Administradoras de fondos de pensiones',
                    debe: 0,
                    haber: tributo.afp,
                    moneda: moneda
                });
            }

            // Remuneraciones por pagar (netas)
            if (tributo.remuneraciones_por_pagar > 0) {
                detallesHaberParcial.push({
                    codigo_cuenta: '411',
                    denominacion: 'Remuneraciones por pagar',
                    debe: 0,
                    haber: tributo.remuneraciones_por_pagar,
                    moneda: moneda
                });
            }

            // Facturas por pagar (base + IGV)
            if (tributo.facturas_por_pagar > 0) {
                detallesHaberParcial.push({
                    codigo_cuenta: '4211',
                    denominacion: 'Facturas, boletas y otros comprobantes por pagar',
                    debe: 0,
                    haber: tributo.facturas_por_pagar,
                    moneda: moneda
                });
            }

            // Gastos sin IGV (otras cuentas por pagar)
            if (tributo.gastos_sin_igv > 0) {
                detallesHaberParcial.push({
                    codigo_cuenta: '469',
                    denominacion: 'Otras cuentas por pagar diversas',
                    debe: 0,
                    haber: tributo.gastos_sin_igv,
                    moneda: moneda
                });
            }

            // Gastos financieros (caja y bancos)
            if (tributo.gastos_financieros > 0) {
                detallesHaberParcial.push({
                    codigo_cuenta: '101',
                    denominacion: 'Caja y bancos',
                    debe: 0,
                    haber: tributo.gastos_financieros,
                    moneda: moneda
                });
            }
        });

        // ========== PASO 5: CONCATENAR - DEBE primero, HABER después ==========
        const detalles = [...detallesDebeParcial, ...detallesHaberParcial];

        const totalDebe = detalles.reduce((sum, d) => sum + d.debe, 0);
        const totalHaber = detalles.reduce((sum, d) => sum + d.haber, 0);

        return {
            fecha: new Date().toISOString().split('T')[0],
            descripcion: `Asiento por gastos ${tipoGasto ? tipoGasto.toLowerCase() + 's' : ''} del caso #${casoEstudioId}`,
            detalles,
            total_debe: totalDebe,
            total_haber: totalHaber
        };
    }

    // ====== ASIENTO CONTABLE POR GASTO INDIVIDUAL ======

// ====== ASIENTO CONTABLE POR GASTO INDIVIDUAL ======

    static async generarAsientoContablePorGasto(
        userId: string,
        gastoId: number
    ): Promise<AsientoContableCompleto> {
        const getSql = `
            SELECT
                g.*,
                cg.nombre as nombre_clasificacion,
                cg.cuenta_contable,
                cg.tipo_gasto
            FROM
                miaff.gastos g
                    JOIN
                miaff.clasificacion_gastos cg ON g.clasificacion_id = cg.id
            WHERE
                g.id = $1 AND g.user_id = $2 AND g.activo = 1;
        `;
        const { rows } = await dbQuery<GastoDB>(getSql, [gastoId, userId]);

        if (rows.length === 0) {
            throw new Error('Gasto no encontrado');
        }

        const gasto = rows[0];
        const detalles: AsientoContableDetalle[] = [];

        const montoBase = parseFloat(gasto.monto_base);
        const montoIgv = parseFloat(gasto.monto_igv);
        const monedaGasto = gasto.moneda; // 👈 CAPTURAR MONEDA
        const esRemuneracion = gasto.cuenta_contable?.startsWith('621');
        const esFinanciero = gasto.cuenta_contable?.startsWith('671');

        // DEBE: Cuenta de gasto
        detalles.push({
            codigo_cuenta: gasto.cuenta_contable || '',
            denominacion: gasto.nombre_clasificacion || gasto.descripcion,
            debe: montoBase,
            haber: 0,
            moneda: monedaGasto // 👈 INCLUIR MONEDA
        });

        // ===== CASO 1: REMUNERACIONES =====
        if (esRemuneracion) {
            const essalud = montoBase * 0.09;
            const essaludCodigo = gasto.cuenta_contable!.replace('621', '627');

            let essaludDenominacion = 'Seguridad, previsión social (ESSALUD)';
            if (gasto.cuenta_contable?.endsWith('.1')) essaludDenominacion += ' operativos';
            else if (gasto.cuenta_contable?.endsWith('.2')) essaludDenominacion += ' administrativas';
            else if (gasto.cuenta_contable?.endsWith('.3')) essaludDenominacion += ' de ventas';

            // DEBE: ESSALUD
            detalles.push({
                codigo_cuenta: essaludCodigo,
                denominacion: essaludDenominacion,
                debe: essalud,
                haber: 0,
                moneda: monedaGasto // 👈 INCLUIR MONEDA
            });

            // HABER: ESSALUD por pagar
            detalles.push({
                codigo_cuenta: '4031',
                denominacion: 'Instituciones públicas - ESSALUD',
                debe: 0,
                haber: essalud,
                moneda: monedaGasto // 👈 INCLUIR MONEDA
            });

            // HABER: ONP o AFP
            if (gasto.tipo_pension === 'ONP') {
                const onp = montoBase * 0.13;
                detalles.push({
                    codigo_cuenta: '4032',
                    denominacion: 'Instituciones públicas - ONP',
                    debe: 0,
                    haber: onp,
                    moneda: monedaGasto // 👈 INCLUIR MONEDA
                });
            } else if (gasto.tipo_pension === 'AFP') {
                const afp = montoBase * 0.1137;
                detalles.push({
                    codigo_cuenta: '407',
                    denominacion: 'Administradoras de fondos de pensiones',
                    debe: 0,
                    haber: afp,
                    moneda: monedaGasto // 👈 INCLUIR MONEDA
                });
            }

            // HABER: Remuneración por pagar (neta)
            const descuentos = gasto.tipo_pension === 'ONP'
                ? montoBase * 0.13
                : gasto.tipo_pension === 'AFP'
                    ? montoBase * 0.1137
                    : 0;

            detalles.push({
                codigo_cuenta: '411',
                denominacion: 'Remuneraciones por pagar',
                debe: 0,
                haber: montoBase - descuentos,
                moneda: monedaGasto // 👈 INCLUIR MONEDA
            });
        }
        // ===== CASO 2: GASTOS FINANCIEROS =====
        else if (esFinanciero) {
            // HABER: Caja y bancos (gastos financieros se pagan en efectivo)
            detalles.push({
                codigo_cuenta: '101',
                denominacion: 'Caja y bancos',
                debe: 0,
                haber: montoBase, // Financieros no tienen IGV
                moneda: monedaGasto // 👈 INCLUIR MONEDA
            });
        }
        // ===== CASO 3: GASTOS CON IGV =====
        else if (montoIgv > 0) {
            // DEBE: IGV
            detalles.push({
                codigo_cuenta: '40111',
                denominacion: 'IGV - Cuenta propia',
                debe: montoIgv,
                haber: 0,
                moneda: monedaGasto // 👈 INCLUIR MONEDA
            });

            // HABER: Facturas por pagar (base + IGV)
            detalles.push({
                codigo_cuenta: '4211',
                denominacion: 'Facturas, boletas y otros comprobantes por pagar',
                debe: 0,
                haber: montoBase + montoIgv,
                moneda: monedaGasto // 👈 INCLUIR MONEDA
            });
        }
        // ===== CASO 4: GASTOS SIN IGV (ej: alquileres, servicios sin factura) =====
        else {
            // HABER: Otras cuentas por pagar
            detalles.push({
                codigo_cuenta: '469',
                denominacion: 'Otras cuentas por pagar diversas',
                debe: 0,
                haber: montoBase,
                moneda: monedaGasto // 👈 INCLUIR MONEDA
            });
        }

        const totalDebe = detalles.reduce((sum, d) => sum + d.debe, 0);
        const totalHaber = detalles.reduce((sum, d) => sum + d.haber, 0);

        return {
            fecha: gasto.fecha_gasto,
            descripcion: `Asiento del gasto: ${gasto.descripcion}`,
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
    // (Sin cambios - código igual que antes)
    static async guardarDatosFinancieros(
        userId: string,
        data: DatosFinancierosInput
    ): Promise<DatosFinancieros> {
        const { caso_estudio_id, activos_totales, patrimonio, moneda } = data;

        const existeSql = `
            SELECT id FROM miaff.datos_financieros 
            WHERE user_id = $1 AND caso_estudio_id = $2;
        `;
        const { rows: existentes } = await dbQuery<{ id: number }>(
            existeSql,
            [userId, caso_estudio_id]
        );

        if (existentes.length > 0) {
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

    static async calcularRatiosFinancieros(
        userId: string,
        casoEstudioId: number
    ): Promise<RatiosFinancieros | null> {
        const datosFinancieros = await this.obtenerDatosFinancieros(userId, casoEstudioId);
        if (!datosFinancieros) return null;

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

        const gastos = await this.listarPorCaso(userId, casoEstudioId);
        const totalGastos = gastos.reduce((sum, g) => sum + parseFloat(g.monto_base), 0);

        const utilidadBruta = ventasTotalesSinIgv - totalCostos;
        const utilidadOperativa = utilidadBruta - totalGastos;
        const utilidadNeta = utilidadOperativa * 0.705;

        const margenBrutoPorcentaje = ventasTotalesSinIgv > 0
            ? (utilidadBruta / ventasTotalesSinIgv) * 100
            : 0;
        const margenOperativoPorcentaje = ventasTotalesSinIgv > 0
            ? (utilidadOperativa / ventasTotalesSinIgv) * 100
            : 0;
        const margenNetoPorcentaje = ventasTotalesSinIgv > 0
            ? (utilidadNeta / ventasTotalesSinIgv) * 100
            : 0;

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