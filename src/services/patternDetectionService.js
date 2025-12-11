/**
 * Pattern Detection Service
 * Detecta padrões de comportamento do usuário
 * 
 * Responsabilidades:
 * - Detectar tipo de usuário (heavy/regular/casual/dormant)
 * - Detectar tendência de engajamento
 * - Detectar interesses emergentes
 * - Detectar melhor horário para notificação
 */

import { query } from '../config/database.js';

const PatternDetectionService = {
  /**
   * Detecta padrão de consumo do usuário
   * @param {number} userId
   * @returns {'heavy' | 'regular' | 'casual' | 'dormant' | 'new'}
   */
  async detectUserPattern(userId) {
    const stats = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as interactions_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as interactions_today,
        COUNT(DISTINCT DATE(created_at)) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as active_days,
        MIN(created_at) as first_interaction
      FROM user_interactions
      WHERE user_id = $1
    `, [userId]);

    const { interactions_week, interactions_today, active_days, first_interaction } = stats.rows[0];

    // Usuário novo (menos de 7 dias)
    if (!first_interaction || (Date.now() - new Date(first_interaction)) < 7 * 24 * 60 * 60 * 1000) {
      return {
        type: 'new',
        description: 'Usuário novo, ainda aprendendo preferências',
        metrics: { interactions_week, active_days }
      };
    }

    // Heavy user: usa todos os dias, muitas interações
    if (active_days >= 6 && interactions_week > 100) {
      return {
        type: 'heavy',
        description: 'Usuário muito ativo, usa diariamente',
        metrics: { interactions_week, active_days }
      };
    }

    // Regular: usa maioria dos dias
    if (active_days >= 4 && interactions_week > 30) {
      return {
        type: 'regular',
        description: 'Usuário regular, usa frequentemente',
        metrics: { interactions_week, active_days }
      };
    }

    // Casual: usa algumas vezes por semana
    if (active_days >= 1 && interactions_week > 5) {
      return {
        type: 'casual',
        description: 'Usuário casual, uso esporádico',
        metrics: { interactions_week, active_days }
      };
    }

    // Dormant: não usou recentemente
    return {
      type: 'dormant',
      description: 'Usuário inativo, potencial churn',
      metrics: { interactions_week, active_days }
    };
  },

  /**
   * Detecta tendência de engajamento
   * Está aumentando, estável ou diminuindo?
   * @param {number} userId
   */
  async detectEngagementTrend(userId) {
    const result = await query(`
      WITH weekly_stats AS (
        SELECT 
          DATE_TRUNC('week', created_at) as week,
          COUNT(*) as interactions
        FROM user_interactions
        WHERE user_id = $1 
          AND created_at > NOW() - INTERVAL '4 weeks'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week
      )
      SELECT 
        ARRAY_AGG(interactions ORDER BY week) as weekly_interactions,
        ARRAY_AGG(week ORDER BY week) as weeks
      FROM weekly_stats
    `, [userId]);

    const weekly = result.rows[0]?.weekly_interactions || [];
    const weeks = result.rows[0]?.weeks || [];

    if (weekly.length < 2) {
      return {
        trend: 'unknown',
        description: 'Dados insuficientes para determinar tendência',
        data: { weekly }
      };
    }

    // Compara últimas 2 semanas com anteriores
    const recent = weekly.slice(-2);
    const older = weekly.slice(0, -2);

    const recentAvg = recent.reduce((a, b) => a + parseInt(b), 0) / recent.length;
    const olderAvg = older.length > 0 
      ? older.reduce((a, b) => a + parseInt(b), 0) / older.length 
      : recentAvg;

    const change = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

    let trend, description;
    if (change > 0.2) {
      trend = 'increasing';
      description = `Engajamento aumentando ${Math.round(change * 100)}%`;
    } else if (change < -0.2) {
      trend = 'decreasing';
      description = `Engajamento diminuindo ${Math.round(Math.abs(change) * 100)}%`;
    } else {
      trend = 'stable';
      description = 'Engajamento estável';
    }

    return {
      trend,
      description,
      change: Math.round(change * 100),
      data: { weekly, weeks, recentAvg, olderAvg }
    };
  },

  /**
   * Detecta interesses emergentes
   * Categorias que o usuário começou a consumir mais recentemente
   * @param {number} userId
   */
  async detectEmergingInterests(userId) {
    const result = await query(`
      WITH recent_categories AS (
        SELECT 
          a.category_id,
          c.name as category_name,
          COUNT(*) as recent_count
        FROM user_interactions ui
        JOIN articles a ON ui.article_id = a.id
        JOIN categories c ON a.category_id = c.id
        WHERE ui.user_id = $1 
          AND ui.created_at > NOW() - INTERVAL '7 days'
          AND ui.interaction_type = 'click'
        GROUP BY a.category_id, c.name
      ),
      older_categories AS (
        SELECT 
          a.category_id,
          COUNT(*) as older_count
        FROM user_interactions ui
        JOIN articles a ON ui.article_id = a.id
        WHERE ui.user_id = $1 
          AND ui.created_at BETWEEN NOW() - INTERVAL '30 days' AND NOW() - INTERVAL '7 days'
          AND ui.interaction_type = 'click'
        GROUP BY a.category_id
      )
      SELECT 
        rc.category_id,
        rc.category_name,
        rc.recent_count,
        COALESCE(oc.older_count, 0) as older_count,
        CASE 
          WHEN COALESCE(oc.older_count, 0) = 0 THEN rc.recent_count::float
          ELSE (rc.recent_count - oc.older_count)::float / oc.older_count
        END as growth_rate
      FROM recent_categories rc
      LEFT JOIN older_categories oc ON rc.category_id = oc.category_id
      WHERE rc.recent_count >= 3
      ORDER BY growth_rate DESC
      LIMIT 5
    `, [userId]);

    const emerging = result.rows.filter(r => parseFloat(r.growth_rate) > 0.5);

    return {
      emerging: emerging.map(r => ({
        categoryId: r.category_id,
        categoryName: r.category_name,
        recentCount: parseInt(r.recent_count),
        growthRate: parseFloat(r.growth_rate).toFixed(2),
        isNew: parseInt(r.older_count) === 0
      })),
      description: emerging.length > 0 
        ? `Interesse crescente em: ${emerging.map(r => r.category_name).join(', ')}`
        : 'Sem interesses emergentes detectados'
    };
  },

  /**
   * Detecta melhor horário para notificação
   * @param {number} userId
   */
  async detectBestNotificationTime(userId) {
    const result = await query(`
      SELECT 
        hour_of_day,
        COUNT(*) as interactions,
        COUNT(*) FILTER (WHERE interaction_type = 'click') as clicks,
        AVG(CASE WHEN interaction_type = 'view' THEN duration ELSE NULL END) as avg_view_duration
      FROM user_interactions
      WHERE user_id = $1 
        AND hour_of_day IS NOT NULL
        AND created_at > NOW() - INTERVAL '14 days'
      GROUP BY hour_of_day
      HAVING COUNT(*) >= 3
      ORDER BY clicks DESC, interactions DESC
      LIMIT 5
    `, [userId]);

    if (result.rows.length === 0) {
      // Horários padrão se não tem dados
      return {
        bestHours: [8, 12, 19],
        confidence: 'low',
        description: 'Usando horários padrão (sem dados suficientes)'
      };
    }

    const bestHours = result.rows.map(r => ({
      hour: parseInt(r.hour_of_day),
      clicks: parseInt(r.clicks),
      interactions: parseInt(r.interactions),
      score: parseInt(r.clicks) * 2 + parseInt(r.interactions)
    }));

    return {
      bestHours: bestHours.slice(0, 3).map(h => h.hour),
      allHours: bestHours,
      confidence: bestHours.length >= 3 ? 'high' : 'medium',
      description: `Melhores horários: ${bestHours.slice(0, 3).map(h => `${h.hour}h`).join(', ')}`
    };
  },

  /**
   * Detecta padrão de dias da semana
   * @param {number} userId
   */
  async detectWeekdayPattern(userId) {
    const result = await query(`
      SELECT 
        day_of_week,
        COUNT(*) as interactions,
        COUNT(*) FILTER (WHERE interaction_type = 'click') as clicks
      FROM user_interactions
      WHERE user_id = $1 
        AND day_of_week IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY day_of_week
      ORDER BY interactions DESC
    `, [userId]);

    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    
    const pattern = result.rows.map(r => ({
      day: parseInt(r.day_of_week),
      dayName: dayNames[parseInt(r.day_of_week)],
      interactions: parseInt(r.interactions),
      clicks: parseInt(r.clicks)
    }));

    const topDays = pattern.slice(0, 3);

    return {
      pattern,
      topDays,
      description: topDays.length > 0 
        ? `Mais ativo em: ${topDays.map(d => d.dayName).join(', ')}`
        : 'Sem padrão semanal definido'
    };
  },

  /**
   * Análise completa de padrões do usuário
   * @param {number} userId
   */
  async getFullAnalysis(userId) {
    const [userPattern, trend, emerging, notificationTime, weekday] = await Promise.all([
      this.detectUserPattern(userId),
      this.detectEngagementTrend(userId),
      this.detectEmergingInterests(userId),
      this.detectBestNotificationTime(userId),
      this.detectWeekdayPattern(userId)
    ]);

    return {
      userId,
      analyzedAt: new Date().toISOString(),
      userPattern,
      engagementTrend: trend,
      emergingInterests: emerging,
      bestNotificationTime: notificationTime,
      weekdayPattern: weekday
    };
  }
};

export default PatternDetectionService;

