/**
 * Categories Controller
 */

import Category from '../models/Category.js';

export const categoriesController = {
  async getAll(req, res) {
    try {
      const categories = await Category.findAll();
      res.json({ success: true, data: categories });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async getBySlug(req, res) {
    try {
      const category = await Category.findBySlug(req.params.slug);
      if (!category) return res.status(404).json({ success: false, error: 'Categoria não encontrada' });
      res.json({ success: true, data: category });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async getStats(req, res) {
    try {
      const stats = await Category.getStats(req.params.slug);
      if (!stats) return res.status(404).json({ success: false, error: 'Categoria não encontrada' });
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export default categoriesController;
