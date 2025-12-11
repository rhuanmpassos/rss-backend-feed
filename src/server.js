/**
 * Express Server
 * API REST para gerenciamento de feeds
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sitesRoutes from './routes/sites.js';
import articlesRoutes from './routes/articles.js';
import categoriesRoutes from './routes/categories.js';
import feedsRoutes from './routes/feeds.js';
import adminRoutes from './routes/admin.js';
import eventsRoutes from './routes/events.js';
import interactionsRoutes from './routes/interactions.js';
import usersRoutes from './routes/users.js';
import Scheduler from './scheduler/jobs.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/sites', sitesRoutes);
app.use('/api/articles', articlesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/interactions', interactionsRoutes);
app.use('/api/users', usersRoutes);
app.use('/feeds', feedsRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint não encontrado' });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 API disponível em http://localhost:${PORT}`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);

  // Inicia scheduler de workers
  Scheduler.start();
});

export default app;

