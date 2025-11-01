// ============================================
// src/validators/quiz.validators.ts
// ============================================

import { z } from 'zod';

export const startQuizSchema = z.object({
    quiz_type: z.enum(['A', 'B']),
    question_count: z.number().int().min(1).max(50),
    seed: z.number().int().optional(),
});

export const completeQuizSchema = z.object({
    attempt_id: z.string().uuid(),
    answers: z.array(
        z.object({
            question_order: z.number().int().min(0),
            question_type: z.enum(['A', 'B']),
            question_data: z.any(),
            user_answer: z.string(),
            correct_answer: z.string(),
            is_correct: z.boolean(),
        })
    ),
});

export type StartQuizDTO = z.infer<typeof startQuizSchema>;
export type CompleteQuizDTO = z.infer<typeof completeQuizSchema>;