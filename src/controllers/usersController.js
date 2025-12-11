/**
 * Users Controller
 * CRUD de usuários
 */

import User from '../models/User.js';
import UserCategoryPreference from '../models/UserCategoryPreference.js';

export const usersController = {
  /**
   * POST /api/users
   * Cria ou atualiza usuário (upsert por email)
   * Body: { email: string, name?: string }
   */
  async create(req, res) {
    try {
      const { email, name } = req.body;

      if (!email) {
        return res.status(400).json({ 
          success: false, 
          error: 'email é obrigatório' 
        });
      }

      // Valida formato do email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Formato de email inválido' 
        });
      }

      const user = await User.create({ 
        email: email.toLowerCase().trim(), 
        name: name || email.split('@')[0] 
      });

      res.status(201).json({ 
        success: true, 
        data: user 
      });

    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/users
   * Lista todos os usuários
   */
  async getAll(req, res) {
    try {
      const users = await User.findAll();
      res.json({ 
        success: true, 
        data: users,
        count: users.length 
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/users/:id
   * Busca usuário por ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const user = await User.findById(parseInt(id));

      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'Usuário não encontrado' 
        });
      }

      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/users/email/:email
   * Busca usuário por email
   */
  async getByEmail(req, res) {
    try {
      const { email } = req.params;
      const user = await User.findByEmail(email.toLowerCase().trim());

      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'Usuário não encontrado' 
        });
      }

      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * PUT /api/users/:id
   * Atualiza usuário
   * Body: { name: string }
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ 
          success: false, 
          error: 'name é obrigatório' 
        });
      }

      const user = await User.update(parseInt(id), { name });

      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'Usuário não encontrado' 
        });
      }

      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * DELETE /api/users/:id
   * Deleta usuário
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const deleted = await User.delete(parseInt(id));

      if (!deleted) {
        return res.status(404).json({ 
          success: false, 
          error: 'Usuário não encontrado' 
        });
      }

      res.json({ success: true, message: 'Usuário deletado' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/users/:id/preferences
   * Busca preferências de categoria do usuário
   */
  async getPreferences(req, res) {
    try {
      const { id } = req.params;
      const preferences = await UserCategoryPreference.findByUserId(parseInt(id));
      res.json({ success: true, data: preferences });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export default usersController;
