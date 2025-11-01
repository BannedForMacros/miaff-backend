// ============================================
// src/types/quiz.types.ts
// ============================================

export interface QuestionTypeA {
    id: string;
    code: string;
    prompt: string;
    choice_a: string;
    choice_b: string;
    choice_c: string;
    choice_d: string;
    correct_answer: 'A' | 'B' | 'C' | 'D';
    explanation?: string;
    tags?: string[];
}

export interface QuestionTemplateTypeB {
    id: string;
    code: string;
    name: string;
    calculation_config: {
        type: string;
        fob_range: [number, number];
        flete_range: [number, number];
        seguro_range: [number, number];
        arancel_options: number[];
        igv_rate: number;
    };
}

export interface GeneratedQuestionB {
    id: string;
    prompt: string;
    solution: number;
    feedback: string;
    params: {
        FOB: number;
        flete: number;
        seguro: number;
        tasaArancel: number;
        CIF: number;
        arancel: number;
        baseIGV: number;
        igv: number;
    };
}

export interface QuizAttempt {
    id: string;
    user_id: string;
    quiz_type: 'A' | 'B';
    total_questions: number;
    correct_answers: number;
    score_percentage: number;
    is_approved: boolean;
    xp_earned: number;
    started_at: Date;
    completed_at?: Date;
}

export interface QuizAnswer {
    id: string;
    attempt_id: string;
    question_order: number;
    question_type: 'A' | 'B';
    question_data: any;
    user_answer: string;
    correct_answer: string;
    is_correct: boolean;
}