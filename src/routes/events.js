/**
 * SSE Events Route
 * Endpoint para Server-Sent Events com sistema de subscriptions
 */

import express from 'express';
import sseManager from '../services/sseManager.js';

const router = express.Router();

/**
 * GET /api/events
 * Estabelece conexão SSE para receber eventos em tempo real
 * 
 * Query Parameters:
 * - categories: Categorias para filtrar (separadas por vírgula)
 *   Ex: ?categories=tecnologia,futebol,games
 * 
 * - sites: IDs dos sites para filtrar (separados por vírgula)
 *   Ex: ?sites=1,5,12
 * 
 * Combinações:
 * - /api/events                           → Recebe TUDO
 * - /api/events?categories=tecnologia     → Só Tecnologia
 * - /api/events?categories=tecnologia,futebol&sites=1,5  → Tecnologia e Futebol, só de sites 1 e 5
 * 
 * Eventos disponíveis:
 * - connected: Conexão estabelecida (confirma subscriptions)
 * - heartbeat: Keep-alive (a cada 30s)
 * - new_article: Novo artigo classificado (filtrado por subscriptions)
 */
router.get('/', (req, res) => {
  // Headers SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // Desabilita buffering no nginx
  
  // Desabilita timeout para conexão SSE
  req.setTimeout(0);
  
  // Flush headers imediatamente
  res.flushHeaders();

  // Parse query params para subscriptions
  const subscriptions = {};

  // Categories: ?categories=tecnologia,futebol
  if (req.query.categories) {
    subscriptions.categories = req.query.categories
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);
  }

  // Sites: ?sites=1,5,12
  if (req.query.sites) {
    subscriptions.sites = req.query.sites
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(s => !isNaN(s));
  }

  // Adiciona cliente no manager com subscriptions
  sseManager.addClient(res, subscriptions);

  // Remove cliente quando desconectar
  req.on('close', () => {
    sseManager.removeClient(res);
  });

  req.on('error', () => {
    sseManager.removeClient(res);
  });
});

/**
 * GET /api/events/status
 * Retorna status detalhado das conexões SSE
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: sseManager.getStats()
  });
});

export default router;
