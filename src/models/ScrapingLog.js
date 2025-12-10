/**
 * ScrapingLog Model
 * Gerencia logs de scraping
 */

import { query } from '../config/database.js';

const ScrapingLog = {
  /**
   * Cria um log de scraping
   */
  async create({
    siteId,
    status,
    articlesFound = 0,
    errorMessage = null,
    scrapingDuration = 0
  }) {
    const result = await query(
      `INSERT INTO scraping_logs 
       (site_id, status, articles_found, error_message, scraping_duration) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [siteId, status, articlesFound, errorMessage, scrapingDuration]
    );
    return result.rows[0];
  },

  /**
   * Busca logs de um site
   */
  async findBySiteId(siteId, limit = 20) {
    const result = await query(
      `SELECT * FROM scraping_logs 
       WHERE site_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [siteId, limit]
    );
    return result.rows;
  },

  /**
   * Busca logs recentes
   */
  async findRecent(limit = 50) {
    const result = await query(
      `SELECT sl.*, s.name as site_name 
       FROM scraping_logs sl
       JOIN sites s ON sl.site_id = s.id
       ORDER BY sl.created_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  /**
   * Deleta logs antigos
   */
  async deleteOlderThan(days) {
    const result = await query(
      `DELETE FROM scraping_logs 
       WHERE created_at < NOW() - INTERVAL '${days} days'
       RETURNING id`,
      []
    );
    return result.rowCount;
  }
};

export default ScrapingLog;
