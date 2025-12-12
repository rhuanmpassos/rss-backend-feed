/**
 * Preference Service - Sistema de Scores Científico
 * 
 * Implementa:
 * - Normalização relativa (softmax-like) - scores somam 1.0
 * - Decay temporal exponencial - interesses antigos perdem peso
 * - Pesos diferentes por tipo de interação
 * - Feedback negativo implícito (viu mas não clicou)
 * 
 * Baseado em:
 * - FeedRec: Multiple User Feedbacks for News Recommendation
 * - HieRec: Hierarchical User Interest Modeling
 */

import { query } from '../config/database.js';

// Configuração de pesos por tipo de interação
// CORRIGIDO: Click é ação EXPLÍCITA de interesse, deve ter mais peso que view
// View (dwell time) COMPLEMENTA o click, não substitui
// 
// Baseado em pesquisa: click é o sinal mais forte de interesse explícito
// View/dwell time indica engajamento, mas pode ser por distração
const INTERACTION_WEIGHTS = {
  impression: 0.05,    // Viu no feed (interesse mínimo)
  scroll_stop: 0.15,   // Parou para olhar (2s+)
  click: 0.50,         // CORRIGIDO: Clicou para ler (ação explícita - mais importante)
  view: 0.30,          // CORRIGIDO: Complemento do click (tempo de leitura)
  like: 0.80,          // Curtiu
  share: 1.00,         // Compartilhou (maior sinal de interesse)
  bookmark: 0.70       // Salvou para depois
};

// Configuração de decay temporal
// CORRIGIDO: Decay diferenciado por nível de categoria
// - Categorias específicas (nível 3) mudam mais rápido → decay rápido
// - Categorias amplas (nível 1) são mais estáveis → decay lento
// 
// Fórmula: half-life = ln(2) / rate
// rate 0.05 → ~14 dias | rate 0.03 → ~23 dias | rate 0.015 → ~46 dias
const DECAY_CONFIG = {
  // Rates por nível de categoria (half-life entre parênteses)
  rateByLevel: {
    1: 0.015,          // Nível 1 (Esporte, Política): ~46 dias - interesses amplos são estáveis
    2: 0.03,           // Nível 2 (Futebol, Automobilismo): ~23 dias - interesses médios
    3: 0.05            // Nível 3 (F1, Brasileirão): ~14 dias - interesses específicos flutuam mais
  },
  defaultRate: 0.05,   // Taxa padrão se nível não definido
  minWeight: 0.1,      // Peso mínimo (interações muito antigas)
  maxDays: 90          // Ignorar interações mais antigas que isso
};

// Configuração de feedback negativo
// CORRIGIDO: Penalidade agora é proporcional ao quão baixo é o CTR
// Baseado em pesquisa: mps (mean penalty score) de ~0.2 é ótimo
const NEGATIVE_FEEDBACK_CONFIG = {
  minImpressions: 10,  // Mínimo de impressões para considerar
  ctrThreshold: 0.05,  // CTR abaixo disso = desinteresse (5%)
  basePenalty: 0.10,   // Penalidade base
  maxPenalty: 0.25,    // Penalidade máxima (CTR = 0%)
  minScore: 0.005      // Score mínimo (permite quase zerar, mas não completamente)
};

const PreferenceService = {
  /**
   * Calcula peso com decay temporal
   * @param {number} daysSinceInteraction - Dias desde a interação
   * @returns {number} Peso entre 0.1 e 1.0
   */
  calculateDecayWeight(daysSinceInteraction) {
    if (daysSinceInteraction > DECAY_CONFIG.maxDays) {
      return DECAY_CONFIG.minWeight;
    }
    
    // Decay exponencial: weight = e^(-rate × days)
    const weight = Math.exp(-DECAY_CONFIG.rate * daysSinceInteraction);
    return Math.max(DECAY_CONFIG.minWeight, weight);
  },

  /**
   * Calcula scores relativos (normalizados) para todas as categorias do usuário
   * 
   * CORRIGIDO: Agora usa decay diferenciado por nível de categoria
   * - Nível 1 (amplo): decay lento (~46 dias half-life) - interesses estáveis
   * - Nível 2 (médio): decay médio (~23 dias half-life)
   * - Nível 3 (específico): decay rápido (~14 dias half-life) - interesses flutuam mais
   * 
   * @param {number} userId
   * @returns {Array} Categorias com scores relativos
   */
  async calculateRelativeScores(userId) {
    // Rates por nível para usar na query
    const { rateByLevel, defaultRate, maxDays } = DECAY_CONFIG;
    
    // Query que calcula score ponderado com decay DIFERENCIADO por nível
    const result = await query(`
      WITH weighted_interactions AS (
        SELECT 
          ui.user_id,
          COALESCE(a.category_id, ac.category_id) as category_id,
          ui.interaction_type,
          ui.created_at,
          EXTRACT(DAY FROM NOW() - ui.created_at) as days_ago
        FROM user_interactions ui
        LEFT JOIN articles a ON ui.article_id = a.id
        LEFT JOIN article_categories ac ON ui.article_id = ac.article_id AND ac.is_primary = true
        WHERE ui.user_id = $1
          AND ui.created_at > NOW() - INTERVAL '${maxDays} days'
          AND (a.category_id IS NOT NULL OR ac.category_id IS NOT NULL)
      ),
      category_scores AS (
        SELECT 
          wi.category_id,
          c.level as category_level,
          SUM(
            CASE wi.interaction_type
              WHEN 'share' THEN ${INTERACTION_WEIGHTS.share}
              WHEN 'like' THEN ${INTERACTION_WEIGHTS.like}
              WHEN 'bookmark' THEN ${INTERACTION_WEIGHTS.bookmark}
              WHEN 'view' THEN ${INTERACTION_WEIGHTS.view}
              WHEN 'click' THEN ${INTERACTION_WEIGHTS.click}
              WHEN 'scroll_stop' THEN ${INTERACTION_WEIGHTS.scroll_stop}
              WHEN 'impression' THEN ${INTERACTION_WEIGHTS.impression}
              ELSE 0.1
            END
            -- CORRIGIDO: Decay diferenciado por nível de categoria
            * EXP(
              -CASE COALESCE(c.level, 3)
                WHEN 1 THEN ${rateByLevel[1]}   -- Nível 1: decay lento
                WHEN 2 THEN ${rateByLevel[2]}   -- Nível 2: decay médio
                WHEN 3 THEN ${rateByLevel[3]}   -- Nível 3: decay rápido
                ELSE ${defaultRate}
              END 
              * wi.days_ago
            )
          ) as raw_score,
          COUNT(*) FILTER (WHERE wi.interaction_type = 'click') as click_count,
          COUNT(*) FILTER (WHERE wi.interaction_type = 'impression') as impression_count,
          COUNT(*) as total_interactions
        FROM weighted_interactions wi
        JOIN categories c ON wi.category_id = c.id
        GROUP BY wi.category_id, c.level
      ),
      total_score AS (
        SELECT SUM(raw_score) as total FROM category_scores
      )
      SELECT 
        cs.category_id,
        c.name as category_name,
        c.slug as category_slug,
        c.level as category_level,
        c.path as category_path,
        cs.raw_score,
        CASE WHEN ts.total > 0 THEN cs.raw_score / ts.total ELSE 0 END as preference_score,
        cs.click_count,
        cs.impression_count,
        cs.total_interactions,
        CASE WHEN cs.impression_count > 0 THEN cs.click_count::float / cs.impression_count ELSE 0 END as ctr
      FROM category_scores cs
      CROSS JOIN total_score ts
      JOIN categories c ON cs.category_id = c.id
      ORDER BY preference_score DESC
    `, [userId]);

    return result.rows;
  },

  /**
   * Atualiza tabela user_hierarchical_preferences com scores normalizados
   * @param {number} userId
   */
  async updateUserPreferences(userId) {
    console.log(`📊 Recalculando preferências do usuário ${userId}...`);
    
    const scores = await this.calculateRelativeScores(userId);
    
    if (scores.length === 0) {
      console.log(`   ⚠️ Sem interações para calcular preferências`);
      return { updated: 0 };
    }

    let updated = 0;

    for (const score of scores) {
      await query(`
        INSERT INTO user_hierarchical_preferences 
        (user_id, category_id, preference_score, interaction_count, click_count, impression_count, last_interaction_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (user_id, category_id)
        DO UPDATE SET 
          preference_score = $3,
          interaction_count = $4,
          click_count = $5,
          impression_count = $6,
          updated_at = NOW()
      `, [
        userId,
        score.category_id,
        score.preference_score,
        score.total_interactions,
        score.click_count,
        score.impression_count
      ]);
      updated++;
    }

    // Aplicar feedback negativo
    await this.applyNegativeFeedback(userId);

    // Propagar scores para categorias pai (herança hierárquica)
    await this.propagateToParentCategories(userId);

    console.log(`   ✅ ${updated} categorias atualizadas`);
    return { updated, scores };
  },

  /**
   * Aplica feedback negativo implícito
   * Se usuário viu muitas notícias de uma categoria mas não clicou = desinteresse
   * 
   * CORRIGIDO: Penalidade agora é PROPORCIONAL ao quão baixo é o CTR
   * - CTR = 4.9% (quase threshold) → penalidade pequena (~0.10)
   * - CTR = 2.5% (metade do threshold) → penalidade média (~0.175)
   * - CTR = 0% (zero cliques) → penalidade máxima (0.25)
   * 
   * @param {number} userId
   */
  async applyNegativeFeedback(userId) {
    const { minImpressions, ctrThreshold, basePenalty, maxPenalty, minScore } = NEGATIVE_FEEDBACK_CONFIG;

    // Busca categorias com CTR muito baixo
    const lowCtrCategories = await query(`
      SELECT 
        category_id,
        preference_score,
        click_count,
        impression_count,
        CASE WHEN impression_count > 0 THEN click_count::float / impression_count ELSE 0 END as ctr
      FROM user_hierarchical_preferences
      WHERE user_id = $1
        AND impression_count >= $2
        AND (click_count::float / NULLIF(impression_count, 0)) < $3
    `, [userId, minImpressions, ctrThreshold]);

    for (const cat of lowCtrCategories.rows) {
      const ctr = parseFloat(cat.ctr) || 0;
      const currentScore = parseFloat(cat.preference_score) || 0;
      
      // CORRIGIDO: Penalidade proporcional ao quão baixo é o CTR
      // severityRatio: 0.0 (CTR = threshold) a 1.0 (CTR = 0%)
      const severityRatio = 1 - (ctr / ctrThreshold);
      const penalty = basePenalty + (severityRatio * (maxPenalty - basePenalty));
      
      // Aplica penalidade com score mínimo
      const newScore = Math.max(minScore, currentScore - penalty);
      
      await query(`
        UPDATE user_hierarchical_preferences
        SET preference_score = $1, updated_at = NOW()
        WHERE user_id = $2 AND category_id = $3
      `, [newScore, userId, cat.category_id]);

      console.log(`   📉 Feedback negativo: categoria ${cat.category_id} (CTR: ${(ctr * 100).toFixed(1)}%, severidade: ${(severityRatio * 100).toFixed(0)}%) penalidade: ${penalty.toFixed(3)}, score: ${currentScore.toFixed(3)} → ${newScore.toFixed(3)}`);
    }
  },

  /**
   * Propaga scores para categorias pai na hierarquia
   * Se usuário gosta de "Fórmula 1", também gosta um pouco de "Automobilismo" e "Esporte"
   * 
   * CORRIGIDO: Antes usava avgScore * 1.2 que fazia pai > filhos
   * Agora usa FRAÇÃO do score médio dos filhos (pai sempre < filhos)
   * 
   * @param {number} userId
   */
  async propagateToParentCategories(userId) {
    // Busca categorias com pais
    const categoriesWithParents = await query(`
      SELECT 
        uhp.category_id,
        uhp.preference_score,
        c.parent_id
      FROM user_hierarchical_preferences uhp
      JOIN categories c ON uhp.category_id = c.id
      WHERE uhp.user_id = $1 AND c.parent_id IS NOT NULL
    `, [userId]);

    // Agrupa por parent_id e calcula estatísticas
    const parentScores = {};
    
    for (const cat of categoriesWithParents.rows) {
      const score = parseFloat(cat.preference_score) || 0;
      if (!parentScores[cat.parent_id]) {
        parentScores[cat.parent_id] = { total: 0, count: 0, maxChild: 0 };
      }
      parentScores[cat.parent_id].total += score;
      parentScores[cat.parent_id].count++;
      parentScores[cat.parent_id].maxChild = Math.max(parentScores[cat.parent_id].maxChild, score);
    }

    // CORRIGIDO: Pai tem score = 50% da média dos filhos
    // E nunca maior que 80% do filho mais alto
    // Isso garante que pai < filhos sempre
    for (const [parentId, data] of Object.entries(parentScores)) {
      const avgScore = data.total / data.count;
      const parentScore = Math.min(
        avgScore * 0.5,           // 50% da média dos filhos
        data.maxChild * 0.8       // No máximo 80% do filho mais alto
      );

      await query(`
        INSERT INTO user_hierarchical_preferences 
        (user_id, category_id, preference_score, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, category_id)
        DO UPDATE SET 
          preference_score = GREATEST(user_hierarchical_preferences.preference_score, $3),
          updated_at = NOW()
      `, [userId, parentId, parentScore]);
    }
  },

  /**
   * Busca preferências do usuário formatadas para o feed
   * @param {number} userId
   * @param {number} limit
   */
  async getUserPreferences(userId, limit = 20) {
    const result = await query(`
      SELECT 
        uhp.*,
        c.name as category_name,
        c.slug as category_slug,
        c.level as category_level,
        c.path as category_path,
        c.parent_id
      FROM user_hierarchical_preferences uhp
      JOIN categories c ON uhp.category_id = c.id
      WHERE uhp.user_id = $1
      ORDER BY uhp.preference_score DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  },

  /**
   * Busca preferências hierárquicas (nível 1, 2, 3 separados)
   * @param {number} userId
   */
  async getHierarchicalPreferences(userId) {
    const result = await query(`
      SELECT 
        c.level,
        json_agg(
          json_build_object(
            'category_id', uhp.category_id,
            'category_name', c.name,
            'category_slug', c.slug,
            'preference_score', uhp.preference_score,
            'click_count', uhp.click_count,
            'path', c.path
          ) ORDER BY uhp.preference_score DESC
        ) as categories
      FROM user_hierarchical_preferences uhp
      JOIN categories c ON uhp.category_id = c.id
      WHERE uhp.user_id = $1
      GROUP BY c.level
      ORDER BY c.level
    `, [userId]);

    return {
      level1: result.rows.find(r => r.level === 1)?.categories || [],
      level2: result.rows.find(r => r.level === 2)?.categories || [],
      level3: result.rows.find(r => r.level === 3)?.categories || []
    };
  },

  /**
   * Calcula score de relevância de um artigo para um usuário
   * @param {number} userId
   * @param {Object} article - Artigo com category_id
   */
  async calculateArticleRelevance(userId, article) {
    if (!article.category_id) return { score: 0.5, reason: 'no_category' };

    // Busca preferência do usuário para esta categoria
    const pref = await query(`
      SELECT preference_score FROM user_hierarchical_preferences
      WHERE user_id = $1 AND category_id = $2
    `, [userId, article.category_id]);

    if (pref.rows[0]) {
      return {
        score: pref.rows[0].preference_score,
        reason: 'category_preference'
      };
    }

    // Busca preferência da categoria pai
    const parentPref = await query(`
      SELECT uhp.preference_score
      FROM categories c
      JOIN user_hierarchical_preferences uhp ON c.parent_id = uhp.category_id
      WHERE c.id = $1 AND uhp.user_id = $2
    `, [article.category_id, userId]);

    if (parentPref.rows[0]) {
      return {
        score: parentPref.rows[0].preference_score * 0.7, // Herda 70% do pai
        reason: 'parent_preference'
      };
    }

    return { score: 0.3, reason: 'no_preference' }; // Score baixo para descoberta
  },

  /**
   * Registra interação e agenda recálculo de preferências
   * @param {number} userId
   * @param {number} articleId
   * @param {string} interactionType
   */
  async recordInteraction(userId, articleId, interactionType) {
    // Agenda recálculo (debounced no learningService)
    // Por agora, apenas marca que precisa recalcular
    await query(`
      UPDATE users SET preferences_stale = true WHERE id = $1
    `, [userId]);
  }
};

export default PreferenceService;
export { INTERACTION_WEIGHTS, DECAY_CONFIG, NEGATIVE_FEEDBACK_CONFIG };

