/**
 * Interactions Routes
 * Rotas para registro de interações do usuário (Implicit Feedback)
 * 
 * ATUALIZADO: Inclui endpoints para sessões e perfil de aprendizado
 */

import { Router } from 'express';
import interactionsController from '../controllers/interactionsController.js';

const router = Router();

// ==================== INTERAÇÕES ====================

/**
 * POST /api/interactions
 * Registra batch de interações do app
 * 
 * Body: {
 *   user_id: number,
 *   session_id?: string,
 *   device_type?: string,
 *   interactions: [{
 *     article_id: number,
 *     interaction_type: 'click' | 'view' | 'scroll_stop' | 'impression',
 *     duration?: number,
 *     position?: number,
 *     scroll_velocity?: number,
 *     screen_position?: string,
 *     viewport_time?: number
 *   }]
 * }
 */
router.post('/', interactionsController.createBatch);

/**
 * POST /api/interactions/single
 * Registra uma única interação (para clicks)
 */
router.post('/single', interactionsController.createSingle);

/**
 * GET /api/interactions/user/:userId
 * Lista interações de um usuário
 * Query: limit, type
 */
router.get('/user/:userId', interactionsController.getByUser);

/**
 * GET /api/interactions/user/:userId/stats
 * Estatísticas de interações do usuário
 */
router.get('/user/:userId/stats', interactionsController.getUserStats);

// ==================== SESSÕES ====================

/**
 * POST /api/sessions
 * Inicia nova sessão do usuário
 * 
 * Body: { user_id: number, device_type?: string, entry_source?: string }
 */
router.post('/sessions', interactionsController.startSession);

/**
 * PUT /api/sessions/:sessionId/end
 * Finaliza uma sessão
 */
router.put('/sessions/:sessionId/end', interactionsController.endSession);

/**
 * GET /api/sessions/user/:userId
 * Lista sessões de um usuário
 */
router.get('/sessions/user/:userId', interactionsController.getUserSessions);

// ==================== PERFIL DO USUÁRIO ====================

/**
 * GET /api/users/:userId/profile
 * Retorna perfil simplificado do usuário
 */
router.get('/users/:userId/profile', interactionsController.getUserProfile);

/**
 * GET /api/users/:userId/profile/full
 * Retorna perfil completo (admin/debug)
 */
router.get('/users/:userId/profile/full', interactionsController.getFullProfile);

/**
 * GET /api/users/:userId/patterns
 * Retorna análise de padrões de comportamento
 */
router.get('/users/:userId/patterns', interactionsController.getUserPatterns);

/**
 * POST /api/users/:userId/profile/recalculate
 * Força recálculo do perfil do usuário
 */
router.post('/users/:userId/profile/recalculate', interactionsController.recalculateProfile);

export default router;

