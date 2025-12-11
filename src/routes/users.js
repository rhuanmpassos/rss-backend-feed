/**
 * Routes - Users
 * CRUD de usuários
 */

import express from 'express';
import usersController from '../controllers/usersController.js';

const router = express.Router();

// POST /api/users - Criar usuário
router.post('/', usersController.create);

// GET /api/users - Listar todos
router.get('/', usersController.getAll);

// GET /api/users/:id - Buscar por ID
router.get('/:id', usersController.getById);

// GET /api/users/email/:email - Buscar por email
router.get('/email/:email', usersController.getByEmail);

// PUT /api/users/:id - Atualizar
router.put('/:id', usersController.update);

// DELETE /api/users/:id - Deletar
router.delete('/:id', usersController.delete);

// GET /api/users/:id/preferences - Preferências do usuário
router.get('/:id/preferences', usersController.getPreferences);

export default router;
