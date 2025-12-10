/**
 * UserCategoryPreference Model
 * Gerencia preferências de categorias dos usuários
 */

import { query } from '../config/database.js';

const UserCategoryPreference = {
  /**
   * Cria ou atualiza preferência de categoria
   * @param {Object} data - { userId, categoryId, preferenceScore }
   */
  async upsert({ userId, categoryId, preferenceScore = 0.5 }) {
    try {
      const result = await query(
        `INSERT INTO user_category_preferences (user_id, category_id, preference_score)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, category_id) 
         DO UPDATE SET preference_score = $3, updated_at = NOW()
         RETURNING *`,
        [userId, categoryId, preferenceScore]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao upsert preferência:', error);
      throw error;
    }
  },

  /**
   * Busca preferências de um usuário
   * @param {number} userId
   */
  async findByUserId(userId) {
    const result = await query(
      `SELECT ucp.*, c.name as category_name, c.slug as category_slug
       FROM user_category_preferences ucp
       JOIN categories c ON ucp.category_id = c.id
       WHERE ucp.user_id = $1
       ORDER BY ucp.preference_score DESC`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Busca top N categorias preferidas de um usuário
   * @param {number} userId
   * @param {number} limit - número de categorias (default: 4)
   */
  async findTopCategories(userId, limit = 4) {
    const result = await query(
      `SELECT ucp.*, c.name as category_name, c.slug as category_slug
       FROM user_category_preferences ucp
       JOIN categories c ON ucp.category_id = c.id
       WHERE ucp.user_id = $1
       ORDER BY ucp.preference_score DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  },

  /**
   * Busca preferência específica
   * @param {number} userId
   * @param {number} categoryId
   */
  async findOne(userId, categoryId) {
    const result = await query(
      `SELECT * FROM user_category_preferences
       WHERE user_id = $1 AND category_id = $2`,
      [userId, categoryId]
    );
    return result.rows[0] || null;
  },

  /**
   * Incrementa score de preferência (baseado em interação)
   * @param {number} userId
   * @param {number} categoryId
   * @param {number} increment - valor a incrementar (default: 0.1)
   */
  async incrementScore(userId, categoryId, increment = 0.1) {
    const result = await query(
      `INSERT INTO user_category_preferences (user_id, category_id, preference_score)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, category_id) 
       DO UPDATE SET 
         preference_score = LEAST(1.0, user_category_preferences.preference_score + $3),
         updated_at = NOW()
       RETURNING *`,
      [userId, categoryId, increment]
    );
    return result.rows[0];
  },

  /**
   * Decrementa score de preferência (baseado em skip/não interação)
   * @param {number} userId
   * @param {number} categoryId
   * @param {number} decrement - valor a decrementar (default: 0.05)
   */
  async decrementScore(userId, categoryId, decrement = 0.05) {
    const result = await query(
      `UPDATE user_category_preferences
       SET 
         preference_score = GREATEST(0.0, preference_score - $3),
         updated_at = NOW()
       WHERE user_id = $1 AND category_id = $2
       RETURNING *`,
      [userId, categoryId, decrement]
    );
    return result.rows[0];
  },

  /**
   * Deleta preferência
   * @param {number} userId
   * @param {number} categoryId
   */
  async delete(userId, categoryId) {
    const result = await query(
      `DELETE FROM user_category_preferences
       WHERE user_id = $1 AND category_id = $2
       RETURNING id`,
      [userId, categoryId]
    );
    return result.rowCount > 0;
  },

  /**
   * Deleta todas as preferências de um usuário
   * @param {number} userId
   */
  async deleteAllByUser(userId) {
    const result = await query(
      'DELETE FROM user_category_preferences WHERE user_id = $1',
      [userId]
    );
    return result.rowCount;
  }
};

export default UserCategoryPreference;

