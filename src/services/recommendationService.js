/**
 * Recommendation Service
 * Implementa o algoritmo de recomendação "For You"
 * 
 * Fases:
 * - Fase 1: Feed baseado em categorias preferidas ✅
 * - Fase 2: Implicit Feedback ✅
 * - Fase 3: Content-Based com embeddings ✅
 * - Fase 4: Collaborative Filtering (futuro)
 * - Fase 5: Sistema Híbrido (futuro)
 */

import Article from '../models/Article.js';
import UserCategoryPreference from '../models/UserCategoryPreference.js';
import UserInteraction from '../models/UserInteraction.js';
import EmbeddingService from './embeddingService.js';
import { query } from '../config/database.js';

const RecommendationService = {
  /**
   * Gera feed "For You" personalizado
   * Combina: Categorias preferidas + Embeddings (Content-Based)
   * @param {number} userId - ID do usuário
   * @param {number} limit - Número de artigos (default: 50)
   * @returns {Promise<Array>} - Artigos ordenados por relevância
   */
  async getForYouFeed(userId, limit = 50) {
    console.log(`\n🎯 Gerando feed "For You" para usuário ${userId}...`);

    // 1. Busca perfil do usuário (inclui embedding do perfil)
    const userProfile = await this.getUserProfile(userId);

    // 2. Se usuário novo (sem interações), retorna feed cronológico
    if (!userProfile.hasInteractions) {
      console.log('   ℹ️ Usuário novo - retornando feed cronológico');
      return await Article.findAll({ limit });
    }

    // 3. Gera candidatos de múltiplas fontes
    let candidates = [];
    
    // 3a. Candidatos por categorias preferidas
    const categoryBased = await this.getCandidatesByCategories(userId, userProfile, limit * 2);
    console.log(`   📂 Candidatos por categoria: ${categoryBased.length}`);
    
    // 3b. Candidatos por embedding (Content-Based) - se disponível
    let embeddingBased = [];
    if (userProfile.hasEmbedding) {
      embeddingBased = await this.getCandidatesByEmbedding(userProfile, limit);
      console.log(`   🧠 Candidatos por embedding: ${embeddingBased.length}`);
    }
    
    // 3c. Combina candidatos (remove duplicados)
    const seenIds = new Set();
    for (const article of [...embeddingBased, ...categoryBased]) {
      if (!seenIds.has(article.id)) {
        seenIds.add(article.id);
        candidates.push(article);
      }
    }
    console.log(`   📋 Total candidatos únicos: ${candidates.length}`);

    // 4. Calcula scores para cada candidato
    const scored = await this.scoreArticles(candidates, userProfile);

    // 5. Aplica diversidade (evita repetir mesma categoria muito)
    const diversified = this.applyDiversity(scored, { maxSameCategoryInRow: 3 });

    // 6. Retorna top N
    const result = diversified.slice(0, limit);
    
    console.log(`   ✅ Feed gerado: ${result.length} artigos (${userProfile.hasEmbedding ? 'com' : 'sem'} embeddings)`);
    return result;
  },

  /**
   * Busca perfil do usuário (incluindo embedding do perfil)
   * @param {number} userId
   */
  async getUserProfile(userId) {
    // Busca preferências de categoria
    const preferences = await UserCategoryPreference.findByUserId(userId);

    // Busca interações recentes
    const recentInteractions = await UserInteraction.findByUserId(userId, { limit: 50 });

    // Categorias recentes (para diversidade)
    const recentCategories = [];
    for (const interaction of recentInteractions.slice(0, 20)) {
      if (interaction.category_id && !recentCategories.includes(interaction.category_id)) {
        recentCategories.push(interaction.category_id);
      }
    }

    // IDs de artigos clicados (para calcular embedding do perfil)
    const clickedArticleIds = recentInteractions
      .filter(i => i.interaction_type === 'click')
      .map(i => i.article_id);

    // Calcula embedding do perfil (média dos embeddings dos artigos clicados)
    let profileEmbedding = null;
    if (clickedArticleIds.length > 0) {
      try {
        const articlesWithEmbeddings = await Article.findEmbeddingsByIds(clickedArticleIds);
        const embeddings = articlesWithEmbeddings
          .filter(a => a.embedding)
          .map(a => a.embedding);
        
        if (embeddings.length > 0) {
          profileEmbedding = EmbeddingService.averageEmbeddings(embeddings);
        }
      } catch (error) {
        console.warn('Erro ao calcular embedding do perfil:', error.message);
      }
    }

    return {
      userId,
      preferences,
      recentCategories,
      seenArticleIds: clickedArticleIds,
      profileEmbedding,
      hasInteractions: recentInteractions.length > 0,
      hasEmbedding: profileEmbedding !== null
    };
  },

  /**
   * Gera candidatos baseado em categorias preferidas
   * @param {number} userId
   * @param {Object} userProfile
   * @param {number} limit
   */
  async getCandidatesByCategories(userId, userProfile, limit) {
    const { preferences, seenArticleIds } = userProfile;

    // Se não tem preferências, busca categorias mais interagidas
    let categoryIds = preferences.map(p => p.category_id);

    if (categoryIds.length === 0) {
      const topCategories = await UserInteraction.getMostInteractedCategories(userId, 5);
      categoryIds = topCategories.map(c => c.category_id);
    }

    // Se ainda não tem, retorna artigos recentes de todas as categorias
    if (categoryIds.length === 0) {
      return await Article.findAll({ limit });
    }

    // Busca artigos das categorias preferidas
    // Exclui artigos já clicados
    const excludeIds = seenArticleIds.length > 0 ? seenArticleIds : [-1];

    const result = await query(
      `SELECT a.*, 
              s.name as site_name, 
              s.url as site_url,
              c.id as category_id,
              c.name as category_name,
              c.slug as category_slug
       FROM articles a
       JOIN sites s ON a.site_id = s.id
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.category_id = ANY($1)
         AND a.id != ALL($2)
         AND (a.published_at > NOW() - INTERVAL '7 days' 
              OR a.created_at > NOW() - INTERVAL '7 days')
       ORDER BY COALESCE(a.published_at, a.created_at) DESC NULLS LAST
       LIMIT $3`,
      [categoryIds, excludeIds, limit]
    );

    return result.rows;
  },

  /**
   * Gera candidatos baseado em similaridade de embeddings (Content-Based)
   * @param {Object} userProfile
   * @param {number} limit
   */
  async getCandidatesByEmbedding(userProfile, limit) {
    const { profileEmbedding, seenArticleIds, preferences } = userProfile;

    if (!profileEmbedding) {
      return [];
    }

    // Busca artigos similares ao perfil do usuário
    const categoryIds = preferences.map(p => p.category_id);
    
    const candidates = await Article.findSimilarByEmbedding(profileEmbedding, {
      categoryIds: categoryIds.length > 0 ? categoryIds : null,
      excludeIds: seenArticleIds,
      limit
    });

    return candidates;
  },

  /**
   * Calcula score para cada artigo
   * Combina: categoria + frescor + similaridade (se disponível)
   * @param {Array} articles
   * @param {Object} userProfile
   */
  async scoreArticles(articles, userProfile) {
    const { preferences, hasEmbedding } = userProfile;
    const preferenceMap = new Map(preferences.map(p => [p.category_id, p.preference_score]));

    const scored = articles.map(article => {
      // Score de categoria (0 a 1)
      const categoryScore = preferenceMap.get(article.category_id) || 0.3;

      // Score de frescor (0 a 1)
      const freshnessScore = this.calculateFreshness(article.published_at);

      // Score de similaridade (se veio da busca por embedding)
      const similarityScore = article.similarity || 0;

      // Score final (pesos ajustáveis)
      let finalScore;
      if (hasEmbedding && similarityScore > 0) {
        // Com embeddings: 40% categoria, 30% similaridade, 30% frescor
        finalScore = 
          (categoryScore * 0.4) +
          (similarityScore * 0.3) +
          (freshnessScore * 0.3);
      } else {
        // Sem embeddings: 60% categoria, 40% frescor
        finalScore = 
          (categoryScore * 0.6) +
          (freshnessScore * 0.4);
      }

      return {
        ...article,
        score: finalScore,
        scores: {
          category: categoryScore,
          similarity: similarityScore,
          freshness: freshnessScore
        }
      };
    });

    // Ordena por score decrescente
    scored.sort((a, b) => b.score - a.score);

    return scored;
  },

  /**
   * Calcula score de frescor (quanto mais recente, melhor)
   * @param {Date|string} publishedAt
   * @returns {number} - Score de 0 a 1
   */
  calculateFreshness(publishedAt) {
    if (!publishedAt) return 0.5;

    const published = new Date(publishedAt);
    const now = new Date();
    const hoursAgo = (now - published) / (1000 * 60 * 60);

    // Artigos mais recentes têm score maior
    if (hoursAgo < 1) return 1.0;       // < 1h
    if (hoursAgo < 3) return 0.95;      // 1-3h
    if (hoursAgo < 6) return 0.9;       // 3-6h
    if (hoursAgo < 12) return 0.8;      // 6-12h
    if (hoursAgo < 24) return 0.7;      // 12-24h
    if (hoursAgo < 48) return 0.5;      // 1-2 dias
    if (hoursAgo < 72) return 0.3;      // 2-3 dias
    return 0.1;                          // > 3 dias
  },

  /**
   * Aplica diversidade ao feed (evita repetir mesma categoria muito)
   * @param {Array} articles
   * @param {Object} options
   */
  applyDiversity(articles, { maxSameCategoryInRow = 3 } = {}) {
    const result = [];
    const categoryCount = new Map();
    let lastCategories = [];

    for (const article of articles) {
      const categoryId = article.category_id;

      // Conta quantos da mesma categoria nas últimas posições
      const recentSameCategory = lastCategories
        .slice(-maxSameCategoryInRow)
        .filter(id => id === categoryId).length;

      // Se já tem muitos da mesma categoria seguidos, pula para depois
      if (recentSameCategory >= maxSameCategoryInRow) {
        continue;
      }

      result.push(article);
      lastCategories.push(categoryId);
    }

    return result;
  },

  /**
   * Atualiza preferências do usuário baseado em interações
   * @param {number} userId
   */
  async updateUserPreferences(userId) {
    console.log(`\n📊 Atualizando preferências do usuário ${userId}...`);

    // Busca interações dos últimos 7 dias
    const interactions = await UserInteraction.findByUserId(userId, { limit: 500 });

    if (interactions.length === 0) {
      console.log('   ℹ️ Sem interações para atualizar');
      return;
    }

    // Agrupa por categoria e calcula scores
    const categoryScores = new Map();

    for (const interaction of interactions) {
      if (!interaction.category_id) continue;

      const categoryId = interaction.category_id;
      const currentScore = categoryScores.get(categoryId) || 0;

      // Calcula score baseado no tipo
      let score = 0;
      switch (interaction.interaction_type) {
        case 'click':
          score = 1.0;
          break;
        case 'view':
          score = Math.min((interaction.duration || 0) / 10000, 0.8);
          break;
        case 'scroll_stop':
          score = 0.3;
          break;
        case 'impression':
          score = 0.05;
          break;
      }

      categoryScores.set(categoryId, currentScore + score);
    }

    // Normaliza scores (0 a 1)
    const maxScore = Math.max(...categoryScores.values(), 1);

    for (const [categoryId, score] of categoryScores) {
      const normalizedScore = Math.min(score / maxScore, 1.0);

      await UserCategoryPreference.upsert({
        userId,
        categoryId,
        preferenceScore: normalizedScore
      });

      console.log(`   📌 Categoria ${categoryId}: score ${normalizedScore.toFixed(2)}`);
    }

    console.log(`   ✅ ${categoryScores.size} categorias atualizadas`);
  },

  /**
   * Obtém estatísticas de recomendação para debug
   * @param {number} userId
   */
  async getRecommendationStats(userId) {
    const profile = await this.getUserProfile(userId);
    const topCategories = await UserInteraction.getMostInteractedCategories(userId, 10);

    return {
      userId,
      hasInteractions: profile.hasInteractions,
      preferenceCount: profile.preferences.length,
      topPreferences: profile.preferences.slice(0, 5).map(p => ({
        category: p.category_name,
        score: p.preference_score
      })),
      topInteractedCategories: topCategories.slice(0, 5).map(c => ({
        category: c.category_name,
        interactions: c.interaction_count,
        clicks: c.clicks
      })),
      seenArticlesCount: profile.seenArticleIds.length
    };
  }
};

export default RecommendationService;

