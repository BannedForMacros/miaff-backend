// types/exchangeRate.types.ts

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