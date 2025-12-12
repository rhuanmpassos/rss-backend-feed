/**
 * Routes - Articles
 */

import express from 'express';
import articlesController from '../controllers/articlesController.js';

const router = express.Router();

router.get('/', articlesController.getAll);
router.get('/stats', articlesController.getStats);
router.get('/stats/by-category', articlesController.getStatsByCategory);
router.get('/bookmarked', articlesController.getBookmarked);
router.get('/:id', articlesController.getById);

// Bookmark
router.post('/:id/bookmark', articlesController.bookmark);
router.delete('/:id/bookmark', articlesController.unbookmark);

// Like (estrela)
router.post('/:id/like', articlesController.like);
router.delete('/:id/like', articlesController.unlike);
router.get('/liked', articlesController.getLiked);

export default router;
