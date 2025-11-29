// ============================================
// src/controllers/quiz.controller.ts (BACKEND)
// ============================================

import { Request, Response } from 'express';
import { QuizService } from '../services/quiz.service';
import { z } from 'zod';

const quizService = new QuizService();

// ✅ Extender el tipo Request para incluir user
interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email?: string;
        [key: string]: any;
    };
}

export class QuizController {
    /**
     * POST /api/quiz/start
     * Inicia un nuevo quiz con preguntas aleatorias
     */
    async startQuiz(req: AuthenticatedRequest, res: Response) {
        try {
            const schema = z.object({
                quiz_type: z.enum(['A', 'B']),
                question_count: z.number().int().min(1).max(50),
                seed: z.number().int().optional(),
            });

            const validated = schema.parse(req.body);
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'No autenticado' });
            }

            // ✅ Genera seed aleatorio si no se proporciona
            const seed = validated.seed || Math.floor(Math.random() * 1000000) + Date.now();

            // Crear attempt en BD con el seed
            const attemptId = await quizService.createQuizAttempt(
                userId,
                validated.quiz_type,
                validated.question_count,
                seed
            );

            // Generar preguntas según el tipo
            let questions;
            if (validated.quiz_type === 'A') {
                questions = await quizService.getRandomQuestionsTypeA(validated.question_count, seed);
            } else {
                questions = await quizService.generateQuestionsTypeB(validated.question_count, seed);
            }

            return res.json({
                attempt_id: attemptId,
                quiz_type: validated.quiz_type,
                questions,
                seed,
            });
        } catch (error: any) {
            console.error('[Quiz Controller] Error en startQuiz:', error);
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
            }
            return res.status(500).json({ error: error.message || 'Error al iniciar quiz' });
        }
    }

    /**
     * POST /api/quiz/complete
     * Completa el quiz y calcula el puntaje
     */
    async completeQuiz(req: AuthenticatedRequest, res: Response) {
        try {
            const schema = z.object({
                attempt_id: z.string().uuid(),
                answers: z.array(
                    z.object({
                        question_order: z.number().int().min(0),
                        question_type: z.enum(['A', 'B']),
                        question_data: z.any(), // Sin "?" - es obligatorio
                        user_answer: z.string(),
                        correct_answer: z.string(),
                        is_correct: z.boolean(),
                    })
                ),
            });

            const validated = schema.parse(req.body);
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'No autenticado' });
            }

            const result = await quizService.completeQuiz(
                validated.attempt_id,
                userId,
                validated.answers as Array<{
                    question_order: number;
                    question_type: 'A' | 'B';
                    question_data: any;
                    user_answer: string;
                    correct_answer: string;
                    is_correct: boolean;
                }>
            );

            return res.json({
                success: true,
                ...result,
            });
        } catch (error: any) {
            console.error('[Quiz Controller] Error en completeQuiz:', error);
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
            }
            return res.status(400).json({ error: error.message || 'Error al completar quiz' });
        }
    }

    /**
     * GET /api/quiz/history
     * Obtiene el historial de quizzes del usuario
     */
    async getHistory(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'No autenticado' });
            }

            const limit = parseInt(req.query.limit as string) || 10;
            const history = await quizService.getUserQuizHistory(userId, limit);

            return res.json({ history });
        } catch (error: any) {
            console.error('[Quiz Controller] Error en getHistory:', error);
            return res.status(500).json({ error: 'Error al obtener historial' });
        }
    }

    /**
     * GET /api/quiz/stats
     * Obtiene estadísticas del usuario
     */
    async getStats(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'No autenticado' });
            }

            const stats = await quizService.getUserStats(userId);

            return res.json({ stats });
        } catch (error: any) {
            console.error('[Quiz Controller] Error en getStats:', error);
            return res.status(500).json({ error: 'Error al obtener estadísticas' });
        }
    }

    /**
     * GET /api/quiz/questions/type-a
     * Obtiene todas las preguntas tipo A (admin)
     */
    async getQuestionsTypeA(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'No autenticado' });
            }

            // Generar un seed temporal solo para obtener las preguntas
            const tempSeed = Date.now();
            const questions = await quizService.getRandomQuestionsTypeA(100, tempSeed);

            return res.json({ questions });
        } catch (error: any) {
            console.error('[Quiz Controller] Error en getQuestionsTypeA:', error);
            return res.status(500).json({ error: 'Error al obtener preguntas' });
        }
    }
}