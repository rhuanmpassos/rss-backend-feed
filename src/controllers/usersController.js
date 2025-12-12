/**
 * Users Controller
 * CRUD de usuários
 */

import User from '../models/User.js';
import UserCategoryPreference from '../models/UserCategoryPreference.js';
import PreferenceService from '../services/preferenceService.js';

export const usersController = {
  /**
   * POST /api/users
   * Cria ou atualiza usuário (upsert por email)
   * Body: { email: string, name?: string, initial_categories?: number[] }
   * 
   * initial_categories: Array de IDs de categorias para cold start (onboarding)
   * Exemplo: { email: "user@test.com", name: "User", initial_categories: [1, 2, 5, 6] }
   */
  async create(req, res) {
    try {
      const { email, name, initial_categories } = req.body;

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

      // Se passou categorias iniciais (onboarding/cold start), salva preferências
      // CORRIGIDO: Agora normaliza scores para somar 1.0 (evita saturação)
      if (initial_categories && Array.isArray(initial_categories) && initial_categories.length > 0) {
        const validCategories = initial_categories.slice(0, 6); // Max 6 categorias
        
        // Calcula pesos relativos (primeira categoria selecionada tem mais peso)
        // Pesos: 6, 5, 4, 3, 2, 1 para posições 0, 1, 2, 3, 4, 5
        const weights = validCategories.map((_, i) => validCategories.length - i);
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        
        for (let i = 0; i < validCategories.length; i++) {
          const categoryId = parseInt(validCategories[i]);
          if (!isNaN(categoryId)) {
            // Score normalizado: peso / total (soma de todos = 1.0)
            const normalizedScore = weights[i] / totalWeight;
            
            // Salva na tabela do sistema novo (user_hierarchical_preferences)
            // para consistência com PreferenceService
            await UserCategoryPreference.upsert({
              userId: user.id,
              categoryId,
              preferenceScore: normalizedScore
            });
          }
        }
        
        console.log(`👤 Usuário ${user.id} criado com ${validCategories.length} categorias (scores normalizados, soma=1.0)`);
      }

      // Busca preferências salvas para retornar
      const preferences = await UserCategoryPreference.findByUserId(user.id);

      res.status(201).json({ 
        success: true, 
        data: {
          ...user,
          preferences,
          is_new: preferences.length > 0 ? false : true // indica se precisa de onboarding
        }
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
   * CORRIGIDO: Agora lê de user_hierarchical_preferences (tabela atualizada pelo PreferenceService)
   * Os scores já vêm normalizados (soma = 100%) do PreferenceService
   */
  async getPreferences(req, res) {
    try {
      const { id } = req.params;
      const userId = parseInt(id);
      
      // CORRIGIDO: Lê de user_hierarchical_preferences (tabela atualizada pelo PreferenceService)
      // Esta tabela é atualizada automaticamente quando há clicks via PreferenceService.updateUserPreferences()
      const preferences = await PreferenceService.getUserPreferences(userId, 20);
      
      if (preferences.length === 0) {
        return res.json({ success: true, data: [] });
      }
      
      // Os scores já vêm normalizados do PreferenceService (soma = 100%)
      // Apenas formata para o formato esperado pelo frontend
      const formattedPreferences = preferences.map(pref => ({
        id: pref.id,
        user_id: pref.user_id,
        category_id: pref.category_id,
        category_name: pref.category_name,
        category_slug: pref.category_slug,
        preference_score: parseFloat(pref.preference_score) || 0,
        interaction_count: pref.interaction_count || 0,
        click_count: pref.click_count || 0,
        impression_count: pref.impression_count || 0,
        updated_at: pref.updated_at
      }));
      
      res.json({ success: true, data: formattedPreferences });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * PUT /api/users/:id/preferences
   * Atualiza preferências de categoria do usuário (onboarding ou edição)
   * Body: { categories: number[] } - Array de IDs de categorias (max 6)
   * 
   * Substitui todas as preferências existentes pelas novas
   */
  async updatePreferences(req, res) {
    try {
      const { id } = req.params;
      const { categories } = req.body;
      const userId = parseInt(id);

      if (!categories || !Array.isArray(categories)) {
        return res.status(400).json({ 
          success: false, 
          error: 'categories deve ser um array de IDs' 
        });
      }

      if (categories.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Selecione pelo menos 1 categoria' 
        });
      }

      // Verifica se usuário existe
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'Usuário não encontrado' 
        });
      }

      // Remove preferências antigas
      await UserCategoryPreference.deleteAllByUser(userId);

      // Salva novas preferências (max 6)
      // CORRIGIDO: Agora normaliza scores para somar 1.0 (evita saturação)
      const validCategories = categories.slice(0, 6);
      const savedPreferences = [];
      
      // Calcula pesos relativos (primeira categoria selecionada tem mais peso)
      const weights = validCategories.map((_, i) => validCategories.length - i);
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);

      for (let i = 0; i < validCategories.length; i++) {
        const categoryId = parseInt(validCategories[i]);
        if (!isNaN(categoryId)) {
          // Score normalizado: peso / total (soma de todos = 1.0)
          const normalizedScore = weights[i] / totalWeight;
          const pref = await UserCategoryPreference.upsert({
            userId,
            categoryId,
            preferenceScore: normalizedScore
          });
          savedPreferences.push(pref);
        }
      }

      // Busca preferências completas (com nome da categoria)
      const preferences = await UserCategoryPreference.findByUserId(userId);

      console.log(`👤 Preferências do usuário ${userId} atualizadas: ${preferences.length} categorias (scores normalizados, soma=1.0)`);

      res.json({ 
        success: true, 
        message: `${preferences.length} categorias salvas`,
        data: preferences 
      });

    } catch (error) {
      console.error('Erro ao atualizar preferências:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export default usersController;
