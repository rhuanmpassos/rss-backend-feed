/**
 * Feed Generator Service
 * Gera feeds RSS e JSON a partir dos artigos do banco
 */

import RSS from 'rss';
import Article from '../models/Article.js';
import Site from '../models/Site.js';
import Category from '../models/Category.js';

const FeedGeneratorService = {
  /**
   * Gera feed RSS de um site
   */
  async generateSiteFeed(siteId, format = 'rss') {
    const site = await Site.findById(siteId);

    if (!site) {
      throw new Error('Site not found');
    }

    const articles = await Article.findAll({
      siteId,
      limit: 100
    });

    const feedData = {
      title: `${site.name} - Feed RSS`,
      description: `Últimas notícias de ${site.name}`,
      feed_url: `${process.env.BASE_URL || 'http://localhost:3000'}/feeds/sites/${siteId}.rss`,
      site_url: site.url,
      language: 'pt-BR',
      pubDate: new Date(),
      ttl: 60
    };

    if (format === 'json') {
      return this.generateJSON(feedData, articles);
    }

    return this.generateRSS(feedData, articles);
  },

  /**
   * Gera feed RSS de uma categoria (usa categorySlug)
   */
  async generateCategoryFeed(categorySlug, format = 'rss') {
    const category = await Category.findBySlug(categorySlug);

    if (!category) {
      throw new Error('Category not found');
    }

    const articles = await Article.findAll({
      categorySlug: categorySlug,  // Usa slug para filtrar
      limit: 100
    });

    const feedData = {
      title: `Notícias - ${category.name}`,
      description: `Feed agregado da categoria ${category.name}`,
      feed_url: `${process.env.BASE_URL || 'http://localhost:3000'}/feeds/categories/${categorySlug}.rss`,
      site_url: process.env.BASE_URL || 'http://localhost:3000',
      language: 'pt-BR',
      pubDate: new Date(),
      ttl: 30
    };

    if (format === 'json') {
      return this.generateJSON(feedData, articles);
    }

    return this.generateRSS(feedData, articles);
  },

  /**
   * Gera feed combinado (todos os sites)
   */
  async generateCombinedFeed(format = 'rss', limit = 200) {
    const articles = await Article.findAll({ limit });

    const feedData = {
      title: 'Feed Agregado de Notícias',
      description: 'Todas as notícias agregadas de múltiplos sites',
      feed_url: `${process.env.BASE_URL || 'http://localhost:3000'}/feeds/all.rss`,
      site_url: process.env.BASE_URL || 'http://localhost:3000',
      language: 'pt-BR',
      pubDate: new Date(),
      ttl: 30
    };

    if (format === 'json') {
      return this.generateJSON(feedData, articles);
    }

    return this.generateRSS(feedData, articles);
  },

  /**
   * Gera XML RSS 2.0
   */
  generateRSS(feedData, articles) {
    const feed = new RSS({
      ...feedData,
      generator: 'RSS Feed Management System',
      custom_namespaces: {
        'media': 'http://search.yahoo.com/mrss/'
      }
    });

    for (const article of articles) {
      const item = {
        title: article.title,
        url: article.url,
        guid: article.url,
        date: article.published_at || article.created_at,
        description: article.summary || article.title,
        categories: article.category_name ? [article.category_name] : []
      };

      // Adiciona imagem
      if (article.image_url) {
        item.enclosure = {
          url: article.image_url,
          type: 'image/jpeg'
        };

        item.custom_elements = [
          { 'media:content': { _attr: { url: article.image_url, type: 'image/jpeg' } } },
          { 'media:thumbnail': { _attr: { url: article.image_url } } }
        ];
      }

      // Adiciona fonte
      if (article.site_name) {
        item.custom_elements = item.custom_elements || [];
        item.custom_elements.push({ 'source': article.site_name });
      }

      feed.item(item);
    }

    return feed.xml({ indent: true });
  },

  /**
   * Gera JSON Feed
   */
  generateJSON(feedData, articles) {
    return JSON.stringify({
      version: 'https://jsonfeed.org/version/1',
      title: feedData.title,
      description: feedData.description,
      home_page_url: feedData.site_url,
      feed_url: feedData.feed_url,
      items: articles.map(article => ({
        id: article.url,
        url: article.url,
        title: article.title,
        content_text: article.summary,
        content_html: article.summary ? `<p>${article.summary}</p>` : null,
        date_published: article.published_at || article.created_at,
        image: article.image_url,
        tags: article.category_name ? [article.category_name] : [],
        _source: article.site_name,
        _category: article.category_name ? {
          id: article.category_id,
          name: article.category_name,
          slug: article.category_slug
        } : null
      }))
    }, null, 2);
  }
};

export default FeedGeneratorService;
