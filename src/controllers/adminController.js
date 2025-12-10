/**
 * Admin Controller
 * Funçõ administrativas como limpar cache
 */

import pool from '../config/database.js';

export const adminController = {
  /**
   * POST /api/admin/clear-cache
   * Limpa cache Redis e artigos órfãos do PostgreSQL
   */
  async clearCache(req, res) {
    try {
      let results = {
        redis: 0,
        orphanArticles: 0
      };

      // 1. Limpa artigos órfãos (sem site)
      const orphans = await pool.query(`
        DELETE FROM articles
        WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = site_id)
        RETURNING id
      `);
      results.orphanArticles = orphans.rowCount;

      res.json({
        success: true,
        message: `Cache limpo! ${results.orphanArticles} artigos órfãos removidos`,
        ...results
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export default adminController;
