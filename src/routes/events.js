/**
 * SSE Events Route
 * Endpoint para Server-Sent Events com sistema de subscriptions
 */

import express from 'express';
import sseManager from '../services/sseManager.js';
import Article from '../models/Article.js';

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
 * - initial: Se deve enviar artigos iniciais (default: true)
 *   Ex: ?initial=false para não receber artigos iniciais
 * 
 * - limit: Quantidade de artigos iniciais (default: 50)
 *   Ex: ?limit=100
 * 
 * Combinações:
 * - /api/events                           → Recebe TUDO + artigos iniciais
 * - /api/events?categories=tecnologia     → Só Tecnologia
 * - /api/events?categories=tecnologia,futebol&sites=1,5  → Tecnologia e Futebol, só de sites 1 e 5
 * - /api/events?initial=false             → Só eventos em tempo real, sem artigos iniciais
 * 
 * Eventos disponíveis:
 * - connected: Conexão estabelecida (confirma subscriptions)
 * - initial_articles: Artigos existentes (enviado logo após connected)
 * - heartbeat: Keep-alive (a cada 30s)
 * - new_article: Novo artigo classificado (filtrado por subscriptions)
 */
router.get('/', async (req, res) => {
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

  // Envia artigos iniciais se solicitado (default: true)
  const sendInitial = req.query.initial !== 'false';
  const initialLimit = parseInt(req.query.limit) || 50;

  if (sendInitial) {
    try {
      // Busca artigos classificados (com categoria)
      let articles = await Article.findAll({ limit: initialLimit });
      
      // Filtra por categoria se especificado
      if (subscriptions.categories && subscriptions.categories.length > 0) {
        const normalizedSubs = subscriptions.categories.map(c => 
          c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-')
        );
        articles = articles.filter(a => {
          if (!a.category_slug) return false;
          const normalizedCat = a.category_slug.toLowerCase();
          return normalizedSubs.includes(normalizedCat);
        });
      }

      // Filtra por site se especificado
      if (subscriptions.sites && subscriptions.sites.length > 0) {
        const siteIds = subscriptions.sites.map(Number);
        articles = articles.filter(a => siteIds.includes(a.site_id));
      }

      // Envia evento com artigos iniciais
      sseManager.sendToClient(res, 'initial_articles', {
        articles: articles,
        count: articles.length,
        timestamp: new Date().toISOString()
      });

      console.log(`📡 SSE: Enviados ${articles.length} artigos iniciais para novo cliente`);
    } catch (error) {
      console.error('Erro ao enviar artigos iniciais:', error.message);
    }
  }

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
