import {
    DecolectaExchangeRateResponse,
    CachedExchangeRate,
    ExchangeRateInfo,
    Currency
} from '../types/exchangeRate.types';

export class ExchangeRateService {
    private static DECOLECTA_TOKEN = process.env.EXPO_PUBLIC_DECOLECTA_TOKEN;
    private static FALLBACK_RATE = 3.371;
    private static cache: CachedExchangeRate | null = null;
    private static CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 horas

    /**
     * Obtiene el tipo de cambio actual (con caché de 24 horas)
     */
    static async getExchangeRate(): Promise<number> {
        if (this.isCacheValid()) {
            console.log('✅ Usando tipo de cambio desde caché:', this.cache!.rate);
            return this.cache!.rate;
        }

        try {
            console.log('🌐 Obteniendo tipo de cambio desde API Decolecta...');
            const rate = await this.fetchExchangeRate();
            console.log('✅ Tipo de cambio obtenido:', rate);
            return rate;
        } catch (error) {
            console.error('❌ Error obteniendo tipo de cambio, usando fallback:', error);
            return this.FALLBACK_RATE;
        }
    }

    /**
     * Obtiene información completa del tipo de cambio
     */
    static async getExchangeRateInfo(): Promise<ExchangeRateInfo> {
        if (this.isCacheValid()) {
            return {
                rate: this.cache!.rate,
                buyPrice: this.cache!.buyPrice,
                date: this.cache!.date
            };
        }

        try {
            const data = await this.fetchExchangeRateData();
            return {
                rate: data.rate,
                buyPrice: data.buyPrice,
                date: data.date
            };
        } catch (error) {
            console.error('Error obteniendo info de tipo de cambio:', error);
            const today = new Date().toISOString().split('T')[0];
            return {
                rate: this.FALLBACK_RATE,
                buyPrice: this.FALLBACK_RATE,
                date: today
            };
        }
    }

    private static async fetchExchangeRate(): Promise<number> {
        const data = await this.fetchExchangeRateData();
        return data.rate;
    }

    /**
     * Obtiene los datos completos desde la API y PARSEA los strings a números
     */
    private static async fetchExchangeRateData(): Promise<CachedExchangeRate> {
        if (!this.DECOLECTA_TOKEN) {
            throw new Error('DECOLECTA_TOKEN no configurado');
        }

        const response = await fetch(
            'https://api.decolecta.com/v1/tipo-cambio/sbs/average?currency=USD',
            {
                headers: {
                    'Authorization': `Bearer ${this.DECOLECTA_TOKEN}`,
                    'Accept': 'application/json',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`API respondió con estado ${response.status}`);
        }

        // Obtenemos la respuesta cruda (sin forzar el tipo todavía para evitar errores de lógica)
        const rawData = await response.json();

        // 1. CONVERSIÓN EXPLÍCITA:
        // Aunque la API devuelva "3.75" (string), aquí lo forzamos a número float.
        // @ts-ignore
        const sellPrice = parseFloat(String(rawData.sell_price));
        // @ts-ignore
        const buyPrice = parseFloat(String(rawData.buy_price));

        // 2. VALIDACIÓN NUMÉRICA:
        // Usamos isNaN para verificar si la conversión fue exitosa
        if (isNaN(sellPrice) || isNaN(buyPrice)) {
            // @ts-ignore
            throw new Error(`Respuesta de API inválida: sell_price (${rawData.sell_price}) o buy_price (${rawData.buy_price}) no son convertibles a número`);
        }

        // @ts-ignore
        if (!rawData.date) {
            throw new Error('Respuesta de API inválida: falta campo date');
        }

        // Crear objeto de caché con los números ya limpios
        // @ts-ignore

        const cacheData: CachedExchangeRate = {
            rate: sellPrice,
            buyPrice: buyPrice,
            // @ts-ignore
            date: rawData.date,
            timestamp: Date.now()
        };

        this.cache = cacheData;
        return cacheData;
    }

    private static isCacheValid(): boolean {
        if (!this.cache) return false;

        const now = Date.now();
        const cacheAge = now - this.cache.timestamp;

        if (cacheAge > this.CACHE_DURATION) {
            console.log('⏰ Caché de tipo de cambio expirado');
            return false;
        }

        const today = new Date().toISOString().split('T')[0];
        if (this.cache.date !== today) {
            console.log('📅 Caché de tipo de cambio de otro día');
            return false;
        }

        return true;
    }

    static invalidateCache(): void {
        this.cache = null;
        console.log('🗑️ Caché de tipo de cambio invalidado');
    }

    static async convert(
        amount: number,
        from: Currency,
        to: Currency
    ): Promise<number> {
        if (from === to) return amount;

        const rate = await this.getExchangeRate();

        if (from === 'USD' && to === 'PEN') {
            return amount * rate;
        } else if (from === 'PEN' && to === 'USD') {
            return amount / rate;
        }

        return amount;
    }
}