/**
 * Site Model
 * Gerencia sites de notícias
 */

import { query } from '../config/database.js';

const Site = {
  /**
   * Cria um novo site
   */
  async create({ name, url, category, scrapingInterval = 3600 }) {
    const result = await query(
      `INSERT INTO sites (name, url, category, scraping_interval) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [name, url, category, scrapingInterval]
    );
    return result.rows[0];
  },

  /**
   * Busca todos os sites
   */
  async findAll({ active = null } = {}) {
    let sql = 'SELECT * FROM sites';
    const params = [];

    if (active !== null) {
      sql += ' WHERE active = $1';
      params.push(active);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);
    return result.rows;
  },

  /**
   * Busca site por ID
   */
  async findById(id) {
    const result = await query(
      'SELECT * FROM sites WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  /**
   * Busca site por URL
   */
  async findByUrl(url) {
    const result = await query(
      'SELECT * FROM sites WHERE url = $1',
      [url]
    );
    return result.rows[0];
  },

  /**
   * Atualiza site
   */
  async update(id, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(data[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return null;
    }

    values.push(id);

    const result = await query(
      `UPDATE sites SET ${fields.join(', ')} 
       WHERE id = $${paramCount} 
       RETURNING *`,
      values
    );

    return result.rows[0];
  },

  /**
   * Deleta site e limpa TUDO relacionado
   */
  async delete(id) {
    // Busca artigos do site antes de deletar (para limpar Redis)
    const articlesResult = await query(
      'SELECT url, title FROM articles WHERE site_id = $1',
      [id]
    );

    // Deleta site (CASCADE deleta artigos e logs automaticamente)
    const result = await query(
      'DELETE FROM sites WHERE id = $1 RETURNING *',
      [id]
    );

    // Limpa cache Redis dos artigos desse site
    if (result.rows[0] && articlesResult.rows.length > 0) {
      try {
        const { cache, normalizeUrl, hashTitle } = await import('../config/redis.js');
        const crypto = await import('crypto');

        for (const article of articlesResult.rows) {
          try {
            // Remove cache de URL (usa mesmo hash que ao criar)
            const normalizedUrl = normalizeUrl(article.url);
            const urlHash = crypto.createHash('md5').update(normalizedUrl).digest('hex').slice(0, 16);
            await cache.del(`dedup:url:${urlHash}`);

            // Remove cache de título (usa mesmo hash que ao criar)
            const titleHash = hashTitle(article.title);
            await cache.del(`dedup:title:${titleHash}`);
          } catch (e) {
            // Redis pode não estar disponível, continua
          }
        }

        console.log(`🗑️ Site deletado + ${articlesResult.rows.length} artigos limpos do cache`);
      } catch (e) {
        console.log(`🗑️ Site deletado (cache não disponível)`);
      }
    }

    return result.rows[0];
  },

  /**
   * Busca sites prontos para scrap (baseado no intervalo)
   */
  async findReadyToScrape() {
    const result = await query(
      `SELECT * FROM sites 
       WHERE active = true 
       AND (
         last_scraped_at IS NULL 
         OR EXTRACT(EPOCH FROM (NOW() - last_scraped_at)) >= scraping_interval
       )
       ORDER BY last_scraped_at ASC NULLS FIRST`,
      []
    );
    return result.rows;
  },

  /**
   * Atualiza last_scraped_at
   */
  async updateLastScraped(id) {
    const result = await query(
      'UPDATE sites SET last_scraped_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  },

  /**
   * Estatísticas do site
   */
  async getStats(id) {
    const result = await query(
      `SELECT 
        s.id,
        s.name,
        s.url,
        s.last_scraped_at,
        COUNT(a.id) as total_articles,
        COUNT(a.id) FILTER (WHERE a.created_at >= NOW() - INTERVAL '24 hours') as articles_today,
        MAX(a.published_at) as latest_article_date
       FROM sites s
       LEFT JOIN articles a ON a.site_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [id]
    );
    return result.rows[0];
  }
};

export default Site;
