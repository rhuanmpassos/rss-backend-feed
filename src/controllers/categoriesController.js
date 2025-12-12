/**
 * Categories Controller
 * Inclui suporte a hierarquia IPTC
 */

import Category from '../models/Category.js';
import { query } from '../config/database.js';

export const categoriesController = {
  async getAll(req, res) {
    try {
      const categories = await Category.findAll();
      res.json({ success: true, data: categories });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async getBySlug(req, res) {
    try {
      const category = await Category.findBySlug(req.params.slug);
      if (!category) return res.status(404).json({ success: false, error: 'Categoria não encontrada' });
      res.json({ success: true, data: category });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async getStats(req, res) {
    try {
      const stats = await Category.getStats(req.params.slug);
      if (!stats) return res.status(404).json({ success: false, error: 'Categoria não encontrada' });
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/categories/hierarchical
   * Retorna categorias em estrutura hierárquica (IPTC)
   */
  async getHierarchical(req, res) {
    try {
      // Busca todas as categorias com info hierárquica
      const result = await query(`
        SELECT 
          c.id, c.name, c.slug, c.level, c.parent_id, c.path, c.iptc_code, c.description,
          p.name as parent_name, p.slug as parent_slug,
          (SELECT COUNT(*) FROM articles WHERE category_id = c.id) as article_count
        FROM categories c
        LEFT JOIN categories p ON c.parent_id = p.id
        ORDER BY c.level, c.name
      `);

      // Organiza em estrutura de árvore
      const categories = result.rows;
      const byLevel = {
        level1: categories.filter(c => c.level === 1),
        level2: categories.filter(c => c.level === 2),
        level3: categories.filter(c => c.level === 3)
      };

      // Monta árvore
      const tree = byLevel.level1.map(cat1 => ({
        ...cat1,
        children: byLevel.level2
          .filter(cat2 => cat2.parent_id === cat1.id)
          .map(cat2 => ({
            ...cat2,
            children: byLevel.level3.filter(cat3 => cat3.parent_id === cat2.id)
          }))
      }));

      res.json({
        success: true,
        data: {
          flat: categories,
          tree,
          stats: {
            level1: byLevel.level1.length,
            level2: byLevel.level2.length,
            level3: byLevel.level3.length,
            total: categories.length
          }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/categories/:id/children
   * Retorna subcategorias de uma categoria
   */
  async getChildren(req, res) {
    try {
      const { id } = req.params;
      
      const result = await query(`
        SELECT * FROM categories
        WHERE parent_id = $1
        ORDER BY name
      `, [parseInt(id)]);

      res.json({ success: true, data: result.rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/categories/:id/path
   * Retorna caminho completo até a raiz (ancestrais)
   */
  async getPath(req, res) {
    try {
      const { id } = req.params;
      
      const result = await query(`
        WITH RECURSIVE ancestors AS (
          SELECT id, name, slug, level, parent_id
          FROM categories
          WHERE id = $1
          
          UNION ALL
          
          SELECT c.id, c.name, c.slug, c.level, c.parent_id
          FROM categories c
          JOIN ancestors a ON c.id = a.parent_id
        )
        SELECT * FROM ancestors ORDER BY level
      `, [parseInt(id)]);

      res.json({ success: true, data: result.rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export default categoriesController;
