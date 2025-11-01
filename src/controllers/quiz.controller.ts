// ============================================
// src/controllers/quiz.controller.ts
// ============================================

import { Request, Response } from 'express';
import { QuizService } from '../services/quiz.service';
import { startQuizSchema, completeQuizSchema } from '../validators/quiz.validators';
import type { JwtUser } from '../utils/token';
import {dbQuery} from "../db";

const quizService = new QuizService();

export class QuizController {
    // POST /api/quiz/start
    async startQuiz(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const body = startQuizSchema.parse(req.body);

            const seed = body.seed || Date.now();
            let questions: any[];

            if (body.quiz_type === 'A') {
                questions = await quizService.getRandomQuestionsTypeA(body.question_count, seed);
            } else {
                questions = await quizService.generateQuestionsTypeB(body.question_count, seed);
            }

            const attemptId = await quizService.createQuizAttempt(user.sub, body.quiz_type, body.question_count);

            res.json({
                attempt_id: attemptId,
                quiz_type: body.quiz_type,
                questions,
                seed,
            });
        } catch (error: any) {
            console.error('Error starting quiz:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // POST /api/quiz/complete
    async completeQuiz(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const body = completeQuizSchema.parse(req.body);

            const result = await quizService.completeQuiz(
                body.attempt_id,
                user.sub,
                body.answers as Array<{
                    question_order: number;
                    question_type: 'A' | 'B';
                    question_data: any;
                    user_answer: string;
                    correct_answer: string;
                    is_correct: boolean;
                }>
            );

            res.json({
                success: true,
                ...result,
            });
        } catch (error: any) {
            console.error('Error completing quiz:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // GET /api/quiz/history
    async getHistory(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const limit = parseInt(req.query.limit as string) || 10;

            const history = await quizService.getUserQuizHistory(user.sub, limit);

            res.json({ history });
        } catch (error: any) {
            console.error('Error getting quiz history:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // GET /api/quiz/stats
    async getStats(req: Request, res: Response) {
        try {
            const user = (req as any).user as JwtUser;
            const stats = await quizService.getUserStats(user.sub);

            res.json({ stats });
        } catch (error: any) {
            console.error('Error getting quiz stats:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // GET /api/quiz/questions/type-a (Admin: ver todas las preguntas)
    async getQuestionsTypeA(req: Request, res: Response) {
        try {
            const { rows } = await dbQuery(
                `SELECT * FROM miaff.questions_type_a ORDER BY code ASC`
            );
            res.json({ questions: rows });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}
