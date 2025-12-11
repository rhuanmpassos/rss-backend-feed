/**
 * Learning Service
 * Processa interações e aprende sobre o usuário
 * 
 * Responsabilidades:
 * - Processar batch de interações do app
 * - Analisar títulos clicados (detectar gatilhos)
 * - Atualizar afinidade por keywords
 * - Recalcular perfil do usuário
 */

import { query } from '../config/database.js';
import UserProfile from '../models/UserProfile.js';
import UserSession from '../models/UserSession.js';
import EmbeddingService from './embeddingService.js';

// Debounce para recálculo de perfil
const profileUpdateTimers = new Map();

const LearningService = {
  /**
   * Processa batch de interações do app
   * @param {number} userId
   * @param {Array} interactions
   * @param {string} sessionId
   * @param {string} deviceType
   */
  async processInteractionBatch(userId, interactions, sessionId, deviceType = null) {
    console.log(`🧠 Processando ${interactions.length} interações do usuário ${userId}`);

    const now = new Date();
    const hourOfDay = now.getHours();
    const dayOfWeek = now.getDay();

    let clickCount = 0;
    let viewCount = 0;

    for (const interaction of interactions) {
      try {
        // 1. Salva interação com contexto expandido
        await query(`
          INSERT INTO user_interactions 
          (user_id, article_id, interaction_type, duration, position, 
           session_id, scroll_velocity, screen_position, viewport_time,
           hour_of_day, day_of_week, device_type)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          userId,
          interaction.article_id,
          interaction.interaction_type,
          interaction.duration || null,
          interaction.position || null,
          sessionId,
          interaction.scroll_velocity || null,
          interaction.screen_position || null,
          interaction.viewport_time || null,
          hourOfDay,
          dayOfWeek,
          deviceType
        ]);

        // 2. Se foi clique, processa análise de título
        if (interaction.interaction_type === 'click') {
          clickCount++;
          await this.analyzeClickedTitle(userId, interaction.article_id);
          await this.updateKeywordAffinity(userId, interaction.article_id, 'click');
        }

        // 3. Se foi impressão, atualiza keywords (para calcular CTR)
        if (interaction.interaction_type === 'impression') {
          await this.updateKeywordAffinity(userId, interaction.article_id, 'impression');
        }

        // 4. Se foi view, conta
        if (interaction.interaction_type === 'view') {
          viewCount++;
        }

      } catch (error) {
        console.error(`   Erro ao processar interação:`, error.message);
      }
    }

    // 5. Atualiza sessão se existir
    if (sessionId) {
      await UserSession.increment(sessionId, {
        views: viewCount,
        clicks: clickCount
      });
    }

    // 6. Atualiza flags de features do usuário
    await UserProfile.updateFeatureFlags(userId);

    // 7. Agenda recálculo do perfil (debounced)
    this.scheduleProfileUpdate(userId);

    console.log(`   ✅ Processados: ${clickCount} cliques, ${viewCount} views`);
    return { processed: interactions.length, clicks: clickCount, views: viewCount };
  },

  /**
   * Analisa título clicado para detectar padrões de gatilhos
   * @param {number} userId
   * @param {number} articleId
   */
  async analyzeClickedTitle(userId, articleId) {
    try {
      const article = await query(
        'SELECT id, title FROM articles WHERE id = $1',
        [articleId]
      );

      if (!article.rows[0]) return;

      const title = article.rows[0].title;
      const titleLower = title.toLowerCase();

      // Detecta características do título
      const hasUrgency = /urgente|agora|última hora|breaking|ao vivo|acaba de|neste momento/i.test(titleLower);
      const hasNumbers = /\d+/.test(title);
      const hasQuestion = /\?$/.test(title);
      const hasControversy = /polêmic|escândalo|choca|impressiona|revela|bomba|denúncia|surpreende|inacreditável/i.test(titleLower);
      const hasExclusivity = /exclusivo|inédito|revelado|primeiro|único|nunca antes/i.test(titleLower);
      const wordCount = title.split(/\s+/).length;

      await query(`
        INSERT INTO clicked_titles_analysis 
        (user_id, article_id, title, has_urgency, has_numbers, has_question, has_controversy, has_exclusivity, word_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [userId, articleId, title, hasUrgency, hasNumbers, hasQuestion, hasControversy, hasExclusivity, wordCount]);

    } catch (error) {
      console.error(`   Erro ao analisar título:`, error.message);
    }
  },

  /**
   * Atualiza afinidade por keywords do título
   * @param {number} userId
   * @param {number} articleId
   * @param {string} eventType - 'click' ou 'impression'
   */
  async updateKeywordAffinity(userId, articleId, eventType) {
    try {
      const article = await query(
        'SELECT title FROM articles WHERE id = $1',
        [articleId]
      );

      if (!article.rows[0]) return;

      // Stop words em português
      const stopWords = new Set([
        'para', 'como', 'sobre', 'mais', 'depois', 'antes', 'ainda', 'mesmo',
        'sendo', 'isso', 'esse', 'esta', 'este', 'aqui', 'onde', 'quando',
        'porque', 'porém', 'apenas', 'muito', 'pouco', 'todo', 'toda', 'todos',
        'todas', 'outro', 'outra', 'outros', 'outras', 'novo', 'nova', 'novos',
        'pode', 'podem', 'deve', 'devem', 'será', 'seria', 'foram', 'sido',
        'está', 'estão', 'fazer', 'faz', 'fez', 'feito', 'disse', 'diz'
      ]);

      // Extrai palavras significativas (> 4 caracteres, não stop words)
      const keywords = article.rows[0].title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .split(/\s+/)
        .filter(w => w.length > 4 && !stopWords.has(w))
        .slice(0, 5); // Top 5 keywords

      for (const keyword of keywords) {
        if (eventType === 'click') {
          await query(`
            INSERT INTO user_keyword_affinity (user_id, keyword, click_count, impression_count, last_clicked_at)
            VALUES ($1, $2, 1, 0, NOW())
            ON CONFLICT (user_id, keyword)
            DO UPDATE SET 
              click_count = user_keyword_affinity.click_count + 1,
              last_clicked_at = NOW()
          `, [userId, keyword]);
        } else {
          await query(`
            INSERT INTO user_keyword_affinity (user_id, keyword, click_count, impression_count)
            VALUES ($1, $2, 0, 1)
            ON CONFLICT (user_id, keyword)
            DO UPDATE SET 
              impression_count = user_keyword_affinity.impression_count + 1
          `, [userId, keyword]);
        }
      }
    } catch (error) {
      // Não falha silenciosamente, mas não bloqueia
      console.warn(`   Aviso ao atualizar keywords:`, error.message);
    }
  },

  /**
   * Agenda recálculo do perfil (debounced)
   * @param {number} userId
   */
  scheduleProfileUpdate(userId) {
    // Cancela timer anterior
    if (profileUpdateTimers.has(userId)) {
      clearTimeout(profileUpdateTimers.get(userId));
    }

    // Agenda novo recálculo em 30 segundos
    const timer = setTimeout(async () => {
      try {
        await this.recalculateUserProfile(userId);
      } catch (error) {
        console.error(`Erro ao recalcular perfil ${userId}:`, error.message);
      }
      profileUpdateTimers.delete(userId);
    }, 30000);

    profileUpdateTimers.set(userId, timer);
  },

  /**
   * Recalcula perfil completo do usuário
   * @param {number} userId
   */
  async recalculateUserProfile(userId) {
    console.log(`🔄 Recalculando perfil do usuário ${userId}...`);

    try {
      // 1. Calcula embedding do perfil (média dos artigos clicados)
      const profileEmbedding = await this.calculateProfileEmbedding(userId);

      // 2. Calcula padrões temporais
      const temporalPatterns = await this.calculateTemporalPatterns(userId);

      // 3. Calcula preferências de conteúdo
      const contentPreferences = await this.calculateContentPreferences(userId);

      // 4. Calcula gatilhos de engajamento
      const engagementTriggers = await this.calculateEngagementTriggers(userId);

      // 5. Calcula estatísticas gerais
      const stats = await this.calculateStats(userId);

      // 6. Salva perfil
      await UserProfile.upsert(userId, {
        profileEmbedding,
        temporalPatterns,
        contentPreferences,
        engagementTriggers,
        totalSessions: stats.totalSessions,
        totalClicks: stats.totalClicks,
        totalTimeSpent: stats.totalTimeSpent,
        avgSessionDuration: stats.avgSessionDuration
      });

      console.log(`   ✅ Perfil do usuário ${userId} atualizado`);
      return true;
    } catch (error) {
      console.error(`   ❌ Erro ao recalcular perfil:`, error.message);
      return false;
    }
  },

  /**
   * Calcula embedding do perfil (média dos artigos clicados)
   * @param {number} userId
   */
  async calculateProfileEmbedding(userId) {
    const result = await query(`
      SELECT a.embedding::text as embedding_text
      FROM user_interactions ui
      JOIN articles a ON ui.article_id = a.id
      WHERE ui.user_id = $1 
        AND ui.interaction_type = 'click'
        AND a.embedding IS NOT NULL
      ORDER BY ui.created_at DESC
      LIMIT 50
    `, [userId]);

    if (result.rows.length === 0) return null;

    // Converte e calcula média
    const embeddings = result.rows
      .map(r => {
        try {
          return r.embedding_text.slice(1, -1).split(',').map(Number);
        } catch {
          return null;
        }
      })
      .filter(e => e !== null);

    if (embeddings.length === 0) return null;

    return EmbeddingService.averageEmbeddings(embeddings);
  },

  /**
   * Calcula padrões temporais do usuário
   * @param {number} userId
   */
  async calculateTemporalPatterns(userId) {
    // Horários mais ativos
    const hourResult = await query(`
      SELECT hour_of_day, COUNT(*) as count
      FROM user_interactions
      WHERE user_id = $1 AND hour_of_day IS NOT NULL
      GROUP BY hour_of_day
      ORDER BY count DESC
      LIMIT 5
    `, [userId]);

    const peakHours = hourResult.rows.map(r => parseInt(r.hour_of_day));

    // Dias mais ativos
    const dayResult = await query(`
      SELECT day_of_week, COUNT(*) as count
      FROM user_interactions
      WHERE user_id = $1 AND day_of_week IS NOT NULL
      GROUP BY day_of_week
      ORDER BY count DESC
      LIMIT 3
    `, [userId]);

    const peakDays = dayResult.rows.map(r => parseInt(r.day_of_week));

    // Duração média de sessão
    const sessionResult = await query(`
      SELECT AVG(duration) as avg_duration
      FROM user_sessions
      WHERE user_id = $1 AND duration IS NOT NULL
    `, [userId]);

    return {
      peak_hours: peakHours,
      peak_days: peakDays,
      avg_session_duration: Math.round(parseFloat(sessionResult.rows[0]?.avg_duration) || 0)
    };
  },

  /**
   * Calcula preferências de conteúdo
   * @param {number} userId
   */
  async calculateContentPreferences(userId) {
    // Fontes preferidas
    const sourcesResult = await query(`
      SELECT s.name, COUNT(*) as count
      FROM user_interactions ui
      JOIN articles a ON ui.article_id = a.id
      JOIN sites s ON a.site_id = s.id
      WHERE ui.user_id = $1 AND ui.interaction_type = 'click'
      GROUP BY s.name
      ORDER BY count DESC
      LIMIT 5
    `, [userId]);

    // Tempo médio de leitura
    const readTimeResult = await query(`
      SELECT AVG(duration) as avg_read_time
      FROM user_interactions
      WHERE user_id = $1 
        AND interaction_type = 'view'
        AND duration > 5000
    `, [userId]);

    // Tamanho preferido de título
    const titleLengthResult = await query(`
      SELECT AVG(word_count) as avg_words
      FROM clicked_titles_analysis
      WHERE user_id = $1
    `, [userId]);

    const avgWords = parseFloat(titleLengthResult.rows[0]?.avg_words) || 0;
    const preferredLength = avgWords < 8 ? 'short' : avgWords < 15 ? 'medium' : 'long';

    return {
      preferred_sources: sourcesResult.rows.map(r => r.name),
      avg_read_time_ms: Math.round(parseFloat(readTimeResult.rows[0]?.avg_read_time) || 0),
      preferred_title_length: preferredLength,
      avg_title_words: Math.round(avgWords)
    };
  },

  /**
   * Calcula gatilhos de engajamento que funcionam para o usuário
   * @param {number} userId
   */
  async calculateEngagementTriggers(userId) {
    // Taxa de clique por característica de título
    const analysis = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE has_urgency) as urgency_clicks,
        COUNT(*) FILTER (WHERE has_numbers) as numbers_clicks,
        COUNT(*) FILTER (WHERE has_question) as question_clicks,
        COUNT(*) FILTER (WHERE has_controversy) as controversy_clicks,
        COUNT(*) FILTER (WHERE has_exclusivity) as exclusivity_clicks,
        COUNT(*) as total_clicks
      FROM clicked_titles_analysis
      WHERE user_id = $1
    `, [userId]);

    const stats = analysis.rows[0];
    const total = parseInt(stats.total_clicks) || 1;

    // Calcula taxas
    const urgencyRate = parseInt(stats.urgency_clicks) / total;
    const numbersRate = parseInt(stats.numbers_clicks) / total;
    const questionRate = parseInt(stats.question_clicks) / total;
    const controversyRate = parseInt(stats.controversy_clicks) / total;
    const exclusivityRate = parseInt(stats.exclusivity_clicks) / total;

    // Baseline esperado (aproximadamente 20-25% dos títulos têm cada característica)
    const baseline = 0.25;

    // Calcula multiplicadores (quão mais provável é clicar se tem essa característica)
    const calcMultiplier = (rate) => {
      if (rate <= baseline) return 1;
      return 1 + (rate - baseline) * 2; // Max ~1.5x
    };

    // Keywords com maior CTR
    const keywordsResult = await query(`
      SELECT keyword, ctr
      FROM user_keyword_affinity
      WHERE user_id = $1 AND click_count >= 2
      ORDER BY ctr DESC
      LIMIT 10
    `, [userId]);

    return {
      urgency_multiplier: calcMultiplier(urgencyRate),
      numbers_multiplier: calcMultiplier(numbersRate),
      question_multiplier: calcMultiplier(questionRate),
      controversy_multiplier: calcMultiplier(controversyRate),
      exclusivity_multiplier: calcMultiplier(exclusivityRate),
      high_ctr_keywords: keywordsResult.rows.map(r => r.keyword),
      stats: {
        total_analyzed: total,
        urgency_rate: urgencyRate,
        numbers_rate: numbersRate,
        controversy_rate: controversyRate
      }
    };
  },

  /**
   * Calcula estatísticas gerais
   * @param {number} userId
   */
  async calculateStats(userId) {
    const result = await query(`
      SELECT 
        (SELECT COUNT(*) FROM user_sessions WHERE user_id = $1) as total_sessions,
        (SELECT COUNT(*) FROM user_interactions WHERE user_id = $1 AND interaction_type = 'click') as total_clicks,
        (SELECT COALESCE(SUM(duration), 0) FROM user_sessions WHERE user_id = $1) as total_time_spent,
        (SELECT AVG(duration) FROM user_sessions WHERE user_id = $1 AND duration IS NOT NULL) as avg_session_duration
    `, [userId]);

    return {
      totalSessions: parseInt(result.rows[0].total_sessions) || 0,
      totalClicks: parseInt(result.rows[0].total_clicks) || 0,
      totalTimeSpent: parseInt(result.rows[0].total_time_spent) || 0,
      avgSessionDuration: Math.round(parseFloat(result.rows[0].avg_session_duration) || 0)
    };
  },

  /**
   * Força recálculo imediato (sem debounce)
   * @param {number} userId
   */
  async forceRecalculate(userId) {
    // Cancela timer se existir
    if (profileUpdateTimers.has(userId)) {
      clearTimeout(profileUpdateTimers.get(userId));
      profileUpdateTimers.delete(userId);
    }
    
    return await this.recalculateUserProfile(userId);
  }
};

export default LearningService;

