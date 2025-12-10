import Site from '../models/Site.js';
import Article from '../models/Article.js';
import ScraperService from '../services/scraperService.js';

export const sitesController = {
  /**
   * GET /api/sites
   * Lista todos os sites
   */
  async getAll(req, res) {
    try {
      const { active } = req.query;
      const sites = await Site.findAll({
        active: active !== undefined ? active === 'true' : null
      });

      res.json({ success: true, data: sites });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/sites/:id
   * Obtém detalhes de um site
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const site = await Site.findById(id);

      if (!site) {
        return res.status(404).json({ success: false, error: 'Site não encontrado' });
      }

      res.json({ success: true, data: site });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/sites/:id/stats
   * Estatísticas de um site
   */
  async getStats(req, res) {
    try {
      const { id } = req.params;
      const stats = await Site.getStats(id);

      if (!stats) {
        return res.status(404).json({ success: false, error: 'Site não encontrado' });
      }

      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * POST /api/sites
   * Cria novo site e força scraping imediato em background
   */
  async create(req, res) {
    try {
      const { name, url, category, scrapingInterval } = req.body;

      if (!name || !url) {
        return res.status(400).json({
          success: false,
          error: 'Nome e URL são obrigatórios'
        });
      }

      // Verifica se URL já existe
      const existing = await Site.findByUrl(url);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Site já cadastrado'
        });
      }

      const site = await Site.create({ name, url, category, scrapingInterval });

      // Força scraping imediato em background (não bloqueia resposta)
      // Artigos serão enviados via SSE conforme são classificados
      setImmediate(async () => {
        try {
          console.log(`🚀 Iniciando scraping automático para novo site: ${site.name}`);
          await ScraperService.scrapeSite(site.id);
          console.log(`✅ Scraping automático concluído: ${site.name}`);
        } catch (error) {
          console.error(`❌ Erro no scraping automático de ${site.name}:`, error.message);
        }
      });

      res.status(201).json({ 
        success: true, 
        data: site,
        message: 'Site criado! Scraping iniciado em background - artigos aparecerão em tempo real via SSE'
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * POST /api/sites/test
   * Testa scraping de uma URL (sem salvar site)
   */
  async testScrape(req, res) {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL é obrigatória'
        });
      }

      const result = await ScraperService.testScrape(url);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * PUT /api/sites/:id
   * Atualiza site
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const site = await Site.update(id, updates);

      if (!site) {
        return res.status(404).json({ success: false, error: 'Site não encontrado' });
      }

      res.json({ success: true, data: site });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * DELETE /api/sites/:id
   * Remove site
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const site = await Site.delete(id);

      if (!site) {
        return res.status(404).json({ success: false, error: 'Site não encontrado' });
      }

      res.json({ success: true, message: 'Site removido' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * POST /api/sites/:id/scrape
   * Força scraping imediato
   */
  async forceScrape(req, res) {
    try {
      const { id } = req.params;

      // Executa scraping
      const result = await ScraperService.scrapeSite(id);

      res.json({
        success: true,
        message: 'Scraping concluído',
        data: result
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/sites/:id/articles
   * Artigos de um site
   */
  async getArticles(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const articles = await Article.findAll({
        siteId: id,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({ success: true, data: articles, count: articles.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export default sitesController;
