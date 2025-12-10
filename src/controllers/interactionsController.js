/**
 * Interactions Controller
 * Recebe interações do app para Implicit Feedback
 */

import UserInteraction from '../models/UserInteraction.js';
import UserCategoryPreference from '../models/UserCategoryPreference.js';
import Article from '../models/Article.js';

export const interactionsController = {
  /**
   * POST /api/interactions
   * Recebe batch de interações do app
   * Body: { user_id: number, interactions: Array<Interaction> }
   * 
   * Interaction: {
   *   article_id: number,
   *   interaction_type: 'click' | 'view' | 'scroll_stop' | 'impression',
   *   duration?: number,  // ms (para 'view')
   *   position?: number,  // posição no feed
   *   timestamp?: number  // quando ocorreu
   * }
   */
  async createBatch(req, res) {
    try {
      const { user_id, interactions } = req.body;

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

      // Valida e formata interações
      const validInteractions = [];
      const validTypes = ['click', 'view', 'scroll_stop', 'impression'];

      for (const interaction of interactions) {
        if (!interaction.article_id || !interaction.interaction_type) {
          continue; // Pula interações inválidas
        }

        if (!validTypes.includes(interaction.interaction_type)) {
          continue; // Pula tipos inválidos
        }

        validInteractions.push({
          userId: user_id,
          articleId: interaction.article_id,
          interactionType: interaction.interaction_type,
          duration: interaction.duration || null,
          position: interaction.position || null
        });
      }

      if (validInteractions.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Nenhuma interação válida encontrada' 
        });
      }

      // Salva interações em batch
      const saved = await UserInteraction.createBatch(validInteractions);

      // Atualiza preferências de categoria em background (não bloqueia resposta)
      setImmediate(async () => {
        try {
          await updateCategoryPreferencesFromInteractions(user_id, validInteractions);
        } catch (error) {
          console.error('Erro ao atualizar preferências:', error.message);
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

      const interaction = await UserInteraction.create({
        userId: user_id,
        articleId: article_id,
        interactionType: interaction_type,
        duration: duration || null,
        position: position || null
      });

      // Se for click, atualiza preferências imediatamente
      if (interaction_type === 'click') {
        setImmediate(async () => {
          try {
            const article = await Article.findById(article_id);
            if (article && article.category_id) {
              await UserCategoryPreference.incrementScore(user_id, article.category_id, 0.1);
            }
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
  }
};

/**
 * Atualiza preferências de categoria baseado em interações
 * @param {number} userId
 * @param {Array} interactions
 */
async function updateCategoryPreferencesFromInteractions(userId, interactions) {
  // Agrupa por categoria
  const categoryScores = new Map();

  for (const interaction of interactions) {
    // Busca categoria do artigo
    const article = await Article.findById(interaction.articleId);
    if (!article || !article.category_id) continue;

    const categoryId = article.category_id;
    const currentScore = categoryScores.get(categoryId) || 0;

    // Calcula score baseado no tipo de interação
    let score = 0;
    switch (interaction.interactionType) {
      case 'click':
        score = 1.0;
        break;
      case 'view':
        // Quanto mais tempo, maior o interesse (max 0.8)
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

  // Atualiza preferências
  for (const [categoryId, score] of categoryScores) {
    // Incrementa score proporcionalmente
    const increment = Math.min(score * 0.05, 0.2); // Max 0.2 por batch
    await UserCategoryPreference.incrementScore(userId, categoryId, increment);
  }
}

export default interactionsController;

