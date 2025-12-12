/**
 * Feeds Controller
 * Controlador para endpoints de feeds RSS/JSON
 * 
 * Feed principal: /feeds/addictive (ou /feeds/for-you)
 * - Otimizado para engajamento máximo
 * - Breaking news + Personalizado + Wildcards + Shuffle
 */

import FeedGeneratorService from '../services/feedGeneratorService.js';
import EngagementFeedService from '../services/engagementFeedService.js';
import PredictionService from '../services/predictionService.js';
import PreferenceService from '../services/preferenceService.js';
import Article from '../models/Article.js';
import UserCategoryPreference from '../models/UserCategoryPreference.js';

export const feedsController = {
  /**
   * GET /feeds/chronological
   * GET /feeds/chronological.json
   * Feed cronológico - apenas categorias escolhidas pelo usuário no onboarding
   * Query: user_id (obrigatório), limit, offset
   */
  async getChronologicalFeed(req, res) {
    try {
      const { user_id, limit = 50, offset = 0 } = req.query;

      if (!user_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'user_id é obrigatório para feed cronológico' 
        });
      }

      // Busca categorias escolhidas pelo usuário no onboarding
      // Usa user_category_preferences (tabela de preferências iniciais do onboarding)
      const userCategories = await UserCategoryPreference.findByUserId(parseInt(user_id));

      if (!userCategories || userCategories.length === 0) {
        // Usuário sem preferências - retorna array vazio
        return res.json({ 
          success: true, 
          data: [],
          count: 0,
          feed_type: 'chronological',
          message: 'Usuário ainda não selecionou categorias no onboarding'
        });
      }

      // Extrai IDs das categorias escolhidas
      const categoryIds = userCategories.map(c => c.category_id);

      // Busca artigos apenas dessas categorias, ordenados por data de publicação
      const articles = await Article.findAll({
        categoryIds: categoryIds, // Passa array de IDs
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({ 
        success: true, 
        data: articles,
        count: articles.length,
        feed_type: 'chronological',
        user_categories: userCategories.map(c => c.category_slug)
      });

    } catch (error) {
      console.error('Erro ao gerar feed cronológico:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /feeds/sites/:id.rss
   * GET /feeds/sites/:id.json
   */
  async getSiteFeed(req, res) {
    try {
      const { id } = req.params;
      const format = req.path.endsWith('.json') ? 'json' : 'rss';

      const feed = await FeedGeneratorService.generateSiteFeed(id, format);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
      } else {
        res.setHeader('Content-Type', 'application/rss+xml');
      }

      res.send(feed);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /feeds/categories/:slug.rss
   * GET /feeds/categories/:slug.json
   */
  async getCategoryFeed(req, res) {
    try {
      const { slug } = req.params;
      const format = req.path.endsWith('.json') ? 'json' : 'rss';

      const feed = await FeedGeneratorService.generateCategoryFeed(slug, format);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
      } else {
        res.setHeader('Content-Type', 'application/rss+xml');
      }

      res.send(feed);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /feeds/all.rss
   * GET /feeds/all.json
   */
  async getAllFeed(req, res) {
    try {
      const format = req.path.endsWith('.json') ? 'json' : 'rss';
      const limit = parseInt(req.query.limit) || 200;

      const feed = await FeedGeneratorService.generateCombinedFeed(format, limit);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
      } else {
        res.setHeader('Content-Type', 'application/rss+xml');
      }

      res.send(feed);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // ==================== FEED PRINCIPAL (FOR YOU) ====================

  /**
   * GET /feeds/addictive (ou /feeds/for-you)
   * Feed principal otimizado para máximo engajamento
   * 
   * Features:
   * - 🔴 Breaking news no topo (últimas 2h)
   * - 🎯 Artigos personalizados por predição de clique
   * - 🎲 Wildcards 12% para descoberta de conteúdo novo
   * - 🔀 Shuffle parcial (posições 5-20) para imprevisibilidade
   * 
   * Query: user_id (obrigatório), limit, offset
   */
  async getAddictiveFeed(req, res) {
    try {
      const { user_id, limit = 50, offset = 0 } = req.query;

      if (!user_id) {
        return res.status(400).json({
          success: false,
          error: 'user_id é obrigatório'
        });
      }

      const articles = await EngagementFeedService.getAddictiveFeed(
        parseInt(user_id),
        { limit: parseInt(limit), offset: parseInt(offset) }
      );

      res.json({
        success: true,
        data: articles,
        count: articles.length,
        feed_type: 'for_you',
        offset: parseInt(offset),
        has_more: articles.length === parseInt(limit)
      });

    } catch (error) {
      console.error('Erro ao gerar feed addictive:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /feeds/addictive/more
   * Carrega mais conteúdo para scroll infinito
   * 
   * Query: user_id, offset, limit
   */
  async getMoreContent(req, res) {
    try {
      const { user_id, offset = 0, limit = 30 } = req.query;

      if (!user_id) {
        return res.status(400).json({
          success: false,
          error: 'user_id é obrigatório'
        });
      }

      const articles = await EngagementFeedService.getMoreContent(
        parseInt(user_id),
        parseInt(offset),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: articles,
        count: articles.length,
        offset: parseInt(offset),
        has_more: articles.length === parseInt(limit)
      });

    } catch (error) {
      console.error('Erro ao carregar mais conteúdo:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /feeds/breaking
   * Artigos das últimas 2 horas
   */
  async getBreakingNews(req, res) {
    try {
      const { limit = 10 } = req.query;

      const articles = await EngagementFeedService.getBreakingNews(parseInt(limit));

      res.json({
        success: true,
        data: articles,
        count: articles.length,
        feed_type: 'breaking'
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /feeds/predict
   * Predição de clique para um artigo
   * 
   * Query: user_id, article_id
   */
  async predictClick(req, res) {
    try {
      const { user_id, article_id } = req.query;

      if (!user_id || !article_id) {
        return res.status(400).json({
          success: false,
          error: 'user_id e article_id são obrigatórios'
        });
      }

      const article = await Article.findById(parseInt(article_id));

      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Artigo não encontrado'
        });
      }

      const prediction = await PredictionService.predictClickProbability(
        parseInt(user_id),
        article
      );

      const explanation = PredictionService.explainPrediction(prediction);

      res.json({
        success: true,
        data: {
          ...prediction,
          explanation
        }
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // ==================== PREFERÊNCIAS HIERÁRQUICAS ====================

  /**
   * GET /feeds/preferences/:user_id
   * Busca preferências hierárquicas do usuário (scores relativos)
   */
  async getUserPreferences(req, res) {
    try {
      const { user_id } = req.params;

      if (!user_id) {
        return res.status(400).json({
          success: false,
          error: 'user_id é obrigatório'
        });
      }

      const preferences = await PreferenceService.getUserPreferences(parseInt(user_id));
      const hierarchical = await PreferenceService.getHierarchicalPreferences(parseInt(user_id));

      res.json({
        success: true,
        data: {
          flat: preferences,
          hierarchical
        }
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * POST /feeds/preferences/:user_id/recalculate
   * Recalcula preferências do usuário (normalização + decay + feedback negativo)
   */
  async recalculatePreferences(req, res) {
    try {
      const { user_id } = req.params;

      if (!user_id) {
        return res.status(400).json({
          success: false,
          error: 'user_id é obrigatório'
        });
      }

      const result = await PreferenceService.updateUserPreferences(parseInt(user_id));

      res.json({
        success: true,
        message: `Preferências recalculadas: ${result.updated} categorias`,
        data: result.scores
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export default feedsController;
