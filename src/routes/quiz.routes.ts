// ============================================
// src/routes/quiz.routes.ts (BACKEND)
// ============================================

import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { QuizController } from '../controllers/quiz.controller';

const router = Router();
const quizController = new QuizController();

router.post('/start', requireAuth, quizController.startQuiz.bind(quizController));
router.post('/complete', requireAuth, quizController.completeQuiz.bind(quizController));
router.get('/history', requireAuth, quizController.getHistory.bind(quizController));
router.get('/stats', requireAuth, quizController.getStats.bind(quizController));
router.get('/questions/type-a', requireAuth, quizController.getQuestionsTypeA.bind(quizController));

export default router;