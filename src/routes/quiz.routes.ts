// ============================================
// src/routes/quiz.routes.ts
// ============================================

import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { QuizController } from '../controllers/quiz.controller';

const router = Router();
const quizController = new QuizController();

/**
 * @openapi
 * /api/quiz/start:
 *   post:
 *     tags: [Quiz]
 *     summary: Iniciar un nuevo quiz
 *     description: Crea un nuevo intento de quiz y devuelve las preguntas generadas según el tipo seleccionado
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quiz_type
 *               - question_count
 *             properties:
 *               quiz_type:
 *                 type: string
 *                 enum: [A, B]
 *                 description: Tipo de quiz (A = preguntas de opción múltiple, B = cálculo de DTA)
 *                 example: A
 *               question_count:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 50
 *                 description: Número de preguntas a generar
 *                 example: 10
 *               seed:
 *                 type: integer
 *                 description: Semilla para generación determinística (opcional, se usa timestamp si no se provee)
 *                 example: 1234567890
 *     responses:
 *       200:
 *         description: Quiz iniciado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 attempt_id:
 *                   type: string
 *                   format: uuid
 *                   description: ID del intento de quiz
 *                 quiz_type:
 *                   type: string
 *                   enum: [A, B]
 *                 questions:
 *                   type: array
 *                   items:
 *                     oneOf:
 *                       - type: object
 *                         description: Pregunta tipo A
 *                         properties:
 *                           id:
 *                             type: string
 *                           code:
 *                             type: string
 *                           type:
 *                             type: string
 *                             enum: [A]
 *                           prompt:
 *                             type: string
 *                           choices:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 key:
 *                                   type: string
 *                                   enum: [A, B, C, D]
 *                                 text:
 *                                   type: string
 *                           correct_answer:
 *                             type: string
 *                             enum: [A, B, C, D]
 *                           explanation:
 *                             type: string
 *                           tags:
 *                             type: array
 *                             items:
 *                               type: string
 *                       - type: object
 *                         description: Pregunta tipo B
 *                         properties:
 *                           id:
 *                             type: string
 *                           prompt:
 *                             type: string
 *                           solution:
 *                             type: number
 *                           feedback:
 *                             type: string
 *                           params:
 *                             type: object
 *                 seed:
 *                   type: integer
 *       400:
 *         description: Error de validación
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: No autorizado
 */
router.post('/start', requireAuth, quizController.startQuiz.bind(quizController));

/**
 * @openapi
 * /api/quiz/complete:
 *   post:
 *     tags: [Quiz]
 *     summary: Completar un quiz y recibir XP
 *     description: Registra las respuestas del usuario, calcula el puntaje y otorga XP según el rendimiento
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - attempt_id
 *               - answers
 *             properties:
 *               attempt_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID del intento de quiz obtenido al iniciar
 *                 example: 550e8400-e29b-41d4-a716-446655440000
 *               answers:
 *                 type: array
 *                 description: Array con todas las respuestas del usuario
 *                 items:
 *                   type: object
 *                   required:
 *                     - question_order
 *                     - question_type
 *                     - question_data
 *                     - user_answer
 *                     - correct_answer
 *                     - is_correct
 *                   properties:
 *                     question_order:
 *                       type: integer
 *                       minimum: 0
 *                       description: Orden de la pregunta (0-indexed)
 *                       example: 0
 *                     question_type:
 *                       type: string
 *                       enum: [A, B]
 *                       description: Tipo de pregunta
 *                       example: A
 *                     question_data:
 *                       type: object
 *                       description: Datos completos de la pregunta para referencia
 *                     user_answer:
 *                       type: string
 *                       description: Respuesta del usuario
 *                       example: B
 *                     correct_answer:
 *                       type: string
 *                       description: Respuesta correcta
 *                       example: C
 *                     is_correct:
 *                       type: boolean
 *                       description: Si la respuesta fue correcta
 *                       example: false
 *     responses:
 *       200:
 *         description: Quiz completado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 xp_earned:
 *                   type: integer
 *                   description: XP ganado en este quiz
 *                   example: 150
 *                 is_approved:
 *                   type: boolean
 *                   description: Si aprobó el quiz (>= 70%)
 *                   example: true
 *                 score_percentage:
 *                   type: integer
 *                   description: Porcentaje de respuestas correctas
 *                   example: 80
 *       400:
 *         description: Error de validación o quiz ya completado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: No autorizado
 */
router.post('/complete', requireAuth, quizController.completeQuiz.bind(quizController));

/**
 * @openapi
 * /api/quiz/history:
 *   get:
 *     tags: [Quiz]
 *     summary: Historial de quizzes del usuario
 *     description: Obtiene el historial de intentos de quiz del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Número máximo de registros a retornar
 *     responses:
 *       200:
 *         description: Historial obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       user_id:
 *                         type: string
 *                         format: uuid
 *                       quiz_type:
 *                         type: string
 *                         enum: [A, B]
 *                       total_questions:
 *                         type: integer
 *                       correct_answers:
 *                         type: integer
 *                       score_percentage:
 *                         type: integer
 *                       is_approved:
 *                         type: boolean
 *                       xp_earned:
 *                         type: integer
 *                       started_at:
 *                         type: string
 *                         format: date-time
 *                       completed_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
router.get('/history', requireAuth, quizController.getHistory.bind(quizController));

/**
 * @openapi
 * /api/quiz/stats:
 *   get:
 *     tags: [Quiz]
 *     summary: Estadísticas del usuario
 *     description: Obtiene estadísticas agregadas de todos los quizzes del usuario
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total_quizzes:
 *                       type: integer
 *                       description: Total de quizzes completados
 *                       example: 25
 *                     total_approved:
 *                       type: integer
 *                       description: Total de quizzes aprobados (>= 70%)
 *                       example: 20
 *                     quizzes_type_a:
 *                       type: integer
 *                       description: Quizzes tipo A realizados
 *                       example: 15
 *                     quizzes_type_b:
 *                       type: integer
 *                       description: Quizzes tipo B realizados
 *                       example: 10
 *                     avg_score:
 *                       type: number
 *                       format: float
 *                       description: Promedio de puntaje
 *                       example: 78.5
 *                     best_score:
 *                       type: integer
 *                       description: Mejor puntaje obtenido
 *                       example: 100
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
router.get('/stats', requireAuth, quizController.getStats.bind(quizController));

/**
 * @openapi
 * /api/quiz/questions/type-a:
 *   get:
 *     tags: [Quiz]
 *     summary: Obtener todas las preguntas tipo A
 *     description: Lista todas las preguntas de opción múltiple (tipo A) - Útil para administración
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preguntas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       code:
 *                         type: string
 *                         description: Código único de la pregunta
 *                         example: Q001
 *                       prompt:
 *                         type: string
 *                         description: Enunciado de la pregunta
 *                       choice_a:
 *                         type: string
 *                       choice_b:
 *                         type: string
 *                       choice_c:
 *                         type: string
 *                       choice_d:
 *                         type: string
 *                       correct_answer:
 *                         type: string
 *                         enum: [A, B, C, D]
 *                       explanation:
 *                         type: string
 *                         nullable: true
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: string
 *                         nullable: true
 *                       is_active:
 *                         type: boolean
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
router.get('/questions/type-a', requireAuth, quizController.getQuestionsTypeA.bind(quizController));

export default router;