/**
 * Engagement Feed Service
 * Gera feed otimizado para engajamento máximo
 * 
 * Estratégia:
 * 1. Breaking news no topo (urgência)
 * 2. Artigos personalizados (relevância)
 * 3. Wildcards intercalados (surpresa/descoberta)
 * 4. Shuffle parcial (imprevisibilidade)
 * 
 * Funciona desde o primeiro usuário:
 * - Breaking: baseado em horário
 * - Wildcards: baseado em categorias
 * - Personalização: melhora com uso
 */

import { query } from '../config/database.js';
import RecommendationService from './recommendationService.js';
import PredictionService from './predictionService.js';
import UserProfile from '../models/UserProfile.js';

// Configuração padrão
const DEFAULT_CONFIG = {
  WILDCARD_PERCENTAGE: 0.12,
  BREAKING_TOP_POSITIONS: 2,
  SHUFFLE_START: 5,
  SHUFFLE_END: 20
};

const EngagementFeedService = {
  /**
   * Gera feed otimizado para engajamento
   * @param {number} userId
   * @param {Object} options - { limit, offset }
   */
  async getAddictiveFeed(userId, { limit = 50, offset = 0 } = {}) {
    console.log(`\n🎰 Gerando feed viciante para usuário ${userId}...`);

    const config = await this.getConfig();
    const profile = await UserProfile.getSimplifiedProfile(userId);

    // 1. Busca componentes do feed
    const [breakingNews, personalizedArticles, wildcards] = await Promise.all([
      this.getBreakingNews(config.BREAKING_TOP_POSITIONS + 3),
      RecommendationService.getForYouFeed(userId, limit * 2),
      this.getWildcards(userId, Math.ceil(limit * config.WILDCARD_PERCENTAGE))
    ]);

    console.log(`   📰 Breaking: ${breakingNews.length}`);
    console.log(`   ✨ Personalizados: ${personalizedArticles.length}`);
    console.log(`   💡 Wildcards: ${wildcards.length}`);

    // 2. Monta feed intercalado
    let feed = this.assembleFeed({
      breaking: breakingNews,
      personalized: personalizedArticles,
      wildcards: wildcards,
      config,
      limit: limit + offset
    });

    // 3. Aplica predição se disponível
    if (profile.features?.predictionEnabled) {
      console.log(`   🎯 Aplicando predição de clique...`);
      feed = await PredictionService.rankArticlesByPrediction(userId, feed);
    }

    // 4. Aplica shuffle parcial (cria imprevisibilidade)
    feed = this.partialShuffle(feed, config.SHUFFLE_START, config.SHUFFLE_END);

    // 5. Adiciona metadados de exibição
    feed = this.addDisplayMetadata(feed);

    // 6. Aplica offset e limit
    const result = feed.slice(offset, offset + limit);

    console.log(`   ✅ Feed gerado: ${result.length} artigos`);
    
    return result;
  },

  /**
   * Breaking News - Artigos das últimas 2 horas
   * Funciona sem usuários (baseado em horário e palavras-chave)
   */
  async getBreakingNews(limit = 5) {
    const result = await query(`
      SELECT a.*, 
             s.name as site_name,
             c.name as category_name,
             c.slug as category_slug,
             'breaking' as feed_type
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE (
        -- Menos de 2 horas
        a.published_at > NOW() - INTERVAL '2 hours'
        -- OU marcado como breaking
        OR a.is_breaking = true
      )
      AND a.category_id IS NOT NULL
      ORDER BY 
        a.is_breaking DESC,
        a.published_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(a => ({
      ...a,
      is_breaking: true,
      urgency: {
        level: 'breaking',
        badge: '⚡ URGENTE',
        color: '#FF6B00'
      }
    }));
  },

  /**
   * Wildcards - Artigos FORA do perfil do usuário
   * Cria o "variable reward" que gera dopamina
   */
  async getWildcards(userId, limit = 6) {
    // Busca categorias que o usuário JÁ consome
    const userCategories = await query(`
      SELECT DISTINCT a.category_id
      FROM user_interactions ui
      JOIN articles a ON ui.article_id = a.id
      WHERE ui.user_id = $1
        AND ui.interaction_type = 'click'
        AND a.category_id IS NOT NULL
      LIMIT 20
    `, [userId]);

    const excludeCategories = userCategories.rows.map(r => r.category_id);

    // Se usuário é novo (não tem histórico), pega artigos recentes variados
    if (excludeCategories.length === 0) {
      const result = await query(`
        SELECT DISTINCT ON (a.category_id) a.*, 
               s.name as site_name,
               c.name as category_name,
               c.slug as category_slug,
               'wildcard' as feed_type
        FROM articles a
        JOIN sites s ON a.site_id = s.id
        LEFT JOIN categories c ON a.category_id = c.id
        WHERE a.category_id IS NOT NULL
          AND a.published_at > NOW() - INTERVAL '24 hours'
        ORDER BY a.category_id, a.published_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map(a => ({ ...a, is_wildcard: true }));
    }

    // Busca artigos de categorias que o usuário NUNCA interagiu
    const result = await query(`
      SELECT a.*, 
             s.name as site_name,
             c.name as category_name,
             c.slug as category_slug,
             'wildcard' as feed_type
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.category_id IS NOT NULL
        AND a.category_id != ALL($1::int[])
        AND a.published_at > NOW() - INTERVAL '24 hours'
      ORDER BY 
        -- Prioriza títulos "chamativos"
        (CASE WHEN a.title ILIKE '%exclusivo%' THEN 3 ELSE 0 END) +
        (CASE WHEN a.title ILIKE '%urgente%' THEN 3 ELSE 0 END) +
        (CASE WHEN a.title ILIKE '%inédito%' THEN 2 ELSE 0 END) +
        (CASE WHEN a.title ILIKE '%revelado%' THEN 2 ELSE 0 END) +
        (CASE WHEN a.title ILIKE '%surpreende%' THEN 2 ELSE 0 END) +
        RANDOM() * 5
      DESC
      LIMIT $2
    `, [excludeCategories, limit]);

    return result.rows.map(a => ({
      ...a,
      is_wildcard: true,
      urgency: {
        level: 'discovery',
        badge: '💡 Descoberta',
        color: '#9B59B6'
      }
    }));
  },

  /**
   * Monta feed intercalando diferentes tipos de conteúdo
   */
  assembleFeed({ breaking, personalized, wildcards, config, limit }) {
    const feed = [];
    const usedIds = new Set();

    // Helper para adicionar sem duplicar
    const addUnique = (article) => {
      if (!usedIds.has(article.id)) {
        usedIds.add(article.id);
        feed.push(article);
        return true;
      }
      return false;
    };

    // Posições 1-2: Breaking news (urgência no topo)
    breaking.slice(0, config.BREAKING_TOP_POSITIONS).forEach(addUnique);

    // Posições 3-6: Personalizados
    personalized.slice(0, 4).forEach(addUnique);

    // Posição 7: Wildcard (surpresa)
    if (wildcards[0]) addUnique(wildcards[0]);

    // Posições 8-12: Personalizados
    personalized.slice(4, 9).forEach(addUnique);

    // Posição 13: Wildcard
    if (wildcards[1]) addUnique(wildcards[1]);

    // Posições 14-20: Personalizados
    personalized.slice(9, 16).forEach(addUnique);

    // Posição 21: Wildcard
    if (wildcards[2]) addUnique(wildcards[2]);

    // Resto: Intercala personalizados com wildcards a cada 7 posições
    let pIdx = 16;
    let wIdx = 3;

    while (feed.length < limit && (pIdx < personalized.length || wIdx < wildcards.length)) {
      // Adiciona 7 personalizados
      for (let i = 0; i < 7 && feed.length < limit; i++) {
        if (personalized[pIdx]) addUnique(personalized[pIdx++]);
      }
      
      // Adiciona 1 wildcard
      if (feed.length < limit && wildcards[wIdx]) {
        addUnique(wildcards[wIdx++]);
      }
    }

    return feed;
  },

  /**
   * Shuffle parcial - mantém top N fixo, embaralha o meio
   */
  partialShuffle(array, startIndex, endIndex) {
    if (array.length <= startIndex) return array;

    const result = [...array];
    const actualEnd = Math.min(endIndex, result.length);
    const section = result.slice(startIndex, actualEnd);
    
    // Fisher-Yates shuffle na seção
    for (let i = section.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [section[i], section[j]] = [section[j], section[i]];
    }
    
    // Reinsere seção embaralhada
    result.splice(startIndex, section.length, ...section);
    return result;
  },

  /**
   * Adiciona metadados para exibição (badges, urgência, etc)
   */
  addDisplayMetadata(articles) {
    return articles.map((article, index) => {
      const urgency = this.classifyUrgency(article);
      
      return {
        ...article,
        position: index + 1,
        display: {
          show_breaking_badge: article.is_breaking || urgency.level === 'breaking',
          show_live_badge: urgency.level === 'live',
          show_new_badge: urgency.level === 'new',
          show_discovery_badge: article.is_wildcard,
          urgency_badge: urgency.badge,
          urgency_color: urgency.color,
          time_ago: this.getTimeAgo(article.published_at)
        }
      };
    });
  },

  /**
   * Classifica nível de urgência de um artigo
   */
  classifyUrgency(article) {
    if (!article.published_at) {
      return { level: 'normal', badge: null, color: null };
    }

    const now = new Date();
    const published = new Date(article.published_at);
    const ageMinutes = (now - published) / 60000;

    // Se já tem urgência definida, usa
    if (article.urgency) return article.urgency;

    // 🔴 AO VIVO - menos de 10 minutos
    if (ageMinutes < 10) {
      return {
        level: 'live',
        badge: '🔴 AO VIVO',
        color: '#FF0000'
      };
    }

    // ⚡ URGENTE - menos de 30 minutos
    if (ageMinutes < 30) {
      return {
        level: 'breaking',
        badge: '⚡ URGENTE',
        color: '#FF6B00'
      };
    }

    // 🆕 NOVO - menos de 2 horas
    if (ageMinutes < 120) {
      return {
        level: 'new',
        badge: '🆕 NOVO',
        color: '#00AA00'
      };
    }

    return { level: 'normal', badge: null, color: null };
  },

  /**
   * Calcula "há quanto tempo" de forma amigável
   */
  getTimeAgo(date) {
    if (!date) return null;
    
    const now = new Date();
    const published = new Date(date);
    const diffMs = now - published;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'agora';
    if (diffMins < 60) return `há ${diffMins} min`;
    if (diffHours < 24) return `há ${diffHours}h`;
    if (diffDays === 1) return 'ontem';
    return `há ${diffDays} dias`;
  },

  /**
   * Busca configuração do feed
   */
  async getConfig() {
    try {
      const result = await query(`
        SELECT value FROM engagement_config WHERE key = 'feed_config'
      `);
      
      if (result.rows[0]?.value) {
        return {
          WILDCARD_PERCENTAGE: result.rows[0].value.WILDCARD_PERCENTAGE || DEFAULT_CONFIG.WILDCARD_PERCENTAGE,
          BREAKING_TOP_POSITIONS: result.rows[0].value.BREAKING_TOP_POSITIONS || DEFAULT_CONFIG.BREAKING_TOP_POSITIONS,
          SHUFFLE_START: result.rows[0].value.SHUFFLE_START || DEFAULT_CONFIG.SHUFFLE_START,
          SHUFFLE_END: result.rows[0].value.SHUFFLE_END || DEFAULT_CONFIG.SHUFFLE_END
        };
      }
    } catch (e) {
      // Usa padrão se falhar
    }
    
    return DEFAULT_CONFIG;
  },

  /**
   * Feed mais simples para conteúdo infinito (quando precisa de mais)
   */
  async getMoreContent(userId, offset, limit = 30) {
    // Tenta feed personalizado
    let articles = await this.getAddictiveFeed(userId, { limit, offset });

    if (articles.length >= limit) {
      return articles;
    }

    // Fallback 1: Artigos que usuário viu mas não clicou
    const revisit = await this.getUnclickedImpressions(userId, limit - articles.length);
    articles = [...articles, ...revisit];

    if (articles.length >= limit) {
      return articles;
    }

    // Fallback 2: Artigos populares da semana
    const popular = await this.getPopularThisWeek(limit - articles.length);
    articles = [...articles, ...popular];

    // NUNCA retorna vazio
    return articles;
  },

  /**
   * Artigos que o usuário viu mas não clicou
   */
  async getUnclickedImpressions(userId, limit) {
    const result = await query(`
      SELECT DISTINCT a.*, s.name as site_name, c.name as category_name
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      JOIN user_interactions ui ON a.id = ui.article_id
      WHERE ui.user_id = $1
        AND ui.interaction_type = 'impression'
        AND NOT EXISTS (
          SELECT 1 FROM user_interactions ui2
          WHERE ui2.user_id = $1 
            AND ui2.article_id = a.id
            AND ui2.interaction_type = 'click'
        )
      ORDER BY ui.created_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows.map(a => ({
      ...a,
      feed_type: 'revisit'
    }));
  },

  /**
   * Artigos populares da última semana
   */
  async getPopularThisWeek(limit) {
    const result = await query(`
      SELECT a.*, s.name as site_name, c.name as category_name,
             COUNT(ui.id) as popularity
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN user_interactions ui ON a.id = ui.article_id
      WHERE a.published_at > NOW() - INTERVAL '7 days'
      GROUP BY a.id, s.name, c.name
      ORDER BY popularity DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(a => ({
      ...a,
      feed_type: 'popular'
    }));
  }
};

export default EngagementFeedService;

