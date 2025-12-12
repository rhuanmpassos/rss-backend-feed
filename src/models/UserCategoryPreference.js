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
   * @deprecated ESTE MÉTODO CAUSA SATURAÇÃO DE SCORES!
   * 
   * PROBLEMA: Usa LEAST(1.0, score + 0.1) que satura em 100% após poucos cliques.
   * Com apenas 2 cliques, score atinge máximo e sistema não diferencia interesses.
   * 
   * SOLUÇÃO: Use PreferenceService.updateUserPreferences(userId) que:
   * - Normaliza scores (soma = 1.0)
   * - Aplica decay temporal
   * - Considera feedback negativo
   * 
   * Este método foi mantido apenas para retrocompatibilidade.
   * Novas implementações devem usar PreferenceService.
   * 
   * @param {number} userId
   * @param {number} categoryId
   * @param {number} increment - IGNORADO no novo sistema
   */
  async incrementScore(userId, categoryId, increment = 0.1) {
    console.warn(
      `⚠️ DEPRECATED: UserCategoryPreference.incrementScore() causa saturação de scores!\n` +
      `   Use PreferenceService.updateUserPreferences(${userId}) em vez disso.`
    );
    
    // Mantém comportamento antigo para não quebrar código existente
    // MAS adiciona aviso para que seja migrado
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
   * @deprecated ESTE MÉTODO FAZ PARTE DO SISTEMA ANTIGO!
   * 
   * PROBLEMA: Decremento fixo não considera:
   * - Proporção de impressões vs cliques (CTR)
   * - Decay temporal
   * - Normalização relativa
   * 
   * SOLUÇÃO: O feedback negativo agora é calculado automaticamente por
   * PreferenceService.applyNegativeFeedback(userId) baseado no CTR.
   * 
   * @param {number} userId
   * @param {number} categoryId
   * @param {number} decrement - IGNORADO no novo sistema
   */
  async decrementScore(userId, categoryId, decrement = 0.05) {
    console.warn(
      `⚠️ DEPRECATED: UserCategoryPreference.decrementScore() faz parte do sistema antigo!\n` +
      `   O feedback negativo é calculado automaticamente por PreferenceService.`
    );
    
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

