/**
 * Articles Controller
 */

import Article from '../models/Article.js';
import UserInteraction from '../models/UserInteraction.js';

export const articlesController = {
  /**
   * GET /api/articles
   * Query params: categoryId, categorySlug, siteId, limit, offset
   */
  async getAll(req, res) {
    try {
      const { categoryId, categorySlug, siteId, limit = 50, offset = 0 } = req.query;
      const articles = await Article.findAll({ 
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        categorySlug,
        siteId: siteId ? parseInt(siteId) : undefined,
        limit: parseInt(limit), 
        offset: parseInt(offset) 
      });
      res.json({ success: true, data: articles, count: articles.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async getById(req, res) {
    try {
      const article = await Article.findById(req.params.id);
      if (!article) return res.status(404).json({ success: false, error: 'Artigo não encontrado' });
      res.json({ success: true, data: article });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async getStats(req, res) {
    try {
      const stats = await Article.getStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async getStatsByCategory(req, res) {
    try {
      const stats = await Article.getStatsByCategory();
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * POST /api/articles/:id/bookmark
   * Marca artigo como salvo
   */
  async bookmark(req, res) {
    try {
      const { id } = req.params;
      const article = await Article.bookmark(id);

      if (!article) {
        return res.status(404).json({ success: false, error: 'Artigo não encontrado' });
      }

      res.json({ success: true, message: 'Artigo salvo', data: article });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * DELETE /api/articles/:id/bookmark
   * Remove bookmark do artigo
   */
  async unbookmark(req, res) {
    try {
      const { id } = req.params;
      const article = await Article.unbookmark(id);

      if (!article) {
        return res.status(404).json({ success: false, error: 'Artigo não encontrado' });
      }

      res.json({ success: true, message: 'Bookmark removido', data: article });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/articles/bookmarked
   * Lista artigos salvos
   */
  async getBookmarked(req, res) {
    try {
      const { limit = 100 } = req.query;
      const articles = await Article.findBookmarked(parseInt(limit));

      res.json({ success: true, data: articles, count: articles.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * POST /api/articles/:id/like
   * Adiciona like (estrela) ao artigo
   * Body: { user_id: number }
   */
  async like(req, res) {
    try {
      const { id } = req.params;
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ success: false, error: 'user_id é obrigatório' });
      }

      // Verifica se artigo existe
      const article = await Article.findById(id);
      if (!article) {
        return res.status(404).json({ success: false, error: 'Artigo não encontrado' });
      }

      // Registra como interação do tipo 'like'
      await UserInteraction.create({
        userId: user_id,
        articleId: parseInt(id),
        interactionType: 'like'
      });

      res.json({ 
        success: true, 
        liked: true,
        article_id: parseInt(id),
        message: 'Like adicionado'
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * DELETE /api/articles/:id/like
   * Remove like do artigo
   * Query: user_id
   */
  async unlike(req, res) {
    try {
      const { id } = req.params;
      const { user_id } = req.query;

      if (!user_id) {
        return res.status(400).json({ success: false, error: 'user_id é obrigatório' });
      }

      // Remove interação de like
      await UserInteraction.delete({
        userId: parseInt(user_id),
        articleId: parseInt(id),
        interactionType: 'like'
      });

      res.json({ 
        success: true, 
        liked: false,
        article_id: parseInt(id),
        message: 'Like removido'
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/articles/liked
   * Lista artigos com like do usuário
   * Query: user_id, limit
   */
  async getLiked(req, res) {
    try {
      const { user_id, limit = 100 } = req.query;

      if (!user_id) {
        return res.status(400).json({ success: false, error: 'user_id é obrigatório' });
      }

      const articles = await UserInteraction.findLikedArticles(
        parseInt(user_id), 
        parseInt(limit)
      );

      res.json({ success: true, data: articles, count: articles.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export default articlesController;
