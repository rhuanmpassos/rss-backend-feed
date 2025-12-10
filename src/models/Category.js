/**
 * Category Model
 * Gerencia categorias de notícias (dinâmicas)
 */

import { query } from '../config/database.js';

const Category = {
  /**
   * Cria uma nova categoria
   * @param {Object} data - { name, slug, description? }
   * @returns {Promise<{id: number, name: string, slug: string}>}
   */
  async create({ name, slug, description = null }) {
    try {
      const result = await query(
        `INSERT INTO categories (name, slug, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [name, slug, description]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao criar categoria:', error);
      throw error;
    }
  },

  /**
   * Busca categoria por ID
   * @param {number} id
   * @returns {Promise<{id: number, name: string, slug: string}|null>}
   */
  async findById(id) {
    const result = await query(
      'SELECT * FROM categories WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  /**
   * Busca todas as categorias
   */
  async findAll() {
    const result = await query(
      'SELECT * FROM categories ORDER BY name ASC',
      []
    );
    return result.rows;
  },

  /**
   * Busca categoria por slug
   */
  async findBySlug(slug) {
    const result = await query(
      'SELECT * FROM categories WHERE slug = $1',
      [slug]
    );
    return result.rows[0];
  },

  /**
   * Busca categoria por nome
   * @param {string} name
   * @returns {Promise<{id: number, name: string, slug: string}|null>}
   */
  async findByName(name) {
    const result = await query(
      'SELECT * FROM categories WHERE name = $1',
      [name]
    );
    return result.rows[0] || null;
  },

  /**
   * Estatísticas de uma categoria (usa category_id)
   */
  async getStats(slug) {
    const result = await query(
      `SELECT 
        c.id,
        c.name,
        c.slug,
        COUNT(a.id) as total_articles,
        COUNT(a.id) FILTER (WHERE a.created_at >= NOW() - INTERVAL '24 hours') as articles_today,
        MAX(a.published_at) as latest_article
       FROM categories c
       LEFT JOIN articles a ON a.category_id = c.id
       WHERE c.slug = $1
       GROUP BY c.id`,
      [slug]
    );
    return result.rows[0];
  },

  /**
   * Lista categorias com contagem de artigos
   */
  async findAllWithCount() {
    const result = await query(
      `SELECT 
        c.*,
        COUNT(a.id) as article_count
       FROM categories c
       LEFT JOIN articles a ON a.category_id = c.id
       GROUP BY c.id
       ORDER BY article_count DESC, c.name ASC`,
      []
    );
    return result.rows;
  }
};

export default Category;
