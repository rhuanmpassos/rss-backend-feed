/**
 * UserSession Model
 * Gerencia sessões de uso do app
 */

import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const UserSession = {
  /**
   * Cria nova sessão
   * @param {Object} data - { userId, deviceType, entrySource }
   */
  async create({ userId, deviceType = null, entrySource = 'organic' }) {
    const sessionId = uuidv4();
    
    const result = await query(`
      INSERT INTO user_sessions (id, user_id, device_type, entry_source)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [sessionId, userId, deviceType, entrySource]);

    return result.rows[0];
  },

  /**
   * Busca sessão por ID
   * @param {string} sessionId
   */
  async findById(sessionId) {
    const result = await query(
      'SELECT * FROM user_sessions WHERE id = $1',
      [sessionId]
    );
    return result.rows[0] || null;
  },

  /**
   * Atualiza métricas da sessão
   * @param {string} sessionId
   * @param {Object} data
   */
  async update(sessionId, { articlesViewed, articlesClicked, scrollDepth, refreshCount }) {
    const result = await query(`
      UPDATE user_sessions SET
        articles_viewed = COALESCE($2, articles_viewed),
        articles_clicked = COALESCE($3, articles_clicked),
        scroll_depth = COALESCE($4, scroll_depth),
        refresh_count = COALESCE($5, refresh_count)
      WHERE id = $1
      RETURNING *
    `, [sessionId, articlesViewed, articlesClicked, scrollDepth, refreshCount]);

    return result.rows[0];
  },

  /**
   * Incrementa contadores da sessão
   * @param {string} sessionId
   * @param {Object} increments
   */
  async increment(sessionId, { views = 0, clicks = 0, refreshes = 0 }) {
    const result = await query(`
      UPDATE user_sessions SET
        articles_viewed = articles_viewed + $2,
        articles_clicked = articles_clicked + $3,
        refresh_count = refresh_count + $4
      WHERE id = $1
      RETURNING *
    `, [sessionId, views, clicks, refreshes]);

    return result.rows[0];
  },

  /**
   * Finaliza sessão
   * @param {string} sessionId
   */
  async end(sessionId) {
    const result = await query(`
      UPDATE user_sessions SET
        ended_at = NOW(),
        duration = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
        engagement_score = CASE 
          WHEN articles_clicked > 0 THEN 
            (articles_clicked::float / NULLIF(articles_viewed, 0)) * 100
          ELSE 0
        END
      WHERE id = $1
      RETURNING *
    `, [sessionId]);

    return result.rows[0];
  },

  /**
   * Busca sessões de um usuário
   * @param {number} userId
   * @param {number} limit
   */
  async findByUserId(userId, limit = 50) {
    const result = await query(`
      SELECT * FROM user_sessions
      WHERE user_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  },

  /**
   * Estatísticas de sessões do usuário
   * @param {number} userId
   */
  async getStats(userId) {
    const result = await query(`
      SELECT 
        COUNT(*) as total_sessions,
        AVG(duration) as avg_duration,
        SUM(duration) as total_time,
        AVG(articles_viewed) as avg_articles_viewed,
        AVG(articles_clicked) as avg_articles_clicked,
        AVG(engagement_score) as avg_engagement_score,
        MAX(started_at) as last_session
      FROM user_sessions
      WHERE user_id = $1 AND duration IS NOT NULL
    `, [userId]);

    const stats = result.rows[0];
    
    return {
      totalSessions: parseInt(stats.total_sessions) || 0,
      avgDuration: Math.round(parseFloat(stats.avg_duration) || 0),
      totalTime: parseInt(stats.total_time) || 0,
      avgArticlesViewed: Math.round(parseFloat(stats.avg_articles_viewed) || 0),
      avgArticlesClicked: Math.round(parseFloat(stats.avg_articles_clicked) || 0),
      avgEngagementScore: parseFloat(stats.avg_engagement_score)?.toFixed(2) || 0,
      lastSession: stats.last_session
    };
  },

  /**
   * Sessões ativas (não finalizadas)
   * @param {number} userId
   */
  async findActiveSessions(userId) {
    const result = await query(`
      SELECT * FROM user_sessions
      WHERE user_id = $1 AND ended_at IS NULL
      ORDER BY started_at DESC
    `, [userId]);

    return result.rows;
  },

  /**
   * Finaliza sessões antigas (mais de 30 minutos sem atividade)
   */
  async cleanupStaleSessions() {
    const result = await query(`
      UPDATE user_sessions SET
        ended_at = started_at + INTERVAL '30 minutes',
        duration = 1800
      WHERE ended_at IS NULL 
        AND started_at < NOW() - INTERVAL '30 minutes'
      RETURNING id
    `);

    return result.rowCount;
  },

  /**
   * Padrão de sessões por horário
   * @param {number} userId
   */
  async getTimePatterns(userId) {
    const result = await query(`
      SELECT 
        EXTRACT(HOUR FROM started_at) as hour,
        EXTRACT(DOW FROM started_at) as day_of_week,
        COUNT(*) as session_count,
        AVG(duration) as avg_duration
      FROM user_sessions
      WHERE user_id = $1 
        AND started_at > NOW() - INTERVAL '30 days'
        AND duration IS NOT NULL
      GROUP BY 
        EXTRACT(HOUR FROM started_at),
        EXTRACT(DOW FROM started_at)
      ORDER BY session_count DESC
    `, [userId]);

    return result.rows;
  }
};

export default UserSession;

