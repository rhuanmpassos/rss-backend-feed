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
router.post('/:id/bookmark', articlesController.bookmark);
router.delete('/:id/bookmark', articlesController.unbookmark);

export default router;
