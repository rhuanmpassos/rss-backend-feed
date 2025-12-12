/**
 * Interactions Controller
 * Recebe interações do app para Implicit Feedback
 * 
 * ATUALIZADO: Integrado com LearningService para
 * aprendizado de padrões do usuário
 */

import UserInteraction from '../models/UserInteraction.js';
import UserCategoryPreference from '../models/UserCategoryPreference.js';
import Article from '../models/Article.js';
import LearningService from '../services/learningService.js';
import UserSession from '../models/UserSession.js';
import UserProfile from '../models/UserProfile.js';
import PatternDetectionService from '../services/patternDetectionService.js';
import PreferenceService from '../services/preferenceService.js';
import User from '../models/User.js';

export const interactionsController = {
  /**
   * POST /api/interactions
   * Recebe batch de interações do app
   * Body: { 
   *   user_id: number, 
   *   session_id?: string,
   *   device_type?: string,
   *   interactions: Array<Interaction> 
   * }
   * 
   * Interaction: {
   *   article_id: number,
   *   interaction_type: 'click' | 'view' | 'scroll_stop' | 'impression',
   *   duration?: number,  // ms (para 'view')
   *   position?: number,  // posição no feed
   *   scroll_velocity?: number,  // velocidade do scroll
   *   screen_position?: string,  // 'top' | 'middle' | 'bottom'
   *   viewport_time?: number,  // tempo no viewport (ms)
   *   timestamp?: number  // quando ocorreu
   * }
   */
  async createBatch(req, res) {
    try {
      const { user_id, session_id, device_type, interactions } = req.body;

      if (!user_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'user_id é obrigatório' 
        });
      }

      if (!interactions || !Array.isArray(interactions) || interactions.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'interactions deve ser um array não vazio' 
        });
      }

      // VALIDAÇÃO: Verifica se usuário existe antes de inserir
      const userExists = await User.findById(user_id);
      if (!userExists) {
        return res.status(400).json({ 
          success: false, 
          error: `Usuário ${user_id} não encontrado. Certifique-se de que o usuário está registrado.`,
          code: 'USER_NOT_FOUND'
        });
      }

      // Valida e formata interações
      const validInteractions = [];
      const validTypes = ['click', 'view', 'scroll_stop', 'impression'];

      // Coleta IDs únicos de artigos para verificar existência em batch
      const articleIds = [...new Set(
        interactions
          .filter(i => i.article_id)
          .map(i => parseInt(i.article_id))
          .filter(id => !isNaN(id))
      )];

      // Verifica quais artigos existem no banco
      let existingArticleIds = new Set();
      if (articleIds.length > 0) {
        const existingArticles = await Article.findByIds(articleIds);
        existingArticleIds = new Set(existingArticles.map(a => a.id));
      }

      for (const interaction of interactions) {
        if (!interaction.article_id || !interaction.interaction_type) {
          continue; // Pula interações inválidas
        }

        if (!validTypes.includes(interaction.interaction_type)) {
          continue; // Pula tipos inválidos
        }

        const articleId = parseInt(interaction.article_id);
        
        // VALIDAÇÃO: Pula se o artigo não existe no banco
        if (isNaN(articleId) || !existingArticleIds.has(articleId)) {
          continue; // Artigo não existe, pula silenciosamente
        }

        validInteractions.push({
          userId: user_id,
          articleId: articleId,
          interactionType: interaction.interaction_type,
          duration: interaction.duration || null,
          position: interaction.position || null,
          scroll_velocity: interaction.scroll_velocity || null,
          screen_position: interaction.screen_position || null,
          viewport_time: interaction.viewport_time || null
        });
      }

      if (validInteractions.length === 0) {
        // Retorna sucesso mesmo sem interações válidas (artigos podem ter sido deletados)
        return res.json({ 
          success: true, 
          message: 'Nenhuma interação válida para processar (artigos podem não existir mais)',
          data: { count: 0, skipped: interactions.length }
        });
      }

      // Salva interações em batch (legado)
      const saved = await UserInteraction.createBatch(validInteractions);

      // Processa com LearningService em background (não bloqueia resposta)
      setImmediate(async () => {
        try {
          // Usa LearningService para processar e aprender
          await LearningService.processInteractionBatch(
            user_id, 
            validInteractions.map(i => ({
              article_id: i.articleId,
              interaction_type: i.interactionType,
              duration: i.duration,
              position: i.position,
              scroll_velocity: i.scroll_velocity,
              screen_position: i.screen_position,
              viewport_time: i.viewport_time
            })), 
            session_id,
            device_type
          );
          
          // CORRIGIDO: Sempre atualiza preferências após batch (não apenas se houver clicks)
          // Isso garante que preferências sejam recalculadas mesmo se batch tiver apenas views/impressions
          // O PreferenceService recalcula baseado em TODAS as interações do usuário, não apenas do batch
          await updateCategoryPreferencesFromInteractions(user_id, validInteractions);
        } catch (error) {
          console.error('Erro ao processar aprendizado:', error.message);
        }
      });

      res.status(201).json({ 
        success: true, 
        message: `${saved.length} interações registradas`,
        data: { count: saved.length }
      });

    } catch (error) {
      console.error('Erro ao registrar interações:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * POST /api/interactions/single
   * Registra uma única interação (para clicks imediatos)
   */
  async createSingle(req, res) {
    try {
      const { user_id, article_id, interaction_type, duration, position } = req.body;

      if (!user_id || !article_id || !interaction_type) {
        return res.status(400).json({ 
          success: false, 
          error: 'user_id, article_id e interaction_type são obrigatórios' 
        });
      }

      const validTypes = ['click', 'view', 'scroll_stop', 'impression'];
      if (!validTypes.includes(interaction_type)) {
        return res.status(400).json({ 
          success: false, 
          error: `interaction_type deve ser: ${validTypes.join(', ')}` 
        });
      }

      // VALIDAÇÃO: Verifica se usuário existe
      const userExists = await User.findById(user_id);
      if (!userExists) {
        return res.status(400).json({ 
          success: false, 
          error: `Usuário ${user_id} não encontrado.`,
          code: 'USER_NOT_FOUND'
        });
      }

      // VALIDAÇÃO: Verifica se artigo existe
      const articleId = parseInt(article_id);
      if (isNaN(articleId)) {
        return res.status(400).json({ 
          success: false, 
          error: 'article_id inválido' 
        });
      }

      const articleExists = await Article.findById(articleId);
      if (!articleExists) {
        return res.status(400).json({ 
          success: false, 
          error: `Artigo ${articleId} não encontrado`,
          code: 'ARTICLE_NOT_FOUND'
        });
      }

      const interaction = await UserInteraction.create({
        userId: user_id,
        articleId: articleId,
        interactionType: interaction_type,
        duration: duration || null,
        position: position || null
      });

      // Se for click, recalcula preferências normalizadas
      if (interaction_type === 'click') {
        setImmediate(async () => {
          try {
            // Usa PreferenceService para recalcular scores normalizados
            await PreferenceService.updateUserPreferences(user_id);
          } catch (error) {
            console.error('Erro ao atualizar preferência:', error.message);
          }
        });
      }

      res.status(201).json({ 
        success: true, 
        data: interaction 
      });

    } catch (error) {
      console.error('Erro ao registrar interação:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/interactions/user/:userId
   * Lista interações de um usuário (para debug/admin)
   */
  async getByUser(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 100, type } = req.query;

      const interactions = await UserInteraction.findByUserId(
        parseInt(userId), 
        { limit: parseInt(limit), interactionType: type }
      );

      res.json({ 
        success: true, 
        data: interactions,
        count: interactions.length
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/interactions/user/:userId/stats
   * Estatísticas de interações do usuário
   */
  async getUserStats(req, res) {
    try {
      const { userId } = req.params;

      const [byType, byCategory, interestScores] = await Promise.all([
        UserInteraction.countByType(parseInt(userId)),
        UserInteraction.getMostInteractedCategories(parseInt(userId), 30),
        UserInteraction.getInterestScores(parseInt(userId), 20)
      ]);

      res.json({ 
        success: true, 
        data: {
          byType,
          topCategories: byCategory,
          topArticles: interestScores
        }
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // ========== SESSÕES ==========

  /**
   * POST /api/sessions
   * Inicia nova sessão
   * Body: { user_id, device_type?, entry_source? }
   */
  async startSession(req, res) {
    try {
      const { user_id, device_type, entry_source } = req.body;

      if (!user_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'user_id é obrigatório' 
        });
      }

      // VALIDAÇÃO: Verifica se usuário existe
      const userExists = await User.findById(user_id);
      if (!userExists) {
        return res.status(400).json({ 
          success: false, 
          error: `Usuário ${user_id} não encontrado. Certifique-se de que o usuário está registrado.`,
          code: 'USER_NOT_FOUND'
        });
      }

      const session = await UserSession.create({
        userId: user_id,
        deviceType: device_type || null,
        entrySource: entry_source || 'organic'
      });

      res.status(201).json({
        success: true,
        data: session
      });

    } catch (error) {
      console.error('Erro ao criar sessão:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * PUT /api/sessions/:sessionId/end
   * Finaliza sessão
   */
  async endSession(req, res) {
    try {
      const { sessionId } = req.params;

      const session = await UserSession.end(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Sessão não encontrada'
        });
      }

      res.json({
        success: true,
        data: session
      });

    } catch (error) {
      console.error('Erro ao finalizar sessão:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/sessions/user/:userId
   * Lista sessões de um usuário
   */
  async getUserSessions(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 50 } = req.query;

      const [sessions, stats] = await Promise.all([
        UserSession.findByUserId(parseInt(userId), parseInt(limit)),
        UserSession.getStats(parseInt(userId))
      ]);

      res.json({
        success: true,
        data: { sessions, stats }
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // ========== PERFIL ==========

  /**
   * GET /api/users/:userId/profile
   * Retorna perfil do usuário
   */
  async getUserProfile(req, res) {
    try {
      const { userId } = req.params;

      const profile = await UserProfile.getSimplifiedProfile(parseInt(userId));

      res.json({
        success: true,
        data: profile
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/users/:userId/profile/full
   * Retorna perfil completo (admin/debug)
   */
  async getFullProfile(req, res) {
    try {
      const { userId } = req.params;

      const profile = await UserProfile.findByUserId(parseInt(userId));

      if (!profile) {
        return res.json({
          success: true,
          data: null,
          message: 'Usuário ainda não tem perfil'
        });
      }

      res.json({
        success: true,
        data: profile
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/users/:userId/patterns
   * Retorna análise de padrões do usuário
   * Formata dados para o frontend
   */
  async getUserPatterns(req, res) {
    try {
      const { userId } = req.params;

      const analysis = await PatternDetectionService.getFullAnalysis(parseInt(userId));

      // Calcula CTR do usuário
      const ctrResult = await UserInteraction.countByType(parseInt(userId));
      const impressions = ctrResult.find(r => r.interaction_type === 'impression')?.count || 0;
      const clicks = ctrResult.find(r => r.interaction_type === 'click')?.count || 0;
      const ctr = impressions > 0 ? clicks / impressions : 0;

      // Formata para o frontend
      const formattedData = {
        // Dados originais (para debug/admin)
        raw: analysis,
        
        // Formato esperado pelo frontend
        temporal: {
          most_active_hour: analysis.bestNotificationTime?.bestHours?.[0] || null,
          best_hours: analysis.bestNotificationTime?.bestHours || [],
          top_days: analysis.weekdayPattern?.topDays?.map(d => d.dayName) || []
        },
        content: {
          preferred_categories: analysis.emergingInterests?.emerging?.map(e => e.categoryName) || [],
          emerging_interests: analysis.emergingInterests?.emerging || []
        },
        engagement: {
          click_through_rate: parseFloat(ctr.toFixed(4)),
          trend: analysis.engagementTrend?.trend || 'unknown',
          trend_change: analysis.engagementTrend?.change || 0,
          user_type: analysis.userPattern?.type || 'new',
          user_description: analysis.userPattern?.description || ''
        }
      };

      res.json({
        success: true,
        data: formattedData
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * POST /api/users/:userId/profile/recalculate
   * Força recálculo do perfil
   */
  async recalculateProfile(req, res) {
    try {
      const { userId } = req.params;

      const success = await LearningService.forceRecalculate(parseInt(userId));

      res.json({
        success,
        message: success 
          ? 'Perfil recalculado com sucesso' 
          : 'Erro ao recalcular perfil'
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

/**
 * Atualiza preferências de categoria baseado em interações
 * @param {number} userId
 * @param {Array} interactions
 */
/**
 * Atualiza preferências de categoria baseado em interações
 * CORRIGIDO: Agora usa PreferenceService para scores normalizados (soma = 100%)
 * @param {number} userId
 * @param {Array} interactions - Não usado mais, mantido para compatibilidade
 */
async function updateCategoryPreferencesFromInteractions(userId, interactions) {
  // Usa PreferenceService para recalcular scores normalizados
  // Isso considera TODAS as interações do usuário, não apenas as do batch atual
  // E normaliza para que a soma seja 100%
  try {
    await PreferenceService.updateUserPreferences(userId);
  } catch (error) {
    console.error(`Erro ao atualizar preferências do usuário ${userId}:`, error.message);
  }
}

export default interactionsController;

