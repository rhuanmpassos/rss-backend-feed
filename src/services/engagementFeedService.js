/**
 * Engagement Feed Service
 * Gera feed otimizado para engajamento máximo
 * 
 * ATUALIZADO: Agora usa sistema de scores hierárquicos IPTC
 * 
 * Estratégia:
 * 1. Breaking news no topo (urgência)
 * 2. Artigos personalizados com scores relativos (relevância)
 * 3. Exploration (20%) - descoberta de novos interesses
 * 4. Shuffle parcial (imprevisibilidade)
 * 
 * Melhorias científicas:
 * - Scores normalizados (softmax) - somam 100%
 * - Decay temporal - interesses antigos perdem peso
 * - Feedback negativo implícito - CTR baixo = penalidade
 * - Hierarquia IPTC - exploration em subcategorias irmãs
 */

import { query } from '../config/database.js';
import PreferenceService from './preferenceService.js';
import PredictionService from './predictionService.js';
import UserProfile from '../models/UserProfile.js';

// Configuração padrão - ATUALIZADA com exploration/exploitation
const DEFAULT_CONFIG = {
  EXPLOITATION_RATIO: 0.80,      // 80% baseado em preferências
  EXPLORATION_RATIO: 0.20,       // 20% descoberta
  BREAKING_TOP_POSITIONS: 2,
  SHUFFLE_START: 5,
  SHUFFLE_END: 20,
  MAX_CONSECUTIVE_SAME_CATEGORY: 3  // Diversificação
};

const EngagementFeedService = {
  /**
   * Gera feed otimizado para engajamento
   * ATUALIZADO: Usa scores hierárquicos IPTC com exploration/exploitation
   * 
   * @param {number} userId
   * @param {Object} options - { limit, offset }
   */
  async getAddictiveFeed(userId, { limit = 50, offset = 0 } = {}) {
    console.log(`\n🎰 Gerando feed For You para usuário ${userId}...`);

    const config = await this.getConfig();

    // Calcula quantos artigos de cada tipo
    const exploitationCount = Math.floor(limit * config.EXPLOITATION_RATIO);
    const explorationCount = limit - exploitationCount;

    // 1. Busca componentes do feed em paralelo
    const [breakingNews, exploitationArticles, explorationArticles] = await Promise.all([
      this.getBreakingNews(config.BREAKING_TOP_POSITIONS + 3),
      this.getExploitationArticles(userId, exploitationCount + 10), // Extra para diversificação
      this.getExplorationArticles(userId, explorationCount + 5)
    ]);

    console.log(`   📰 Breaking: ${breakingNews.length}`);
    console.log(`   ✨ Exploitation (preferências): ${exploitationArticles.length}`);
    console.log(`   🔍 Exploration (descoberta): ${explorationArticles.length}`);

    // 2. Monta feed com diversificação
    let feed = this.assembleFeedWithDiversity({
      breaking: breakingNews,
      exploitation: exploitationArticles,
      exploration: explorationArticles,
      config,
      limit: limit + offset
    });

    // 3. Aplica predição de clique para ranking final
    try {
      console.log(`   🎯 Aplicando predição de clique...`);
      feed = await PredictionService.rankArticlesByPrediction(userId, feed);
    } catch (e) {
      console.warn(`   ⚠️ Predição não aplicada: ${e.message}`);
    }

    // 4. Aplica shuffle parcial (cria imprevisibilidade)
    feed = this.partialShuffle(feed, config.SHUFFLE_START, config.SHUFFLE_END);

    // 5. Adiciona metadados de exibição e explicação
    feed = this.addDisplayMetadata(feed);

    // 6. Aplica offset e limit
    const result = feed.slice(offset, offset + limit);

    console.log(`   ✅ Feed gerado: ${result.length} artigos (${exploitationCount} exploit + ${explorationCount} explore)`);
    
    return result;
  },

  /**
   * Busca artigos baseados nas preferências do usuário (exploitation)
   * Usa scores hierárquicos normalizados
   */
  async getExploitationArticles(userId, limit) {
    // Busca preferências hierárquicas do usuário
    const preferences = await PreferenceService.getUserPreferences(userId, 20);
    
    if (!preferences || preferences.length === 0) {
      // Usuário novo - retorna artigos recentes populares
      return this.getRecentPopularArticles(limit);
    }

    // Extrai IDs das categorias preferidas
    const categoryIds = preferences.map(p => p.category_id).filter(Boolean);

    if (categoryIds.length === 0) {
      return this.getRecentPopularArticles(limit);
    }

    // Query com score ponderado pela preferência do usuário
    const result = await query(`
      WITH user_prefs AS (
        SELECT category_id, preference_score
        FROM user_hierarchical_preferences
        WHERE user_id = $1
      )
      SELECT 
        a.*,
        s.name as site_name,
        c.name as category_name,
        c.slug as category_slug,
        c.level as category_level,
        c.path as category_path,
        COALESCE(up.preference_score, 0.1) as user_preference,
        'exploitation' as feed_type,
        -- Score: preferência × confiança × recência
        COALESCE(up.preference_score, 0.1) 
        * COALESCE(a.category_confidence, 0.5)
        * (1.0 / (1.0 + EXTRACT(HOUR FROM NOW() - a.published_at) / 24.0))
        as relevance_score
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN user_prefs up ON a.category_id = up.category_id
      WHERE a.category_id = ANY($2::int[])
        AND a.published_at > NOW() - INTERVAL '7 days'
      ORDER BY relevance_score DESC, a.published_at DESC
      LIMIT $3
    `, [userId, categoryIds, limit]);

    return result.rows.map(a => ({
      ...a,
      score: parseFloat(a.relevance_score) || 0.5,
      explanation: `Baseado no seu interesse em ${a.category_name}`
    }));
  },

  /**
   * Busca artigos para descoberta (exploration)
   * Usa subcategorias irmãs das preferências do usuário
   */
  async getExplorationArticles(userId, limit) {
    // Busca preferências para encontrar subcategorias irmãs
    const preferences = await PreferenceService.getUserPreferences(userId, 10);
    
    if (!preferences || preferences.length === 0) {
      return this.getTrendingArticles(limit);
    }

    const preferredCategoryIds = preferences.map(p => p.category_id).filter(Boolean);

    // Busca artigos de categorias IRMÃS (mesmo pai, diferente filho)
    const result = await query(`
      WITH user_categories AS (
        SELECT DISTINCT c.parent_id
        FROM categories c
        WHERE c.id = ANY($1::int[]) AND c.parent_id IS NOT NULL
      ),
      sibling_categories AS (
        SELECT c.id
        FROM categories c
        JOIN user_categories uc ON c.parent_id = uc.parent_id
        WHERE c.id != ALL($1::int[])
      )
      SELECT 
        a.*,
        s.name as site_name,
        c.name as category_name,
        c.slug as category_slug,
        c.level as category_level,
        c.path as category_path,
        'exploration' as feed_type,
        0.3 as relevance_score
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      JOIN categories c ON a.category_id = c.id
      JOIN sibling_categories sc ON a.category_id = sc.id
      WHERE a.published_at > NOW() - INTERVAL '3 days'
      ORDER BY a.published_at DESC
      LIMIT $2
    `, [preferredCategoryIds, limit]);

    // Se não encontrou irmãs, busca trending
    if (result.rows.length < limit / 2) {
      const trending = await this.getTrendingArticles(limit - result.rows.length);
      return [...result.rows, ...trending].map(a => ({
        ...a,
        score: 0.3,
        is_exploration: true,
        explanation: '🔍 Descobrindo novos interesses'
      }));
    }

    return result.rows.map(a => ({
      ...a,
      score: 0.3,
      is_exploration: true,
      explanation: '🔍 Similar ao que você gosta'
    }));
  },

  /**
   * Artigos recentes populares (fallback para usuários novos)
   */
  async getRecentPopularArticles(limit) {
    const result = await query(`
      SELECT 
        a.*,
        s.name as site_name,
        c.name as category_name,
        c.slug as category_slug,
        'recent' as feed_type,
        0.5 as relevance_score
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.published_at > NOW() - INTERVAL '24 hours'
        AND a.category_id IS NOT NULL
      ORDER BY a.published_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(a => ({
      ...a,
      score: 0.5,
      explanation: 'Notícia recente'
    }));
  },

  /**
   * Artigos em alta (trending)
   */
  async getTrendingArticles(limit) {
    const result = await query(`
      SELECT 
        a.*,
        s.name as site_name,
        c.name as category_name,
        c.slug as category_slug,
        'trending' as feed_type,
        COUNT(ui.id) as interaction_count
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN user_interactions ui ON a.id = ui.article_id
      WHERE a.published_at > NOW() - INTERVAL '24 hours'
        AND a.category_id IS NOT NULL
      GROUP BY a.id, s.name, c.name, c.slug
      ORDER BY interaction_count DESC, a.published_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(a => ({
      ...a,
      score: 0.4,
      is_exploration: true,
      explanation: '📈 Em alta agora'
    }));
  },

  /**
   * Monta feed com diversificação por categoria
   */
  assembleFeedWithDiversity({ breaking, exploitation, exploration, config, limit }) {
    const feed = [];
    const categoryCount = {};
    const usedIds = new Set();

    // Helper para adicionar com verificação
    const addArticle = (article, maxConsecutive = config.MAX_CONSECUTIVE_SAME_CATEGORY) => {
      if (usedIds.has(article.id)) return false;
      
      const catId = article.category_id || 'none';
      const currentCount = categoryCount[catId] || 0;
      
      if (currentCount >= maxConsecutive) return false;
      
      usedIds.add(article.id);
      categoryCount[catId] = currentCount + 1;
      feed.push(article);
      return true;
    };

    // 1. Breaking news primeiro (sem limite de categoria)
    for (const article of breaking.slice(0, config.BREAKING_TOP_POSITIONS)) {
      if (!usedIds.has(article.id)) {
        usedIds.add(article.id);
        feed.push(article);
      }
    }

    // 2. Intercala exploitation (80%) com exploration (20%)
    let expIdx = 0;
    let explIdx = 0;
    let exploitationTurn = 0;

    while (feed.length < limit && (expIdx < exploitation.length || explIdx < exploration.length)) {
      // A cada 5 artigos, 4 são exploitation e 1 é exploration
      if (exploitationTurn < 4 && expIdx < exploitation.length) {
        if (addArticle(exploitation[expIdx])) exploitationTurn++;
        expIdx++;
      } else if (explIdx < exploration.length) {
        if (addArticle(exploration[explIdx])) exploitationTurn = 0;
        explIdx++;
      } else if (expIdx < exploitation.length) {
        addArticle(exploitation[expIdx]);
        expIdx++;
      }
    }

    return feed;
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
   * ATUALIZADO: Suporta exploration e explanation
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
          show_discovery_badge: article.is_wildcard || article.is_exploration,
          show_exploration_badge: article.is_exploration,
          urgency_badge: urgency.badge,
          urgency_color: urgency.color,
          time_ago: this.getTimeAgo(article.published_at),
          explanation: article.explanation || null
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
   * ATUALIZADO: Inclui configuração de exploration/exploitation
   */
  async getConfig() {
    try {
      const result = await query(`
        SELECT value FROM engagement_config WHERE key = 'feed_config'
      `);
      
      if (result.rows[0]?.value) {
        return {
          ...DEFAULT_CONFIG,
          ...result.rows[0].value
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

