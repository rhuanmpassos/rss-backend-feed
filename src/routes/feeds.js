/**
 * Routes - Feeds
 */

import express from 'express';
import feedsController from '../controllers/feedsController.js';

const router = express.Router();

// Feed "For You" personalizado
router.get('/for-you', feedsController.getForYouFeed);
router.get('/for-you.json', feedsController.getForYouFeed);

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
