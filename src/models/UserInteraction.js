/**
 * UserInteraction Model
 * Registra interações dos usuários para Implicit Feedback
 * Usado no sistema de recomendação "For You"
 */

import { query } from '../config/database.js';

const UserInteraction = {
  /**
   * Registra uma interação
   * @param {Object} data - { userId, articleId, interactionType, duration?, position? }
   * interactionType: 'click' | 'view' | 'scroll_stop' | 'impression'
   */
  async create({ userId, articleId, interactionType, duration = null, position = null }) {
    try {
      const result = await query(
        `INSERT INTO user_interactions (user_id, article_id, interaction_type, duration, position)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, articleId, interactionType, duration, position]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao criar interação:', error);
      throw error;
    }
  },

  /**
   * Registra múltiplas interações em batch (otimizado)
   * @param {Array} interactions - Array de { userId, articleId, interactionType, duration?, position? }
   */
  async createBatch(interactions) {
    if (!interactions || interactions.length === 0) return [];

    // Constrói query com múltiplos VALUES
    const values = interactions.map((_, i) => {
      const offset = i * 5;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    }).join(', ');

    const params = interactions.flatMap(i => [
      i.userId, i.articleId, i.interactionType, i.duration || null, i.position || null
    ]);

    const result = await query(
      `INSERT INTO user_interactions (user_id, article_id, interaction_type, duration, position)
       VALUES ${values}
       RETURNING *`,
      params
    );
    return result.rows;
  },

  /**
   * Busca interações de um usuário
   * @param {number} userId
   * @param {Object} options - { limit, interactionType }
   */
  async findByUserId(userId, { limit = 100, interactionType = null } = {}) {
    let sql = `
      SELECT ui.*, a.title as article_title, a.category_id
      FROM user_interactions ui
      JOIN articles a ON ui.article_id = a.id
      WHERE ui.user_id = $1
    `;
    const params = [userId];

    if (interactionType) {
      sql += ` AND ui.interaction_type = $2`;
      params.push(interactionType);
    }

    sql += ` ORDER BY ui.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows;
  },

  /**
   * Busca interações de um usuário em um artigo específico
   * @param {number} userId
   * @param {number} articleId
   */
  async findByUserAndArticle(userId, articleId) {
    const result = await query(
      `SELECT * FROM user_interactions
       WHERE user_id = $1 AND article_id = $2
       ORDER BY created_at DESC`,
      [userId, articleId]
    );
    return result.rows;
  },

  /**
   * Conta interações por tipo para um usuário
   * @param {number} userId
   */
  async countByType(userId) {
    const result = await query(
      `SELECT interaction_type, COUNT(*) as count
       FROM user_interactions
       WHERE user_id = $1
       GROUP BY interaction_type`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Busca categorias mais interagidas por um usuário
   * Usado para calcular preferências dinâmicas
   * @param {number} userId
   * @param {number} days - período em dias (default: 30)
   */
  async getMostInteractedCategories(userId, days = 30) {
    const result = await query(
      `SELECT 
        a.category_id,
        c.name as category_name,
        c.slug as category_slug,
        COUNT(*) as interaction_count,
        COUNT(*) FILTER (WHERE ui.interaction_type = 'click') as clicks,
        COUNT(*) FILTER (WHERE ui.interaction_type = 'view') as views,
        AVG(ui.duration) FILTER (WHERE ui.interaction_type = 'view') as avg_view_duration
       FROM user_interactions ui
       JOIN articles a ON ui.article_id = a.id
       JOIN categories c ON a.category_id = c.id
       WHERE ui.user_id = $1
         AND ui.created_at >= NOW() - INTERVAL '${days} days'
         AND a.category_id IS NOT NULL
       GROUP BY a.category_id, c.name, c.slug
       ORDER BY interaction_count DESC`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Calcula score de interesse baseado em interações
   * Retorna artigos que o usuário demonstrou interesse
   * @param {number} userId
   * @param {number} limit
   */
  async getInterestScores(userId, limit = 50) {
    // Pesos por tipo de interação
    // click: 1.0, view (>10s): 0.8, scroll_stop: 0.3, impression: 0.05
    const result = await query(
      `SELECT 
        ui.article_id,
        a.title,
        a.category_id,
        SUM(
          CASE 
            WHEN ui.interaction_type = 'click' THEN 1.0
            WHEN ui.interaction_type = 'view' AND ui.duration > 10000 THEN 0.8
            WHEN ui.interaction_type = 'view' THEN 0.4
            WHEN ui.interaction_type = 'scroll_stop' THEN 0.3
            WHEN ui.interaction_type = 'impression' THEN 0.05
            ELSE 0
          END
        ) as interest_score
       FROM user_interactions ui
       JOIN articles a ON ui.article_id = a.id
       WHERE ui.user_id = $1
       GROUP BY ui.article_id, a.title, a.category_id
       ORDER BY interest_score DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  },

  /**
   * Deleta interações antigas (limpeza)
   * @param {number} days - interações mais antigas que X dias
   */
  async deleteOlderThan(days) {
    const result = await query(
      `DELETE FROM user_interactions 
       WHERE created_at < NOW() - INTERVAL '${days} days'
       RETURNING id`,
      []
    );
    return result.rowCount;
  }
};

export default UserInteraction;

