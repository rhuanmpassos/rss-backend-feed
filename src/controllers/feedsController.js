/**
 * Feeds Controller
 * Controlador para endpoints de feeds RSS/JSON
 */

import FeedGeneratorService from '../services/feedGeneratorService.js';
import RecommendationService from '../services/recommendationService.js';
import Article from '../models/Article.js';

export const feedsController = {
  /**
   * GET /feeds/for-you
   * GET /feeds/for-you.json
   * Feed personalizado "For You" baseado em preferências do usuário
   * Query: user_id (obrigatório), limit
   */
  async getForYouFeed(req, res) {
    try {
      const { user_id, limit = 50 } = req.query;

      if (!user_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'user_id é obrigatório' 
        });
      }

      const articles = await RecommendationService.getForYouFeed(
        parseInt(user_id), 
        parseInt(limit)
      );

      res.json({ 
        success: true, 
        data: articles,
        count: articles.length,
        feed_type: 'for_you'
      });

    } catch (error) {
      console.error('Erro ao gerar feed For You:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /feeds/chronological
   * GET /feeds/chronological.json
   * Feed cronológico (todos os artigos em ordem de publicação)
   * Query: limit, offset, categorySlug
   */
  async getChronologicalFeed(req, res) {
    try {
      const { limit = 50, offset = 0, categorySlug } = req.query;

      const articles = await Article.findAll({
        categorySlug,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({ 
        success: true, 
        data: articles,
        count: articles.length,
        feed_type: 'chronological'
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
  }
};

export default feedsController;
