/**
 * Routes - Feeds
 * 
 * ATUALIZADO: Inclui endpoints de engagement feed
 */

import express from 'express';
import feedsController from '../controllers/feedsController.js';

const router = express.Router();

// ==================== FEEDS PERSONALIZADOS ====================

// 🔥 Feed "For You" - Otimizado para engajamento
// - Breaking news no topo
// - Personalizado por usuário
// - Wildcards para descoberta (12%)
// - Shuffle para imprevisibilidade
router.get('/addictive', feedsController.getAddictiveFeed);
router.get('/addictive.json', feedsController.getAddictiveFeed);
// Alias para compatibilidade (app pode chamar /for-you ou /addictive)
router.get('/for-you', feedsController.getAddictiveFeed);
router.get('/for-you.json', feedsController.getAddictiveFeed);

// Mais conteúdo (para scroll infinito)
router.get('/addictive/more', feedsController.getMoreContent);
router.get('/for-you/more', feedsController.getMoreContent);

// Breaking News (últimas 2h)
router.get('/breaking', feedsController.getBreakingNews);

// Predição de clique
router.get('/predict', feedsController.predictClick);

// ==================== PREFERÊNCIAS (DEBUG/ADMIN) ====================

// Preferências hierárquicas do usuário (scores relativos)
router.get('/preferences/:user_id', feedsController.getUserPreferences);

// Recalcular preferências (force update)
router.post('/preferences/:user_id/recalculate', feedsController.recalculatePreferences);

// ==================== FEEDS BÁSICOS ====================

// Feed cronológico (todos os artigos)
router.get('/chronological', feedsController.getChronologicalFeed);
router.get('/chronological.json', feedsController.getChronologicalFeed);

// Feeds por site
router.get('/sites/:id.rss', feedsController.getSiteFeed);
router.get('/sites/:id.json', feedsController.getSiteFeed);

// Feeds por categoria
router.get('/categories/:slug.rss', feedsController.getCategoryFeed);
router.get('/categories/:slug.json', feedsController.getCategoryFeed);

// Feed combinado (legado)
router.get('/all.rss', feedsController.getAllFeed);
router.get('/all.json', feedsController.getAllFeed);

export default router;
