import { dbQuery } from '../db';
import {
    ExchangeRateInfo,
    Currency
} from '../types/exchangeRate.types';

interface DBExchangeRateRow {
    buy_price: string;
    sell_price: string;
    date: string;
}

// Caché en memoria: fecha -> datos
const memoryCache = new Map<string, ExchangeRateInfo & { timestamp: number }>();

export class ExchangeRateService {
    private static DECOLECTA_TOKEN = process.env.EXPO_PUBLIC_DECOLECTA_TOKEN;
    // Sin fallback hardcodeado — si falla todo, el error se propaga
    private static tableReady = false;

    // Crea la tabla si no existe (se llama una sola vez)
    private static async ensureTable(): Promise<void> {
        if (this.tableReady) return;
        await dbQuery(`
            CREATE TABLE IF NOT EXISTS miaff.exchange_rates (
                id         SERIAL PRIMARY KEY,
                currency   VARCHAR(3)      NOT NULL DEFAULT 'USD',
                buy_price  NUMERIC(10, 6)  NOT NULL,
                sell_price NUMERIC(10, 6)  NOT NULL,
                date       DATE            NOT NULL,
                created_at TIMESTAMPTZ     DEFAULT NOW(),
                UNIQUE (currency, date)
            )
        `);
        this.tableReady = true;
    }

    static async getExchangeRate(date?: string): Promise<number> {
        const info = await this.getExchangeRateInfo(date);
        return info.rate;
    }

    /**
     * Flujo: caché en memoria → tabla DB → API Decolecta → fallback
     */
    static async getExchangeRateInfo(date?: string): Promise<ExchangeRateInfo> {
        await this.ensureTable();
        const targetDate = date || new Date().toISOString().split('T')[0];

        // 1. Caché en memoria
        const cached = memoryCache.get(targetDate);
        if (cached) {
            console.log(`✅ T/C ${targetDate} desde caché en memoria`);
            return { rate: cached.rate, buyPrice: cached.buyPrice, date: cached.date };
        }

        // 2. Consulta en tabla de la BD
        try {
            const { rows } = await dbQuery<DBExchangeRateRow>(
                `SELECT buy_price, sell_price, date
                 FROM miaff.exchange_rates
                 WHERE currency = 'USD' AND date = $1
                 LIMIT 1`,
                [targetDate]
            );
            if (rows.length > 0) {
                const info: ExchangeRateInfo = {
                    rate:     parseFloat(rows[0].sell_price),
                    buyPrice: parseFloat(rows[0].buy_price),
                    date:     rows[0].date,
                };
                memoryCache.set(targetDate, { ...info, timestamp: Date.now() });
                console.log(`✅ T/C ${targetDate} desde base de datos`);
                return info;
            }
        } catch (dbError) {
            console.error('Error consultando DB para T/C:', dbError);
        }

        // 3. Llamada a la API de Decolecta
        try {
            console.log(`🌐 Obteniendo T/C ${targetDate} desde Decolecta...`);
            const info = await this.fetchFromDecolecta(targetDate);

            // Guardar en BD
            try {
                await dbQuery(
                    `INSERT INTO miaff.exchange_rates (currency, buy_price, sell_price, date)
                     VALUES ('USD', $1, $2, $3)
                     ON CONFLICT (currency, date) DO NOTHING`,
                    [info.buyPrice, info.rate, info.date]
                );
                console.log(`✅ T/C ${info.date} guardado en base de datos`);
            } catch (saveError) {
                console.error('Error guardando T/C en DB:', saveError);
            }

            memoryCache.set(info.date, { ...info, timestamp: Date.now() });
            return info;
        } catch (error) {
            console.error(`❌ Error obteniendo T/C desde Decolecta para ${targetDate}:`, error);
            throw new Error(`No se pudo obtener el tipo de cambio para ${targetDate}`);
        }
    }

    private static async fetchFromDecolecta(date?: string): Promise<ExchangeRateInfo> {
        if (!this.DECOLECTA_TOKEN) {
            throw new Error('DECOLECTA_TOKEN no configurado en el servidor');
        }

        const baseUrl = 'https://api.decolecta.com/v1/tipo-cambio/sbs/average?currency=USD';
        const url = date ? `${baseUrl}&date=${date}` : baseUrl;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.DECOLECTA_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Decolecta respondió con estado ${response.status}`);
        }

        const raw = await response.json() as Record<string, unknown>;
        const sellPrice = parseFloat(String(raw['sell_price']));
        const buyPrice  = parseFloat(String(raw['buy_price']));

        if (isNaN(sellPrice) || isNaN(buyPrice)) {
            throw new Error(`Respuesta inválida: sell_price=${raw['sell_price']}, buy_price=${raw['buy_price']}`);
        }
        if (!raw['date']) {
            throw new Error('Respuesta inválida: falta campo date');
        }

        return { rate: sellPrice, buyPrice, date: String(raw['date']) };
    }

    static invalidateCache(date?: string): void {
        if (date) {
            memoryCache.delete(date);
            console.log(`🗑️ Caché T/C del día ${date} invalidado`);
        } else {
            memoryCache.clear();
            console.log('🗑️ Caché T/C completo invalidado');
        }
    }

    static async convert(amount: number, from: Currency, to: Currency): Promise<number> {
        if (from === to) return amount;
        const rate = await this.getExchangeRate();
        if (from === 'USD' && to === 'PEN') return amount * rate;
        if (from === 'PEN' && to === 'USD') return amount / rate;
        return amount;
    }
}
