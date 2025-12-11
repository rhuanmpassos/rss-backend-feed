/**
 * Routes - Feeds
 * 
 * ATUALIZADO: Inclui endpoints de engagement feed
 */

import express from 'express';
import feedsController from '../controllers/feedsController.js';

const router = express.Router();

// ==================== FEEDS PERSONALIZADOS ====================

// Feed "For You" personalizado (original)
router.get('/for-you', feedsController.getForYouFeed);
router.get('/for-you.json', feedsController.getForYouFeed);

// 🔥 Feed "Addictive" - Otimizado para engajamento
// - Breaking news no topo
// - Personalizado + Wildcards
// - Shuffle para imprevisibilidade
router.get('/addictive', feedsController.getAddictiveFeed);
router.get('/addictive.json', feedsController.getAddictiveFeed);

// Mais conteúdo (para scroll infinito)
router.get('/addictive/more', feedsController.getMoreContent);

// Breaking News (últimas 2h)
router.get('/breaking', feedsController.getBreakingNews);

// Predição de clique
router.get('/predict', feedsController.predictClick);

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
