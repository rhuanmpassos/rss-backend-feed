/**
 * Routes - Categories
 * Inclui endpoints hierárquicos IPTC
 */

import express from 'express';
import categoriesController from '../controllers/categoriesController.js';

const router = express.Router();

// Lista todas as categorias
router.get('/', categoriesController.getAll);

// Categorias em estrutura hierárquica (IPTC)
router.get('/hierarchical', categoriesController.getHierarchical);

// Busca categoria por slug
router.get('/:slug', categoriesController.getBySlug);

// Estatísticas de categoria
router.get('/:slug/stats', categoriesController.getStats);

// Subcategorias de uma categoria (por ID)
router.get('/:id/children', categoriesController.getChildren);

// Caminho completo até raiz (ancestrais)
router.get('/:id/path', categoriesController.getPath);

export default router;
