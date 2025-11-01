// types/exchangeRate.types.ts

/**
 * Respuesta de la API de Decolecta
 */
export interface DecolectaExchangeRateResponse {
    sell_price: number;
    buy_price: number;
    date: string;
    currency: string;
    [key: string]: any; // Para otros campos opcionales
}

/**
 * Datos de tipo de cambio almacenados en caché
 */
export interface CachedExchangeRate {
    rate: number;
    buyPrice: number;
    date: string;
    timestamp: number;
}

/**
 * Información de tipo de cambio para respuestas de API
 */
export interface ExchangeRateInfo {
    rate: number;
    buyPrice: number;
    date: string;
}

/**
 * Tipos de moneda soportados
 */
export type Currency = 'USD' | 'PEN';