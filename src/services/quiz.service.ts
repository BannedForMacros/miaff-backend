// ============================================
// src/services/quiz.service.ts (BACKEND)
// ============================================

import { dbQuery } from '../db';
import type { QuestionTypeA, QuestionTemplateTypeB, GeneratedQuestionB, QuizAttempt } from '../types/quiz.types';

// Generador de números aleatorios determinístico (mejorado)
function xorshift32(seed: number) {
    let x = seed >>> 0;
    return () => {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        return (x >>> 0) / 0xffffffff;
    };
}

// Función para barajar array con Fisher-Yates
function shuffleArray<T>(arr: T[], rng: () => number): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export class QuizService {
    // ✅ Obtener preguntas tipo A aleatorias CON SHUFFLE COMPLETO
    async getRandomQuestionsTypeA(count: number, seed: number): Promise<any[]> {
        const { rows } = await dbQuery<QuestionTypeA>(
            `SELECT id, code, prompt, choice_a, choice_b, choice_c, choice_d, correct_answer, explanation, tags
             FROM miaff.questions_type_a
             WHERE is_active = true`
        );

        if (rows.length === 0) {
            throw new Error('No hay preguntas tipo A disponibles');
        }

        // ✅ SHUFFLE DE PREGUNTAS: para que salgan en orden aleatorio
        const rng = xorshift32(seed);
        const shuffledQuestions = shuffleArray(rows, rng);
        const selected = shuffledQuestions.slice(0, Math.min(count, shuffledQuestions.length));

        return selected.map((q) => {
            // ✅ SHUFFLE DE OPCIONES: para que las opciones también estén en orden aleatorio
            const choices = [
                { key: 'A', text: q.choice_a },
                { key: 'B', text: q.choice_b },
                { key: 'C', text: q.choice_c },
                { key: 'D', text: q.choice_d },
            ];

            // Crear nuevo RNG para cada pregunta
            const choiceRng = xorshift32(seed + parseInt(q.id.replace(/-/g, '').slice(0, 8), 16));
            const shuffledChoices = shuffleArray(choices, choiceRng);

            // Encontrar la nueva key de la respuesta correcta
            const correctIndex = ['A', 'B', 'C', 'D'].indexOf(q.correct_answer);
            const correctText = choices[correctIndex].text;
            const correctChoice = shuffledChoices.find((c) => c.text === correctText);

            return {
                id: q.id,
                code: q.code,
                type: 'A',
                prompt: q.prompt,
                choices: shuffledChoices,
                correct_answer: correctChoice?.key || 'A',
                explanation: q.explanation,
                tags: q.tags,
            };
        });
    }

    // Generar preguntas tipo B dinámicamente
    async generateQuestionsTypeB(count: number, seed: number): Promise<GeneratedQuestionB[]> {
        const { rows } = await dbQuery<QuestionTemplateTypeB>(
            `SELECT id, code, name, calculation_config
             FROM miaff.question_templates_type_b
             WHERE is_active = true
                 LIMIT 1`
        );

        if (rows.length === 0) {
            throw new Error('No hay plantillas tipo B disponibles');
        }

        const template = rows[0];
        const config = template.calculation_config;
        const questions: GeneratedQuestionB[] = [];

        for (let i = 0; i < count; i++) {
            const rng = xorshift32(seed + i);

            const FOB = config.fob_range[0] + Math.floor(rng() * (config.fob_range[1] - config.fob_range[0]));
            const flete = config.flete_range[0] + Math.floor(rng() * (config.flete_range[1] - config.flete_range[0]));
            const seguro = config.seguro_range[0] + Math.floor(rng() * (config.seguro_range[1] - config.seguro_range[0]));
            const tasaArancel = config.arancel_options[Math.floor(rng() * config.arancel_options.length)];

            const CIF = FOB + flete + seguro;
            const arancel = CIF * tasaArancel;
            const baseIGV = CIF + arancel;
            const igv = baseIGV * config.igv_rate;
            const DTA = Math.round(arancel + igv);

            questions.push({
                id: `B-${seed}-${i}`,
                prompt:
                    `FOB $${FOB.toLocaleString()} · Flete $${flete} · Seguro $${seguro} · ` +
                    `Ad Valorem ${(tasaArancel * 100).toFixed(0)}% · IGV 18%.\n` +
                    `¿Cuál es la DTA total? (Redondea al entero más cercano, sin decimales).`,
                solution: DTA,
                feedback:
                    `CIF=${CIF.toFixed(2)}; Arancel=${arancel.toFixed(2)}; ` +
                    `Base IGV=${baseIGV.toFixed(2)}; IGV=${igv.toFixed(2)};\n` +
                    `DTA = ${arancel.toFixed(2)} + ${igv.toFixed(2)} = ${(arancel + igv).toFixed(2)} ≈ ${DTA}.`,
                params: { FOB, flete, seguro, tasaArancel, CIF, arancel, baseIGV, igv },
            });
        }

        return questions;
    }

    // Calcular XP ganado
    calculateXP(correctAnswers: number, totalQuestions: number, isApproved: boolean): number {
        const xpPerQuestion = 10;
        const baseXP = correctAnswers * xpPerQuestion;
        const approvalBonus = isApproved ? 50 : 0;
        const perfectBonus = correctAnswers === totalQuestions ? 100 : 0;

        return baseXP + approvalBonus + perfectBonus;
    }

    // Crear intento de quiz
    async createQuizAttempt(userId: string, quizType: 'A' | 'B', totalQuestions: number, seed: number): Promise<string> {
        const { rows } = await dbQuery<{ id: string }>(
            `INSERT INTO miaff.quiz_attempts (user_id, quiz_type, total_questions, correct_answers, score_percentage, is_approved, xp_earned, seed)
             VALUES ($1, $2, $3, 0, 0, false, 0, $4)
                 RETURNING id`,
            [userId, quizType, totalQuestions, seed]
        );

        return rows[0].id;
    }

    // Completar quiz
    async completeQuiz(
        attemptId: string,
        userId: string,
        answers: Array<{
            question_order: number;
            question_type: 'A' | 'B';
            question_data: any;
            user_answer: string;
            correct_answer: string;
            is_correct: boolean;
        }>
    ): Promise<{ xp_earned: number; is_approved: boolean; score_percentage: number }> {
        const { rows: attempts } = await dbQuery<QuizAttempt>(
            `SELECT * FROM miaff.quiz_attempts WHERE id = $1 AND user_id = $2`,
            [attemptId, userId]
        );

        if (attempts.length === 0) {
            throw new Error('Intento de quiz no encontrado');
        }

        const attempt = attempts[0];

        if (attempt.completed_at) {
            throw new Error('Este quiz ya fue completado');
        }

        for (const answer of answers) {
            await dbQuery(
                `INSERT INTO miaff.quiz_answers (attempt_id, question_order, question_type, question_data, user_answer, correct_answer, is_correct)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    attemptId,
                    answer.question_order,
                    answer.question_type,
                    JSON.stringify(answer.question_data),
                    answer.user_answer,
                    answer.correct_answer,
                    answer.is_correct,
                ]
            );
        }

        const correctAnswers = answers.filter((a) => a.is_correct).length;
        const totalQuestions = answers.length;
        const scorePercentage = Math.round((correctAnswers / totalQuestions) * 100);
        const isApproved = scorePercentage >= 70;
        const xpEarned = this.calculateXP(correctAnswers, totalQuestions, isApproved);

        await dbQuery(
            `UPDATE miaff.quiz_attempts
             SET correct_answers = $1,
                 score_percentage = $2,
                 is_approved = $3,
                 xp_earned = $4,
                 completed_at = NOW()
             WHERE id = $5`,
            [correctAnswers, scorePercentage, isApproved, xpEarned, attemptId]
        );

        await dbQuery(
            `UPDATE miaff.user_profile
             SET xp = xp + $1,
                 total_quizzes = total_quizzes + 1,
                 total_approved = total_approved + $2,
                 updated_at = NOW()
             WHERE user_id = $3`,
            [xpEarned, isApproved ? 1 : 0, userId]
        );

        return { xp_earned: xpEarned, is_approved: isApproved, score_percentage: scorePercentage };
    }

    // Obtener historial de quizzes
    async getUserQuizHistory(userId: string, limit = 10): Promise<QuizAttempt[]> {
        const { rows } = await dbQuery<QuizAttempt>(
            `SELECT * FROM miaff.quiz_attempts
             WHERE user_id = $1
             ORDER BY created_at DESC
                 LIMIT $2`,
            [userId, limit]
        );

        return rows;
    }

    // Obtener estadísticas del usuario
    async getUserStats(userId: string) {
        const { rows } = await dbQuery(
            `SELECT
                 COUNT(*) as total_quizzes,
                 COUNT(*) FILTER (WHERE is_approved = true) as total_approved,
                 COUNT(*) FILTER (WHERE quiz_type = 'A') as quizzes_type_a,
                 COUNT(*) FILTER (WHERE quiz_type = 'B') as quizzes_type_b,
                 ROUND(AVG(score_percentage), 2) as avg_score,
                 MAX(score_percentage) as best_score
             FROM miaff.quiz_attempts
             WHERE user_id = $1 AND completed_at IS NOT NULL`,
            [userId]
        );

        return rows[0] || {
            total_quizzes: 0,
            total_approved: 0,
            quizzes_type_a: 0,
            quizzes_type_b: 0,
            avg_score: 0,
            best_score: 0,
        };
    }
}