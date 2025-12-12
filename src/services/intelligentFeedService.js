/**
 * Intelligent Feed Service
 * Feed personalizado usando scores hierárquicos e estratégias científicas
 * 
 * Implementa:
 * - Scores hierárquicos (preferências em nível 1, 2, 3)
 * - Exploration vs Exploitation (80/20)
 * - Diversificação por subcategoria
 * - Feedback negativo (evita categorias ignoradas)
 * 
 * Baseado em:
 * - HieRec (Microsoft): Hierarchical User Interest Modeling
 * - Adaptive Exploration Frameworks for News Recommendation
 */

import { query } from '../config/database.js';
import PreferenceService from './preferenceService.js';

// Configuração do feed
const FEED_CONFIG = {
  // Proporção exploration/exploitation
  EXPLOITATION_RATIO: 0.80,  // 80% baseado em preferências
  EXPLORATION_RATIO: 0.20,   // 20% descoberta de novos interesses
  
  // Diversificação
  MAX_CONSECUTIVE_SAME_CATEGORY: 3,  // Máximo de artigos seguidos da mesma categoria
  MIN_CATEGORY_DIVERSITY: 3,         // Mínimo de categorias diferentes no feed
  
  // Estratégias de exploration
  EXPLORATION_STRATEGIES: {
    sibling: 0.5,      // 50% - mostrar subcategorias irmãs
    parent: 0.3,       // 30% - mostrar outras subcategorias do mesmo pai
    trending: 0.2      // 20% - mostrar trending geral
  },
  
  // Penalidades
  RECENTLY_SEEN_PENALTY: 0.5,  // Reduz score se já viu recentemente
  LOW_CTR_PENALTY: 0.7         // Reduz score se CTR baixo
};

const IntelligentFeedService = {
  /**
   * Gera feed personalizado com estratégias científicas
   * @param {number} userId
   * @param {Object} options - { limit, offset }
   */
  async getPersonalizedFeed(userId, { limit = 50, offset = 0 } = {}) {
    console.log(`\n🎯 Gerando feed inteligente para usuário ${userId}...`);

    // 1. Busca preferências hierárquicas do usuário
    const preferences = await PreferenceService.getHierarchicalPreferences(userId);
    
    // 2. Calcula quantos artigos de cada tipo
    const exploitationCount = Math.floor(limit * FEED_CONFIG.EXPLOITATION_RATIO);
    const explorationCount = limit - exploitationCount;

    console.log(`   📊 Exploitation: ${exploitationCount}, Exploration: ${explorationCount}`);

    // 3. Busca artigos de exploitation (baseado em preferências)
    const exploitationArticles = await this.getExploitationArticles(
      userId, 
      preferences, 
      exploitationCount + offset
    );

    // 4. Busca artigos de exploration (descoberta)
    const explorationArticles = await this.getExplorationArticles(
      userId,
      preferences,
      explorationCount
    );

    // 5. Mescla e diversifica
    let feed = this.mergeAndDiversify(
      exploitationArticles,
      explorationArticles,
      FEED_CONFIG.MAX_CONSECUTIVE_SAME_CATEGORY
    );

    // 6. Aplica offset e limit
    feed = feed.slice(offset, offset + limit);

    // 7. Adiciona metadados de explicação
    feed = this.addExplanations(feed, preferences);

    console.log(`   ✅ Feed gerado: ${feed.length} artigos`);
    return feed;
  },

  /**
   * Busca artigos baseados nas preferências do usuário (exploitation)
   * @param {number} userId
   * @param {Object} preferences - Preferências hierárquicas
   * @param {number} limit
   */
  async getExploitationArticles(userId, preferences, limit) {
    // Extrai IDs das categorias preferidas (todos os níveis)
    const allPreferredCategories = [
      ...preferences.level3.map(p => p.category_id),
      ...preferences.level2.map(p => p.category_id),
      ...preferences.level1.map(p => p.category_id)
    ].filter(Boolean);

    if (allPreferredCategories.length === 0) {
      // Usuário novo - retorna artigos recentes
      return this.getRecentArticles(limit);
    }

    // Query com score ponderado
    const result = await query(`
      WITH article_scores AS (
        SELECT 
          a.id,
          a.title,
          a.summary,
          a.url,
          a.image_url,
          a.published_at,
          a.created_at,
          a.category_id,
          a.category_path,
          a.category_confidence,
          s.name as site_name,
          c.name as category_name,
          c.slug as category_slug,
          c.level as category_level,
          COALESCE(uhp.preference_score, 0.1) as user_preference,
          -- Score final: preferência * confiança da classificação * recência
          COALESCE(uhp.preference_score, 0.1) 
          * COALESCE(a.category_confidence, 0.5)
          * (1.0 / (1.0 + EXTRACT(HOUR FROM NOW() - a.published_at) / 24.0))
          as relevance_score
        FROM articles a
        JOIN sites s ON a.site_id = s.id
        LEFT JOIN categories c ON a.category_id = c.id
        LEFT JOIN user_hierarchical_preferences uhp 
          ON uhp.category_id = a.category_id AND uhp.user_id = $1
        WHERE a.category_id = ANY($2::int[])
          AND a.published_at > NOW() - INTERVAL '7 days'
      )
      SELECT *,
        'exploitation' as feed_type,
        relevance_score as score
      FROM article_scores
      ORDER BY relevance_score DESC, published_at DESC
      LIMIT $3
    `, [userId, allPreferredCategories, limit]);

    return result.rows;
  },

  /**
   * Busca artigos para descoberta (exploration)
   * @param {number} userId
   * @param {Object} preferences
   * @param {number} limit
   */
  async getExplorationArticles(userId, preferences, limit) {
    // Estratégias de exploration
    const strategies = FEED_CONFIG.EXPLORATION_STRATEGIES;
    const siblingCount = Math.floor(limit * strategies.sibling);
    const parentCount = Math.floor(limit * strategies.parent);
    const trendingCount = limit - siblingCount - parentCount;

    const articles = [];

    // 1. Subcategorias irmãs (mesmo pai, diferente filho)
    if (siblingCount > 0 && preferences.level2.length > 0) {
      const siblingArticles = await this.getSiblingCategoryArticles(
        userId,
        preferences.level2.map(p => p.category_id),
        siblingCount
      );
      articles.push(...siblingArticles);
    }

    // 2. Outras subcategorias do mesmo pai
    if (parentCount > 0 && preferences.level1.length > 0) {
      const parentArticles = await this.getParentCategoryArticles(
        userId,
        preferences.level1.map(p => p.category_id),
        preferences.level2.map(p => p.category_id),
        parentCount
      );
      articles.push(...parentArticles);
    }

    // 3. Trending geral (categorias que o usuário nunca interagiu)
    if (trendingCount > 0) {
      const trendingArticles = await this.getTrendingArticles(
        userId,
        [...(preferences.level1.map(p => p.category_id) || []),
         ...(preferences.level2.map(p => p.category_id) || []),
         ...(preferences.level3.map(p => p.category_id) || [])],
        trendingCount
      );
      articles.push(...trendingArticles);
    }

    return articles;
  },

  /**
   * Busca artigos de subcategorias irmãs
   */
  async getSiblingCategoryArticles(userId, userCategoryIds, limit) {
    const result = await query(`
      WITH user_parents AS (
        SELECT DISTINCT parent_id 
        FROM categories 
        WHERE id = ANY($1::int[]) AND parent_id IS NOT NULL
      ),
      sibling_categories AS (
        SELECT c.id
        FROM categories c
        JOIN user_parents up ON c.parent_id = up.parent_id
        WHERE c.id != ALL($1::int[])
      )
      SELECT 
        a.*,
        s.name as site_name,
        c.name as category_name,
        c.slug as category_slug,
        'exploration_sibling' as feed_type,
        0.3 as score -- Score fixo para exploration
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      JOIN categories c ON a.category_id = c.id
      JOIN sibling_categories sc ON a.category_id = sc.id
      WHERE a.published_at > NOW() - INTERVAL '3 days'
      ORDER BY a.published_at DESC
      LIMIT $2
    `, [userCategoryIds, limit]);

    return result.rows;
  },

  /**
   * Busca artigos de outras subcategorias do mesmo pai
   */
  async getParentCategoryArticles(userId, parentCategoryIds, excludeCategoryIds, limit) {
    const result = await query(`
      SELECT 
        a.*,
        s.name as site_name,
        c.name as category_name,
        c.slug as category_slug,
        'exploration_parent' as feed_type,
        0.25 as score
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      JOIN categories c ON a.category_id = c.id
      WHERE c.parent_id = ANY($1::int[])
        AND a.category_id != ALL($2::int[])
        AND a.published_at > NOW() - INTERVAL '3 days'
      ORDER BY a.published_at DESC
      LIMIT $3
    `, [parentCategoryIds, excludeCategoryIds || [], limit]);

    return result.rows;
  },

  /**
   * Busca artigos trending de categorias que o usuário nunca interagiu
   */
  async getTrendingArticles(userId, excludeCategoryIds, limit) {
    const result = await query(`
      SELECT 
        a.*,
        s.name as site_name,
        c.name as category_name,
        c.slug as category_slug,
        'exploration_trending' as feed_type,
        0.2 as score,
        COUNT(ui.id) as interaction_count
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN user_interactions ui ON a.id = ui.article_id
      WHERE (a.category_id != ALL($1::int[]) OR $1 = '{}')
        AND a.published_at > NOW() - INTERVAL '24 hours'
      GROUP BY a.id, s.name, c.name, c.slug
      ORDER BY interaction_count DESC, a.published_at DESC
      LIMIT $2
    `, [excludeCategoryIds || [], limit]);

    return result.rows;
  },

  /**
   * Busca artigos recentes (fallback para usuários novos)
   */
  async getRecentArticles(limit) {
    const result = await query(`
      SELECT 
        a.*,
        s.name as site_name,
        c.name as category_name,
        c.slug as category_slug,
        'recent' as feed_type,
        0.5 as score
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.published_at > NOW() - INTERVAL '24 hours'
      ORDER BY a.published_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  },

  /**
   * Mescla artigos de exploitation e exploration com diversificação
   */
  mergeAndDiversify(exploitationArticles, explorationArticles, maxConsecutive) {
    const feed = [];
    const categoryCount = {};
    const usedIds = new Set();

    // Helper para adicionar artigo com verificação de diversidade
    const addArticle = (article) => {
      if (usedIds.has(article.id)) return false;
      
      const catId = article.category_id || 'none';
      categoryCount[catId] = (categoryCount[catId] || 0) + 1;
      
      // Verifica se excedeu máximo consecutivo
      if (categoryCount[catId] > maxConsecutive) {
        // Tenta adicionar depois
        return false;
      }
      
      usedIds.add(article.id);
      feed.push(article);
      return true;
    };

    // Intercala exploitation (80%) com exploration (20%)
    let expIdx = 0;
    let explIdx = 0;
    let exploitationTurn = 0;

    while (expIdx < exploitationArticles.length || explIdx < explorationArticles.length) {
      // A cada 5 artigos, 4 são exploitation e 1 é exploration
      if (exploitationTurn < 4 && expIdx < exploitationArticles.length) {
        if (addArticle(exploitationArticles[expIdx])) {
          exploitationTurn++;
        }
        expIdx++;
      } else if (explIdx < explorationArticles.length) {
        if (addArticle(explorationArticles[explIdx])) {
          exploitationTurn = 0;
        }
        explIdx++;
      } else if (expIdx < exploitationArticles.length) {
        addArticle(exploitationArticles[expIdx]);
        expIdx++;
      }
    }

    return feed;
  },

  /**
   * Adiciona explicações de por que cada artigo aparece
   */
  addExplanations(articles, preferences) {
    const preferredCategoryIds = new Set([
      ...preferences.level1.map(p => p.category_id),
      ...preferences.level2.map(p => p.category_id),
      ...preferences.level3.map(p => p.category_id)
    ]);

    return articles.map((article, index) => {
      let explanation = '';
      
      if (article.feed_type === 'exploitation') {
        const pref = [...preferences.level3, ...preferences.level2, ...preferences.level1]
          .find(p => p.category_id === article.category_id);
        
        if (pref) {
          const percentage = (pref.preference_score * 100).toFixed(0);
          explanation = `Baseado no seu interesse em ${pref.category_name} (${percentage}%)`;
        } else {
          explanation = 'Recomendado para você';
        }
      } else if (article.feed_type === 'exploration_sibling') {
        explanation = '🔍 Descobrindo: similar ao que você gosta';
      } else if (article.feed_type === 'exploration_parent') {
        explanation = '🔍 Descobrindo: mesma área de interesse';
      } else if (article.feed_type === 'exploration_trending') {
        explanation = '📈 Em alta agora';
      } else {
        explanation = 'Notícia recente';
      }

      return {
        ...article,
        position: index + 1,
        explanation,
        is_exploration: article.feed_type?.startsWith('exploration'),
        match_percentage: preferredCategoryIds.has(article.category_id) 
          ? (article.score * 100).toFixed(0) 
          : null
      };
    });
  },

  /**
   * Retorna configuração atual do feed
   */
  getConfig() {
    return FEED_CONFIG;
  }
};

export default IntelligentFeedService;
export { FEED_CONFIG };
