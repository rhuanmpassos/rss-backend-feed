/**
 * UserProfile Model
 * Gerencia perfil calculado do usuário para personalização
 * 
 * Features habilitadas por thresholds:
 * - triggers_enabled: 50+ cliques
 * - patterns_enabled: 14+ dias de uso
 * - prediction_enabled: 1000+ interações
 * - push_enabled: 5+ sessões
 */

import { query } from '../config/database.js';

const UserProfile = {
  /**
   * Busca perfil completo do usuário
   * @param {number} userId
   */
  async findByUserId(userId) {
    const result = await query(`
      SELECT 
        up.*,
        up.profile_embedding::text as profile_embedding_text
      FROM user_profiles up
      WHERE up.user_id = $1
    `, [userId]);

    if (!result.rows[0]) return null;

    const profile = result.rows[0];
    
    // Parse embedding se existir
    if (profile.profile_embedding_text) {
      try {
        profile.profile_embedding = profile.profile_embedding_text
          .slice(1, -1)
          .split(',')
          .map(Number);
      } catch (e) {
        profile.profile_embedding = null;
      }
    }

    return profile;
  },

  /**
   * Cria ou atualiza perfil
   * @param {number} userId
   * @param {Object} data
   */
  async upsert(userId, data) {
    const {
      profileEmbedding,
      temporalPatterns,
      contentPreferences,
      engagementTriggers,
      totalSessions,
      totalClicks,
      totalTimeSpent,
      avgSessionDuration
    } = data;

    const embeddingStr = profileEmbedding 
      ? `[${profileEmbedding.join(',')}]` 
      : null;

    const result = await query(`
      INSERT INTO user_profiles (
        user_id, profile_embedding, temporal_patterns, content_preferences,
        engagement_triggers, total_sessions, total_clicks, total_time_spent,
        avg_session_duration, last_calculated_at
      )
      VALUES ($1, $2::vector, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        profile_embedding = COALESCE($2::vector, user_profiles.profile_embedding),
        temporal_patterns = COALESCE($3, user_profiles.temporal_patterns),
        content_preferences = COALESCE($4, user_profiles.content_preferences),
        engagement_triggers = COALESCE($5, user_profiles.engagement_triggers),
        total_sessions = COALESCE($6, user_profiles.total_sessions),
        total_clicks = COALESCE($7, user_profiles.total_clicks),
        total_time_spent = COALESCE($8, user_profiles.total_time_spent),
        avg_session_duration = COALESCE($9, user_profiles.avg_session_duration),
        last_calculated_at = NOW()
      RETURNING *
    `, [
      userId,
      embeddingStr,
      temporalPatterns ? JSON.stringify(temporalPatterns) : null,
      contentPreferences ? JSON.stringify(contentPreferences) : null,
      engagementTriggers ? JSON.stringify(engagementTriggers) : null,
      totalSessions,
      totalClicks,
      totalTimeSpent,
      avgSessionDuration
    ]);

    return result.rows[0];
  },

  /**
   * Busca perfil simplificado para uso no feed
   * @param {number} userId
   */
  async getSimplifiedProfile(userId) {
    const profile = await this.findByUserId(userId);
    
    if (!profile) {
      return {
        isNew: true,
        hasPreferences: false,
        hasEmbedding: false,
        features: {
          triggersEnabled: false,
          patternsEnabled: false,
          predictionEnabled: false,
          pushEnabled: false
        }
      };
    }

    return {
      isNew: false,
      hasPreferences: true,
      hasEmbedding: !!profile.profile_embedding,
      features: {
        triggersEnabled: profile.triggers_enabled,
        patternsEnabled: profile.patterns_enabled,
        predictionEnabled: profile.prediction_enabled,
        pushEnabled: profile.push_enabled
      },
      temporalPatterns: profile.temporal_patterns || {},
      engagementTriggers: profile.engagement_triggers || {},
      contentPreferences: profile.content_preferences || {},
      stats: {
        totalClicks: profile.total_clicks,
        totalSessions: profile.total_sessions,
        daysActive: profile.first_interaction_at 
          ? Math.floor((Date.now() - new Date(profile.first_interaction_at)) / (1000 * 60 * 60 * 24))
          : 0
      }
    };
  },

  /**
   * Verifica se é horário de pico do usuário
   * @param {number} userId
   */
  async isPeakHour(userId) {
    const profile = await this.findByUserId(userId);
    if (!profile || !profile.temporal_patterns?.peak_hours) return false;

    const currentHour = new Date().getHours();
    return profile.temporal_patterns.peak_hours.includes(currentHour);
  },

  /**
   * Busca keywords de alta afinidade do usuário
   * @param {number} userId
   * @param {number} limit
   */
  async getHighAffinityKeywords(userId, limit = 20) {
    const result = await query(`
      SELECT keyword, ctr, click_count
      FROM user_keyword_affinity
      WHERE user_id = $1 AND click_count >= 2
      ORDER BY ctr DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  },

  /**
   * Atualiza flags de features baseado nos thresholds
   * @param {number} userId
   */
  async updateFeatureFlags(userId) {
    await query('SELECT check_and_update_user_thresholds($1)', [userId]);
  },

  /**
   * Busca configuração de thresholds
   */
  async getThresholds() {
    const result = await query(`
      SELECT value FROM engagement_config WHERE key = 'thresholds'
    `);
    return result.rows[0]?.value || {
      MIN_CLICKS_FOR_TRIGGERS: 50,
      MIN_DAYS_FOR_TEMPORAL: 14,
      MIN_INTERACTIONS_FOR_PREDICTION: 1000,
      MIN_SESSIONS_FOR_PUSH: 5
    };
  },

  /**
   * Busca estatísticas de features dos usuários
   */
  async getFeatureStats() {
    const result = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE triggers_enabled) as with_triggers,
        COUNT(*) FILTER (WHERE patterns_enabled) as with_patterns,
        COUNT(*) FILTER (WHERE prediction_enabled) as with_prediction,
        COUNT(*) FILTER (WHERE push_enabled) as with_push,
        AVG(total_clicks) as avg_clicks,
        AVG(total_sessions) as avg_sessions
      FROM user_profiles
    `);
    return result.rows[0];
  }
};

export default UserProfile;

