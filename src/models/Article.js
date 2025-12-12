/**
 * Article Model
 * Gerencia artigos/notícias
 * Usa category_id (FK) ao invés de category (string)
 */

import { query } from '../config/database.js';

const Article = {
  /**
   * Cria um novo artigo
   * NOTA: category_id pode ser null (artigo será classificado depois)
   */
  async create({
    siteId,
    title,
    url,
    summary,
    content,
    imageUrl,
    author,
    publishedAt,
    categoryId = null,
    categoryConfidence = null
  }) {
    try {
      const result = await query(
        `INSERT INTO articles 
         (site_id, title, url, summary, content, image_url, author, published_at, category_id, category_confidence) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
         ON CONFLICT (url) DO UPDATE 
         SET title = EXCLUDED.title,
             summary = EXCLUDED.summary,
             content = EXCLUDED.content,
             image_url = EXCLUDED.image_url
         RETURNING *`,
        [siteId, title, url, summary, content, imageUrl, author, publishedAt, categoryId, categoryConfidence]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating article:', error);
      throw error;
    }
  },

  /**
   * Busca artigos com filtros
   * @param {Object} options - { siteId, categoryId, categorySlug, limit, offset }
   */
  async findAll({ siteId, categoryId, categoryIds, categorySlug, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT a.*, 
             s.name as site_name, 
             s.url as site_url,
             c.id as category_id,
             c.name as category_name,
             c.slug as category_slug
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (siteId) {
      sql += ` AND a.site_id = $${paramCount}`;
      params.push(siteId);
      paramCount++;
    }

    // CORRIGIDO: Suporta array de categoryIds (para feed cronológico com múltiplas categorias)
    if (categoryIds && Array.isArray(categoryIds) && categoryIds.length > 0) {
      sql += ` AND a.category_id = ANY($${paramCount})`;
      params.push(categoryIds);
      paramCount++;
    } else if (categoryId) {
      // Mantém compatibilidade com categoryId singular
      sql += ` AND a.category_id = $${paramCount}`;
      params.push(categoryId);
      paramCount++;
    }

    if (categorySlug) {
      sql += ` AND c.slug = $${paramCount}`;
      params.push(categorySlug);
      paramCount++;
    }

    sql += ` ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC`;
    sql += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  },

  /**
   * Busca artigos por múltiplas categorias (para Feed "For You")
   * @param {Array<number>} categoryIds - Array de IDs de categorias
   * @param {number} limit
   */
  async findByCategoryIds(categoryIds, limit = 50) {
    if (!categoryIds || categoryIds.length === 0) {
      return this.findAll({ limit });
    }

    const result = await query(
      `SELECT a.*, 
              s.name as site_name, 
              s.url as site_url,
              c.id as category_id,
              c.name as category_name,
              c.slug as category_slug
       FROM articles a
       JOIN sites s ON a.site_id = s.id
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.category_id = ANY($1)
       ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
       LIMIT $2`,
      [categoryIds, limit]
    );
    return result.rows;
  },

  /**
   * Busca artigo por ID (com dados da categoria)
   */
  async findById(id) {
    const result = await query(
      `SELECT a.*, 
              s.name as site_name, 
              s.url as site_url,
              c.id as category_id,
              c.name as category_name,
              c.slug as category_slug
       FROM articles a
       JOIN sites s ON a.site_id = s.id
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * Busca múltiplos artigos por IDs
   * @param {number[]} ids - Array de IDs de artigos
   * @returns {Array} Artigos encontrados (apenas os que existem)
   */
  async findByIds(ids) {
    if (!ids || ids.length === 0) return [];
    
    const result = await query(
      `SELECT id FROM articles WHERE id = ANY($1)`,
      [ids]
    );
    return result.rows;
  },

  /**
   * Busca artigos não categorizados (category_id IS NULL)
   */
  async findUncategorized(limit = 100) {
    const result = await query(
      `SELECT a.*, s.name as site_name
       FROM articles a
       JOIN sites s ON a.site_id = s.id
       WHERE a.category_id IS NULL 
       ORDER BY a.created_at ASC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  /**
   * Atualiza categoria de um artigo (usa category_id)
   * Retorna artigo com site_name e dados da categoria (necessário para SSE/Gateway)
   * @param {number} id - ID do artigo
   * @param {number} categoryId - ID da categoria
   * @param {number} confidence - Confiança da classificação (0-1)
   */
  async updateCategory(id, categoryId, confidence) {
    const result = await query(
      `UPDATE articles 
       SET category_id = $1, category_confidence = $2 
       WHERE id = $3 
       RETURNING *, 
         (SELECT name FROM sites WHERE id = articles.site_id) as site_name`,
      [categoryId, confidence, id]
    );
    return result.rows[0];
  },

  /**
   * Busca artigo com categoria completa (para SSE)
   * @param {number} id
   */
  async findByIdWithCategory(id) {
    const result = await query(
      `SELECT a.*, 
              s.name as site_name,
              c.id as "category.id",
              c.name as "category.name",
              c.slug as "category.slug"
       FROM articles a
       JOIN sites s ON a.site_id = s.id
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.id = $1`,
      [id]
    );
    
    if (!result.rows[0]) return null;
    
    const row = result.rows[0];
    // Formata categoria como objeto
    return {
      ...row,
      category: row['category.id'] ? {
        id: row['category.id'],
        name: row['category.name'],
        slug: row['category.slug']
      } : null
    };
  },

  /**
   * Atualiza embedding de um artigo
   * @param {number} id - ID do artigo
   * @param {number[]} embedding - Vetor de embedding (384 dimensões)
   */
  async updateEmbedding(id, embedding) {
    // Converte array para formato pgvector
    const vectorStr = `[${embedding.join(',')}]`;
    
    const result = await query(
      `UPDATE articles 
       SET embedding = $1::vector 
       WHERE id = $2 
       RETURNING id`,
      [vectorStr, id]
    );
    return result.rows[0];
  },

  /**
   * Busca artigos sem embedding (para processamento em batch)
   * @param {number} limit
   */
  async findWithoutEmbedding(limit = 100) {
    const result = await query(
      `SELECT a.id, a.title, a.summary
       FROM articles a
       WHERE a.embedding IS NULL 
         AND a.category_id IS NOT NULL
       ORDER BY a.created_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  /**
   * Busca artigos similares por embedding (Content-Based Filtering)
   * @param {number[]} embedding - Embedding de referência
   * @param {Object} options - { categoryIds?, excludeIds?, limit }
   */
  async findSimilarByEmbedding(embedding, { categoryIds, excludeIds = [], limit = 50 } = {}) {
    const vectorStr = `[${embedding.join(',')}]`;
    
    let sql = `
      SELECT a.*, 
             s.name as site_name,
             c.name as category_name,
             c.slug as category_slug,
             1 - (a.embedding <=> $1::vector) as similarity
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.embedding IS NOT NULL
    `;
    
    const params = [vectorStr];
    let paramCount = 2;
    
    if (categoryIds && categoryIds.length > 0) {
      sql += ` AND a.category_id = ANY($${paramCount}::int[])`;
      params.push(categoryIds);
      paramCount++;
    }
    
    if (excludeIds && excludeIds.length > 0) {
      sql += ` AND a.id != ALL($${paramCount}::int[])`;
      params.push(excludeIds);
      paramCount++;
    }
    
    sql += ` ORDER BY similarity DESC LIMIT $${paramCount}`;
    params.push(limit);
    
    const result = await query(sql, params);
    return result.rows;
  },

  /**
   * Busca embeddings de artigos por IDs (para calcular perfil do usuário)
   * @param {number[]} ids
   */
  async findEmbeddingsByIds(ids) {
    if (!ids || ids.length === 0) return [];
    
    const result = await query(
      `SELECT id, embedding::text as embedding_text
       FROM articles 
       WHERE id = ANY($1) AND embedding IS NOT NULL`,
      [ids]
    );
    
    // Converte texto pgvector para array
    return result.rows.map(row => ({
      id: row.id,
      embedding: row.embedding_text 
        ? row.embedding_text.slice(1, -1).split(',').map(Number)
        : null
    }));
  },

  /**
   * Conta artigos com embedding
   */
  async countWithEmbedding() {
    const result = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
         COUNT(*) FILTER (WHERE embedding IS NULL) as without_embedding
       FROM articles 
       WHERE category_id IS NOT NULL`
    );
    return result.rows[0];
  },

  /**
   * Marca artigo como bookmarked
   */
  async bookmark(id) {
    const result = await query(
      `UPDATE articles 
       SET bookmarked = true 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * Remove bookmark de um artigo
   */
  async unbookmark(id) {
    const result = await query(
      `UPDATE articles 
       SET bookmarked = false 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * Busca artigos bookmarked
   */
  async findBookmarked(limit = 100) {
    const result = await query(
      `SELECT a.*, 
              s.name as site_name, 
              s.url as site_url,
              c.name as category_name,
              c.slug as category_slug
       FROM articles a
       JOIN sites s ON a.site_id = s.id
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.bookmarked = true
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  /**
   * Deleta artigos antigos (PRESERVA BOOKMARKED)
   */
  async deleteOlderThan(days) {
    const result = await query(
      `DELETE FROM articles 
       WHERE created_at < NOW() - INTERVAL '${days} days'
       AND bookmarked = false
       RETURNING id`,
      []
    );
    return result.rowCount;
  },

  /**
   * Estatísticas gerais (usa category_id)
   */
  async getStats() {
    const result = await query(
      `SELECT 
        COUNT(*) as total_articles,
        COUNT(*) FILTER (WHERE category_id IS NOT NULL) as categorized,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as articles_today,
        COUNT(DISTINCT site_id) as active_sites,
        COUNT(DISTINCT category_id) as total_categories
       FROM articles`,
      []
    );
    return result.rows[0];
  },

  /**
   * Estatísticas por categoria (usa category_id com JOIN)
   */
  async getStatsByCategory() {
    const result = await query(
      `SELECT 
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        COUNT(a.id) as count,
        MAX(a.published_at) as latest_article
       FROM categories c
       LEFT JOIN articles a ON a.category_id = c.id
       GROUP BY c.id, c.name, c.slug
       HAVING COUNT(a.id) > 0
       ORDER BY count DESC`,
      []
    );
    return result.rows;
  }
};

export default Article;
