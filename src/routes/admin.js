/**
 * Admin Routes
 */

import express from 'express';
import { adminController } from '../controllers/adminController.js';

const router = express.Router();

router.post('/clear-cache', adminController.clearCache);

export default router;
