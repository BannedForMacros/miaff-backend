// services/exchangeRate.service.ts - VERSIÓN FINAL SIN ERRORES

import {
    DecolectaExchangeRateResponse,
    CachedExchangeRate,
    ExchangeRateInfo,
    Currency
} from '../types/exchangeRate.types';

export class ExchangeRateService {
    private static DECOLECTA_TOKEN = process.env.EXPO_PUBLIC_DECOLECTA_TOKEN;
    private static FALLBACK_RATE = 3.39;
    private static cache: CachedExchangeRate | null = null;
    private static CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 horas

    /**
     * Obtiene el tipo de cambio actual (con caché de 24 horas)
     */
    static async getExchangeRate(): Promise<number> {
        // Verificar caché
        if (this.isCacheValid()) {
            console.log('✅ Usando tipo de cambio desde caché:', this.cache!.rate);
            return this.cache!.rate;
        }

        // Si no hay caché válido, obtener desde API
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

    /**
     * Obtiene el tipo de cambio desde la API de Decolecta
     */
    private static async fetchExchangeRate(): Promise<number> {
        const data = await this.fetchExchangeRateData();
        return data.rate;
    }

    /**
     * Obtiene los datos completos desde la API
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

        // ✅ SOLUCIÓN: Aserción de tipo explícita
        const data = await response.json() as DecolectaExchangeRateResponse;

        // Validar que tenga los campos requeridos
        if (typeof data.sell_price !== 'number' || typeof data.buy_price !== 'number') {
            throw new Error('Respuesta de API inválida: sell_price o buy_price no son números');
        }

        if (!data.date) {
            throw new Error('Respuesta de API inválida: falta campo date');
        }

        // Crear objeto de caché
        const cacheData: CachedExchangeRate = {
            rate: data.sell_price,
            buyPrice: data.buy_price,
            date: data.date,
            timestamp: Date.now()
        };

        // Guardar en caché
        this.cache = cacheData;

        return cacheData;
    }

    /**
     * Verifica si el caché es válido
     */
    private static isCacheValid(): boolean {
        if (!this.cache) return false;

        const now = Date.now();
        const cacheAge = now - this.cache.timestamp;

        // Verificar que no haya expirado (24 horas)
        if (cacheAge > this.CACHE_DURATION) {
            console.log('⏰ Caché de tipo de cambio expirado');
            return false;
        }

        // Verificar que sea del mismo día
        const today = new Date().toISOString().split('T')[0];
        if (this.cache.date !== today) {
            console.log('📅 Caché de tipo de cambio de otro día');
            return false;
        }

        return true;
    }

    /**
     * Invalida el caché manualmente
     */
    static invalidateCache(): void {
        this.cache = null;
        console.log('🗑️ Caché de tipo de cambio invalidado');
    }

    /**
     * Convierte un monto de una moneda a otra
     */
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