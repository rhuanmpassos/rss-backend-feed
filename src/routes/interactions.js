/**
 * Interactions Routes
 * Rotas para registro de interações do usuário (Implicit Feedback)
 */

import { Router } from 'express';
import interactionsController from '../controllers/interactionsController.js';

const router = Router();

/**
 * POST /api/interactions
 * Registra batch de interações do app
 * 
 * Body: {
 *   user_id: number,
 *   interactions: [{
 *     article_id: number,
 *     interaction_type: 'click' | 'view' | 'scroll_stop' | 'impression',
 *     duration?: number,
 *     position?: number
 *   }]
 * }
 */
router.post('/', interactionsController.createBatch);

/**
 * POST /api/interactions/single
 * Registra uma única interação (para clicks)
 * 
 * Body: {
 *   user_id: number,
 *   article_id: number,
 *   interaction_type: string,
 *   duration?: number,
 *   position?: number
 * }
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

export default router;

