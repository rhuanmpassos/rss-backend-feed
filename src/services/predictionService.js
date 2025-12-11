/**
 * Prediction Service
 * Prevê probabilidade de clique para artigos
 * 
 * Responsabilidades:
 * - Calcular P(clique) para cada artigo
 * - Rankear artigos por probabilidade
 * - Prever melhor horário para push
 * 
 * NOTA: Só funciona quando usuário tem dados suficientes
 * (verificar profile.prediction_enabled)
 */

import { query } from '../config/database.js';
import UserProfile from '../models/UserProfile.js';
import EmbeddingService from './embeddingService.js';

// Pesos padrão (podem ser ajustados via config)
const DEFAULT_WEIGHTS = {
  SIMILARITY: 0.40,
  TRIGGERS: 0.25,
  KEYWORDS: 0.20,
  CATEGORY: 0.15
};

const PredictionService = {
  /**
   * Calcula probabilidade de clique para um artigo
   * @param {number} userId
   * @param {Object} article - Artigo com embedding, title, category_id
   * @returns {Object} { score, factors, canPredict }
   */
  async predictClickProbability(userId, article) {
    const profile = await UserProfile.findByUserId(userId);
    
    // Se não tem perfil ou não tem dados suficientes
    if (!profile) {
      return {
        score: 0.5,
        canPredict: false,
        reason: 'no_profile',
        factors: []
      };
    }

    // Verifica se predição está habilitada para este usuário
    if (!profile.prediction_enabled) {
      return {
        score: 0.5,
        canPredict: false,
        reason: 'insufficient_data',
        factors: [],
        progress: {
          current: profile.total_clicks || 0,
          required: 1000,
          percentage: Math.min(100, Math.round((profile.total_clicks || 0) / 10))
        }
      };
    }

    let score = 0.5; // Base
    const factors = [];
    const weights = await this.getWeights();

    // 1. SIMILARIDADE DE EMBEDDING (40% do peso)
    if (profile.profile_embedding && article.embedding) {
      const articleEmbedding = typeof article.embedding === 'string'
        ? article.embedding.slice(1, -1).split(',').map(Number)
        : article.embedding;

      const similarity = EmbeddingService.cosineSimilarity(
        profile.profile_embedding,
        articleEmbedding
      );
      
      const similarityContrib = (similarity - 0.5) * weights.SIMILARITY * 2;
      score += similarityContrib;
      
      factors.push({
        type: 'similarity',
        value: similarity,
        contribution: similarityContrib,
        weight: weights.SIMILARITY
      });
    }

    // 2. GATILHOS EMOCIONAIS (25% do peso)
    if (profile.triggers_enabled && profile.engagement_triggers) {
      const triggers = profile.engagement_triggers;
      const title = article.title.toLowerCase();
      let triggerMultiplier = 1;

      // Urgência
      if (/urgente|agora|última hora|breaking|ao vivo/i.test(title)) {
        triggerMultiplier *= triggers.urgency_multiplier || 1;
        factors.push({ type: 'trigger_urgency', multiplier: triggers.urgency_multiplier });
      }

      // Números no título
      if (/\d+/.test(title)) {
        triggerMultiplier *= triggers.numbers_multiplier || 1;
        factors.push({ type: 'trigger_numbers', multiplier: triggers.numbers_multiplier });
      }

      // Polêmica
      if (/polêmic|escândalo|choca|revela|bomba/i.test(title)) {
        triggerMultiplier *= triggers.controversy_multiplier || 1;
        factors.push({ type: 'trigger_controversy', multiplier: triggers.controversy_multiplier });
      }

      // Exclusividade
      if (/exclusivo|inédito|revelado|primeiro/i.test(title)) {
        triggerMultiplier *= triggers.exclusivity_multiplier || 1;
        factors.push({ type: 'trigger_exclusivity', multiplier: triggers.exclusivity_multiplier });
      }

      // Aplica multiplicador (max 1.5x)
      triggerMultiplier = Math.min(1.5, triggerMultiplier);
      score *= triggerMultiplier;
    }

    // 3. KEYWORDS DE ALTA AFINIDADE (20% do peso)
    if (profile.engagement_triggers?.high_ctr_keywords) {
      const highCtrKeywords = profile.engagement_triggers.high_ctr_keywords;
      const titleWords = article.title.toLowerCase().split(/\s+/);
      const matchedKeywords = titleWords.filter(w => highCtrKeywords.includes(w));
      
      if (matchedKeywords.length > 0) {
        const keywordBoost = Math.min(0.2, matchedKeywords.length * 0.05);
        score += keywordBoost;
        factors.push({
          type: 'keywords',
          matched: matchedKeywords,
          boost: keywordBoost
        });
      }
    }

    // 4. PREFERÊNCIA DE CATEGORIA (15% do peso)
    if (article.category_id) {
      const categoryPref = await query(`
        SELECT preference_score FROM user_category_preferences
        WHERE user_id = $1 AND category_id = $2
      `, [userId, article.category_id]);

      if (categoryPref.rows[0]) {
        const prefScore = parseFloat(categoryPref.rows[0].preference_score);
        const categoryContrib = (prefScore - 0.5) * weights.CATEGORY * 2;
        score += categoryContrib;
        factors.push({
          type: 'category',
          score: prefScore,
          contribution: categoryContrib
        });
      }
    }

    // Normaliza score entre 0 e 1
    score = Math.max(0.05, Math.min(0.95, score));

    return {
      score,
      canPredict: true,
      predicted_ctr: Math.round(score * 100),
      factors
    };
  },

  /**
   * Rankeia artigos por probabilidade de clique
   * @param {number} userId
   * @param {Array} articles
   * @returns {Array} Artigos ordenados com scores
   */
  async rankArticlesByPrediction(userId, articles) {
    const predictions = await Promise.all(
      articles.map(async (article) => {
        const prediction = await this.predictClickProbability(userId, article);
        return {
          ...article,
          prediction
        };
      })
    );

    // Ordena por score de predição (com pequena aleatoriedade para diversidade)
    return predictions.sort((a, b) => {
      const scoreA = a.prediction.score + (Math.random() * 0.05 - 0.025);
      const scoreB = b.prediction.score + (Math.random() * 0.05 - 0.025);
      return scoreB - scoreA;
    });
  },

  /**
   * Seleciona melhores artigos para push notification
   * @param {number} userId
   * @param {Array} candidateArticles
   * @param {number} count
   */
  async selectArticlesForPush(userId, candidateArticles, count = 3) {
    const ranked = await this.rankArticlesByPrediction(userId, candidateArticles);
    
    // Filtra só artigos com score > 0.6 (60% de chance de clique)
    const goodArticles = ranked.filter(a => a.prediction.score > 0.6);
    
    return goodArticles.slice(0, count);
  },

  /**
   * Preve melhor horário para enviar push
   * @param {number} userId
   */
  async predictBestPushTime(userId) {
    const profile = await UserProfile.findByUserId(userId);
    
    if (!profile || !profile.temporal_patterns?.peak_hours) {
      // Horários padrão se não tem dados
      const hour = new Date().getHours();
      if (hour < 8) return { hour: 8, reason: 'default_morning', confidence: 0.3 };
      if (hour < 12) return { hour: 12, reason: 'default_lunch', confidence: 0.3 };
      if (hour < 19) return { hour: 19, reason: 'default_evening', confidence: 0.3 };
      return { hour: 8, reason: 'default_next_morning', confidence: 0.3 };
    }

    const peakHours = profile.temporal_patterns.peak_hours;
    const currentHour = new Date().getHours();

    // Encontra próximo horário de pico
    let nextPeakHour = peakHours.find(h => h > currentHour);
    
    // Se não tem horário de pico depois de agora, pega o primeiro de amanhã
    if (!nextPeakHour) {
      nextPeakHour = peakHours[0];
    }

    return {
      hour: nextPeakHour,
      reason: 'user_peak_hour',
      confidence: profile.patterns_enabled ? 0.8 : 0.5,
      allPeakHours: peakHours
    };
  },

  /**
   * Busca pesos de configuração
   */
  async getWeights() {
    try {
      const result = await query(`
        SELECT value FROM engagement_config WHERE key = 'prediction_weights'
      `);
      
      if (result.rows[0]?.value) {
        return {
          SIMILARITY: result.rows[0].value.SIMILARITY_WEIGHT || DEFAULT_WEIGHTS.SIMILARITY,
          TRIGGERS: result.rows[0].value.TRIGGERS_WEIGHT || DEFAULT_WEIGHTS.TRIGGERS,
          KEYWORDS: result.rows[0].value.KEYWORDS_WEIGHT || DEFAULT_WEIGHTS.KEYWORDS,
          CATEGORY: result.rows[0].value.CATEGORY_WEIGHT || DEFAULT_WEIGHTS.CATEGORY
        };
      }
    } catch (e) {
      // Usa padrão se falhar
    }
    
    return DEFAULT_WEIGHTS;
  },

  /**
   * Explica predição em linguagem natural
   * @param {Object} prediction
   */
  explainPrediction(prediction) {
    if (!prediction.canPredict) {
      return `Predição não disponível: ${prediction.reason}`;
    }

    const explanations = [];
    
    for (const factor of prediction.factors) {
      switch (factor.type) {
        case 'similarity':
          if (factor.value > 0.7) {
            explanations.push('Muito similar ao que você costuma ler');
          } else if (factor.value > 0.5) {
            explanations.push('Relacionado aos seus interesses');
          }
          break;
        case 'trigger_urgency':
          if (factor.multiplier > 1) {
            explanations.push('Você tende a clicar em notícias urgentes');
          }
          break;
        case 'trigger_controversy':
          if (factor.multiplier > 1) {
            explanations.push('Você se interessa por polêmicas');
          }
          break;
        case 'keywords':
          if (factor.matched?.length > 0) {
            explanations.push(`Contém palavras que você gosta: ${factor.matched.join(', ')}`);
          }
          break;
        case 'category':
          if (factor.score > 0.7) {
            explanations.push('Categoria que você adora');
          }
          break;
      }
    }

    return explanations.length > 0 
      ? explanations.join('. ') 
      : `Probabilidade de clique: ${prediction.predicted_ctr}%`;
  }
};

export default PredictionService;

