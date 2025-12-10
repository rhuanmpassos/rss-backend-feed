/**
 * SSE Manager - Singleton com Sistema de Subscriptions
 * Gerencia conexões SSE com filtros por categoria e site
 */

class SSEManager {
  constructor() {
    if (SSEManager.instance) {
      return SSEManager.instance;
    }
    
    // Map<Response, { categories: Set|null, sites: Set|null }>
    // null = sem filtro (recebe tudo)
    this.clients = new Map();
    this.heartbeatInterval = null;
    
    // Inicia heartbeat para manter conexões vivas
    this.startHeartbeat();
    
    SSEManager.instance = this;
  }

  /**
   * Normaliza nome de categoria para comparação
   * "Fórmula 1" → "formula-1", "Tecnologia" → "tecnologia"
   */
  normalizeCategory(category) {
    if (!category) return null;
    return category
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/\s+/g, '-');           // Espaços → hifens
  }

  /**
   * Adiciona um novo cliente SSE com subscriptions
   * @param {Response} res - Response object do Express
   * @param {Object} subscriptions - Filtros do cliente
   * @param {string[]|null} subscriptions.categories - Categorias (null = todas)
   * @param {number[]|null} subscriptions.sites - IDs dos sites (null = todos)
   */
  addClient(res, subscriptions = {}) {
    const { categories = null, sites = null } = subscriptions;
    
    // Normaliza categorias para comparação case-insensitive
    const normalizedCategories = categories 
      ? new Set(categories.map(c => this.normalizeCategory(c)))
      : null;
    
    const siteIds = sites ? new Set(sites.map(Number)) : null;

    this.clients.set(res, {
      categories: normalizedCategories,
      sites: siteIds,
      connectedAt: new Date()
    });

    const filterInfo = [];
    if (normalizedCategories) filterInfo.push(`categorias: ${[...normalizedCategories].join(', ')}`);
    if (siteIds) filterInfo.push(`sites: ${[...siteIds].join(', ')}`);
    
    console.log(`📡 SSE: Cliente conectado (total: ${this.clients.size})${filterInfo.length ? ` [${filterInfo.join(' | ')}]` : ' [sem filtros]'}`);
    
    // Envia evento de conexão estabelecida
    this.sendToClient(res, 'connected', { 
      message: 'Connected to SSE',
      subscriptions: {
        categories: categories || 'all',
        sites: sites || 'all'
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Remove um cliente SSE
   * @param {Response} res - Response object do Express
   */
  removeClient(res) {
    this.clients.delete(res);
    console.log(`📡 SSE: Cliente desconectado (total: ${this.clients.size})`);
  }

  /**
   * Envia evento para um cliente específico
   * @param {Response} res - Response object
   * @param {string} event - Nome do evento
   * @param {object} data - Dados do evento
   */
  sendToClient(res, event, data) {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      // Cliente provavelmente desconectou
      this.removeClient(res);
    }
  }

  /**
   * Verifica se cliente deve receber o artigo baseado nos filtros
   * @param {Object} clientSubs - Subscriptions do cliente
   * @param {string} articleCategory - Categoria do artigo
   * @param {number} articleSiteId - ID do site do artigo
   */
  shouldReceive(clientSubs, articleCategory, articleSiteId) {
    const { categories, sites } = clientSubs;
    
    // Verifica filtro de categoria
    if (categories !== null) {
      const normalizedArticleCategory = this.normalizeCategory(articleCategory);
      if (!categories.has(normalizedArticleCategory)) {
        return false; // Cliente não quer essa categoria
      }
    }
    
    // Verifica filtro de site (só se passou no filtro de categoria)
    if (sites !== null) {
      if (!sites.has(Number(articleSiteId))) {
        return false; // Cliente não quer esse site
      }
    }
    
    return true; // Passou em todos os filtros
  }

  /**
   * Broadcast filtrado - envia só para clientes interessados
   * @param {string} event - Nome do evento
   * @param {object} data - Dados do evento (deve ter category e site_id)
   */
  broadcastFiltered(event, data) {
    if (this.clients.size === 0) return;

    const { category, site_id } = data;
    const deadClients = [];
    let sentCount = 0;

    for (const [client, subscriptions] of this.clients) {
      // Verifica se cliente quer receber este artigo
      if (!this.shouldReceive(subscriptions, category, site_id)) {
        continue;
      }

      try {
        client.write(`event: ${event}\n`);
        client.write(`data: ${JSON.stringify(data)}\n\n`);
        sentCount++;
      } catch (error) {
        deadClients.push(client);
      }
    }

    // Remove clientes mortos
    deadClients.forEach(client => this.removeClient(client));

    if (sentCount > 0) {
      console.log(`📡 SSE: '${event}' enviado para ${sentCount}/${this.clients.size} cliente(s) [${category}]`);
    }
  }

  /**
   * Broadcast para TODOS (usado para heartbeat e eventos globais)
   * @param {string} event - Nome do evento
   * @param {object} data - Dados do evento
   */
  broadcast(event, data) {
    if (this.clients.size === 0) return;
    
    const deadClients = [];
    
    for (const [client] of this.clients) {
      try {
        client.write(`event: ${event}\n`);
        client.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        deadClients.push(client);
      }
    }

    deadClients.forEach(client => this.removeClient(client));
  }

  /**
   * Inicia heartbeat para manter conexões vivas
   * Envia ping a cada 30 segundos
   */
  startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcast('heartbeat', { 
          timestamp: new Date().toISOString(),
          clients: this.clients.size
        });
      }
    }, 30000); // 30 segundos
  }

  /**
   * Para o heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Retorna quantidade de clientes conectados
   */
  getClientsCount() {
    return this.clients.size;
  }

  /**
   * Retorna estatísticas detalhadas
   */
  getStats() {
    const stats = {
      total: this.clients.size,
      withCategoryFilter: 0,
      withSiteFilter: 0,
      noFilters: 0,
      categories: {},
      sites: {}
    };

    for (const [, subs] of this.clients) {
      if (subs.categories === null && subs.sites === null) {
        stats.noFilters++;
      }
      if (subs.categories !== null) {
        stats.withCategoryFilter++;
        for (const cat of subs.categories) {
          stats.categories[cat] = (stats.categories[cat] || 0) + 1;
        }
      }
      if (subs.sites !== null) {
        stats.withSiteFilter++;
        for (const site of subs.sites) {
          stats.sites[site] = (stats.sites[site] || 0) + 1;
        }
      }
    }

    return stats;
  }

  /**
   * Fecha todas as conexões (para shutdown graceful)
   */
  closeAll() {
    this.stopHeartbeat();
    for (const [client] of this.clients) {
      try {
        client.end();
      } catch (e) {
        // Ignora erros ao fechar
      }
    }
    this.clients.clear();
    console.log('📡 SSE: Todas conexões fechadas');
  }
}

// Exporta instância singleton
const sseManager = new SSEManager();
export default sseManager;
