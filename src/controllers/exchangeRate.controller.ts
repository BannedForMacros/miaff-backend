// controllers/exchangeRate.controller.ts - VERSIÓN FINAL

import { Request, Response } from 'express';
import { ExchangeRateService } from '../services/exchangeRate.service';
import { Currency } from '../types/exchangeRate.types';

export class ExchangeRateController {

    /**
     * GET /api/exchange-rate
     * Obtiene el tipo de cambio actual
     */
    static async getExchangeRate(req: Request, res: Response): Promise<void> {
        try {
            const info = await ExchangeRateService.getExchangeRateInfo();

            res.json({
                success: true,
                data: {
                    rate: info.rate,
                    buy_price: info.buyPrice,
                    date: info.date,
                    message: 'Tipo de cambio actualizado'
                }
            });
        } catch (error: any) {
            console.error('Error obteniendo tipo de cambio:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener tipo de cambio',
                error: error.message
            });
        }
    }

    /**
     * POST /api/exchange-rate/convert
     * Convierte un monto entre monedas
     */
    static async convertCurrency(req: Request, res: Response): Promise<void> {
        try {
            const { amount, from, to } = req.body;

            // Validar parámetros
            if (!amount || !from || !to) {
                res.status(400).json({
                    success: false,
                    message: 'Se requieren los parámetros: amount, from, to'
                });
                return;
            }

            // Validar monedas
            if (!['USD', 'PEN'].includes(from) || !['USD', 'PEN'].includes(to)) {
                res.status(400).json({
                    success: false,
                    message: 'Las monedas deben ser USD o PEN'
                });
                return;
            }

            // Convertir
            const result = await ExchangeRateService.convert(
                parseFloat(amount),
                from as Currency,
                to as Currency
            );

            const info = await ExchangeRateService.getExchangeRateInfo();

            res.json({
                success: true,
                data: {
                    original_amount: parseFloat(amount),
                    original_currency: from,
                    converted_amount: result,
                    converted_currency: to,
                    exchange_rate_used: info.rate,
                    date: info.date
                }
            });
        } catch (error: any) {
            console.error('Error convirtiendo moneda:', error);
            res.status(500).json({
                success: false,
                message: 'Error al convertir moneda',
                error: error.message
            });
        }
    }

    /**
     * DELETE /api/exchange-rate/cache
     * Invalida el caché del tipo de cambio (útil para testing o forzar actualización)
     */
    static invalidateCache(req: Request, res: Response): void {
        try {
            ExchangeRateService.invalidateCache();

            res.json({
                success: true,
                message: 'Caché de tipo de cambio invalidado correctamente'
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: 'Error al invalidar caché',
                error: error.message
            });
        }
    }
}