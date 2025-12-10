/**
 * Routes - Categories
 */

import express from 'express';
import categoriesController from '../controllers/categoriesController.js';

const router = express.Router();

router.get('/', categoriesController.getAll);
router.get('/:slug', categoriesController.getBySlug);
router.get('/:slug/stats', categoriesController.getStats);

export default router;
