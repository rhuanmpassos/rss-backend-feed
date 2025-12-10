/**
 * Routes - Sites
 */

import express from 'express';
import sitesController from '../controllers/sitesController.js';

const router = express.Router();

router.get('/', sitesController.getAll);
router.get('/:id', sitesController.getById);
router.get('/:id/stats', sitesController.getStats);
router.get('/:id/articles', sitesController.getArticles);
router.post('/', sitesController.create);
router.post('/test', sitesController.testScrape);
router.put('/:id', sitesController.update);
router.delete('/:id', sitesController.delete);
router.post('/:id/scrape', sitesController.forceScrape);

export default router;
