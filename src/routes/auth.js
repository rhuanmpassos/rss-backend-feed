/**
 * Routes - Autenticação
 * Registro, Login e gestão de sessão JWT
 */

import express from 'express';
import authController from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Registra novo usuário
 * Body: { email, password, name? }
 */
router.post('/register', authController.register);

/**
 * POST /api/auth/login
 * Login de usuário
 * Body: { email, password }
 */
router.post('/login', authController.login);

/**
 * GET /api/auth/me
 * Retorna dados do usuário autenticado
 * Header: Authorization: Bearer <token>
 */
router.get('/me', requireAuth, authController.me);

/**
 * POST /api/auth/refresh
 * Renova o token JWT
 * Header: Authorization: Bearer <token>
 */
router.post('/refresh', requireAuth, authController.refresh);

/**
 * PUT /api/auth/password
 * Atualiza senha do usuário
 * Header: Authorization: Bearer <token>
 * Body: { currentPassword, newPassword }
 */
router.put('/password', requireAuth, authController.updatePassword);

export default router;




