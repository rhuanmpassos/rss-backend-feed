# 🔥 ENGAGEMENT BACKEND - Guia de Implementação

Este documento detalha TUDO que o backend precisa implementar para criar uma experiência viciante.

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Passo 1: Feed com Imprevisibilidade](#passo-1-feed-com-imprevisibilidade)
3. [Passo 2: Conteúdo Infinito](#passo-2-conteúdo-infinito)
4. [Passo 3: Contadores em Tempo Real](#passo-3-contadores-em-tempo-real)
5. [Passo 4: Sistema de Urgência](#passo-4-sistema-de-urgência)
6. [Passo 5: Push Notifications Inteligentes](#passo-5-push-notifications-inteligentes)
7. [Passo 6: Endpoints Necessários](#passo-6-endpoints-necessários)

---

## Visão Geral

### O que torna um feed viciante:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   PREVISÍVEL (chato)          vs       IMPREVISÍVEL (viciante)      │
│                                                                      │
│   Futebol                              Futebol                       │
│   Futebol                              🔴 BREAKING                   │
│   Futebol                              Futebol                       │
│   Política                             ✨ DESCOBERTA (wildcard)      │
│   Política                             Futebol                       │
│                                        🔥 TRENDING                   │
│   (usuário sabe o que vem)             (surpresa constante)          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Passo 1: Feed com Imprevisibilidade

### 1.1 Criar novo serviço: `engagementFeedService.js`

```javascript
// src/services/engagementFeedService.js

import Article from '../models/Article.js';
import RecommendationService from './recommendationService.js';
import { query } from '../config/database.js';

const EngagementFeedService = {
  /**
   * Gera feed otimizado para engajamento (viciante)
   * Combina: personalização + imprevisibilidade + urgência
   */
  async getAddictiveFeed(userId, { limit = 50, offset = 0 } = {}) {
    console.log(`\n🎰 Gerando feed viciante para usuário ${userId}...`);

    // 1. Base: Feed personalizado
    const personalizedArticles = await RecommendationService.getForYouFeed(userId, limit * 2);
    
    // 2. Breaking news (urgência)
    const breakingNews = await this.getBreakingNews(5);
    
    // 3. Trending (social proof)
    const trending = await this.getTrendingNow(10);
    
    // 4. Wildcards (surpresa/descoberta)
    const wildcards = await this.getWildcards(userId, Math.floor(limit * 0.12));
    
    // 5. Monta feed com imprevisibilidade
    const feed = this.assembleFeed({
      personalized: personalizedArticles,
      breaking: breakingNews,
      trending: trending,
      wildcards: wildcards,
      limit
    });

    // 6. Aplica shuffle parcial (posições 5-20)
    const shuffled = this.partialShuffle(feed, 5, 20);

    // 7. Adiciona metadados de exibição
    const withMetadata = await this.addDisplayMetadata(shuffled);

    console.log(`   ✅ Feed gerado: ${withMetadata.length} artigos`);
    return withMetadata.slice(offset, offset + limit);
  },

  /**
   * Breaking News - Artigos das últimas 2 horas com alta relevância
   */
  async getBreakingNews(limit = 5) {
    const result = await query(`
      SELECT a.*, 
             s.name as site_name,
             c.name as category_name,
             c.slug as category_slug,
             'breaking' as feed_type
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.published_at > NOW() - INTERVAL '2 hours'
        AND a.category_id IS NOT NULL
      ORDER BY a.published_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(a => ({ ...a, is_breaking: true }));
  },

  /**
   * Trending Now - Artigos com mais interações nas últimas 6 horas
   */
  async getTrendingNow(limit = 10) {
    const result = await query(`
      SELECT 
        a.*,
        s.name as site_name,
        c.name as category_name,
        c.slug as category_slug,
        COUNT(ui.id) as interaction_count,
        COUNT(ui.id) FILTER (WHERE ui.interaction_type = 'click') as click_count,
        'trending' as feed_type
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN user_interactions ui ON a.id = ui.article_id 
        AND ui.created_at > NOW() - INTERVAL '6 hours'
      WHERE a.published_at > NOW() - INTERVAL '24 hours'
        AND a.category_id IS NOT NULL
      GROUP BY a.id, s.name, c.name, c.slug
      HAVING COUNT(ui.id) >= 3
      ORDER BY interaction_count DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(a => ({ 
      ...a, 
      is_trending: true,
      trending_count: parseInt(a.interaction_count)
    }));
  },

  /**
   * Wildcards - Artigos FORA do perfil do usuário (descoberta/surpresa)
   * Isso cria o "variable reward" que gera dopamina
   */
  async getWildcards(userId, limit = 6) {
    // Busca categorias que o usuário JÁ consome
    const userCategories = await query(`
      SELECT DISTINCT a.category_id
      FROM user_interactions ui
      JOIN articles a ON ui.article_id = a.id
      WHERE ui.user_id = $1
        AND a.category_id IS NOT NULL
    `, [userId]);

    const excludeCategories = userCategories.rows.map(r => r.category_id);

    // Se usuário é novo, pega artigos populares
    if (excludeCategories.length === 0) {
      return this.getTrendingNow(limit);
    }

    // Busca artigos de categorias que o usuário NUNCA interagiu
    const result = await query(`
      SELECT a.*, 
             s.name as site_name,
             c.name as category_name,
             c.slug as category_slug,
             'wildcard' as feed_type
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.category_id IS NOT NULL
        AND a.category_id != ALL($1::int[])
        AND a.published_at > NOW() - INTERVAL '24 hours'
      ORDER BY 
        -- Prioriza títulos "chamativos"
        (CASE WHEN a.title ILIKE '%exclusivo%' THEN 3 ELSE 0 END) +
        (CASE WHEN a.title ILIKE '%urgente%' THEN 3 ELSE 0 END) +
        (CASE WHEN a.title ILIKE '%inédito%' THEN 2 ELSE 0 END) +
        (CASE WHEN a.title ILIKE '%revelado%' THEN 2 ELSE 0 END) +
        (CASE WHEN a.title ILIKE '%surpreende%' THEN 2 ELSE 0 END) +
        (CASE WHEN a.title ILIKE '%choca%' THEN 1 ELSE 0 END) +
        RANDOM() * 5
      DESC
      LIMIT $2
    `, [excludeCategories, limit]);

    return result.rows.map(a => ({ ...a, is_wildcard: true }));
  },

  /**
   * Monta feed intercalando diferentes tipos de conteúdo
   */
  assembleFeed({ personalized, breaking, trending, wildcards, limit }) {
    const feed = [];
    const usedIds = new Set();

    // Helper para adicionar sem duplicar
    const addUnique = (article) => {
      if (!usedIds.has(article.id)) {
        usedIds.add(article.id);
        feed.push(article);
        return true;
      }
      return false;
    };

    // Posição 1-2: Breaking news (urgência no topo)
    breaking.slice(0, 2).forEach(addUnique);

    // Posição 3-6: Personalizados
    personalized.slice(0, 4).forEach(addUnique);

    // Posição 7: Wildcard (surpresa)
    if (wildcards[0]) addUnique(wildcards[0]);

    // Posição 8-12: Personalizados
    personalized.slice(4, 9).forEach(addUnique);

    // Posição 13: Trending (social proof)
    if (trending[0]) addUnique(trending[0]);

    // Posição 14: Wildcard
    if (wildcards[1]) addUnique(wildcards[1]);

    // Posição 15-20: Mix
    personalized.slice(9, 14).forEach(addUnique);

    // Posição 21: Trending
    if (trending[1]) addUnique(trending[1]);

    // Posição 22: Wildcard
    if (wildcards[2]) addUnique(wildcards[2]);

    // Resto: Personalizados intercalados com wildcards e trending
    let pIdx = 14, wIdx = 3, tIdx = 2;
    while (feed.length < limit) {
      // A cada 7 artigos personalizados, 1 wildcard ou trending
      for (let i = 0; i < 7 && feed.length < limit; i++) {
        if (personalized[pIdx]) addUnique(personalized[pIdx++]);
      }
      
      if (feed.length < limit && wildcards[wIdx]) {
        addUnique(wildcards[wIdx++]);
      }
      
      if (feed.length < limit && trending[tIdx]) {
        addUnique(trending[tIdx++]);
      }

      // Se acabou tudo, para
      if (pIdx >= personalized.length && wIdx >= wildcards.length && tIdx >= trending.length) {
        break;
      }
    }

    return feed;
  },

  /**
   * Shuffle parcial - mantém top N fixo, embaralha o meio
   * Isso cria imprevisibilidade sem perder relevância no topo
   */
  partialShuffle(array, startIndex, endIndex) {
    const result = [...array];
    const section = result.slice(startIndex, endIndex);
    
    // Fisher-Yates shuffle na seção
    for (let i = section.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [section[i], section[j]] = [section[j], section[i]];
    }
    
    // Reinsere seção embaralhada
    result.splice(startIndex, section.length, ...section);
    return result;
  },

  /**
   * Adiciona metadados para exibição (badges, contadores, etc)
   */
  async addDisplayMetadata(articles) {
    const articleIds = articles.map(a => a.id);
    
    // Busca contagem de leitores ativos (últimos 5 min)
    const readersResult = await query(`
      SELECT article_id, COUNT(DISTINCT user_id) as readers
      FROM user_interactions
      WHERE article_id = ANY($1)
        AND created_at > NOW() - INTERVAL '5 minutes'
      GROUP BY article_id
    `, [articleIds]);

    const readersMap = new Map(
      readersResult.rows.map(r => [r.article_id, parseInt(r.readers)])
    );

    return articles.map((article, index) => ({
      ...article,
      position: index + 1,
      active_readers: readersMap.get(article.id) || 0,
      display: {
        show_breaking_badge: article.is_breaking,
        show_trending_badge: article.is_trending,
        show_discovery_badge: article.is_wildcard,
        show_live_readers: (readersMap.get(article.id) || 0) >= 5,
        time_ago: this.getTimeAgo(article.published_at)
      }
    }));
  },

  /**
   * Calcula "há quanto tempo" de forma amigável
   */
  getTimeAgo(date) {
    if (!date) return null;
    
    const now = new Date();
    const published = new Date(date);
    const diffMs = now - published;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'agora';
    if (diffMins < 60) return `há ${diffMins} min`;
    if (diffHours < 24) return `há ${diffHours}h`;
    if (diffDays === 1) return 'ontem';
    return `há ${diffDays} dias`;
  }
};

export default EngagementFeedService;
```

### 1.2 Criar endpoint para feed viciante

```javascript
// Adicionar em src/routes/feeds.js

import EngagementFeedService from '../services/engagementFeedService.js';

/**
 * GET /feeds/addictive
 * Feed otimizado para engajamento máximo
 * Query: user_id, limit, offset
 */
router.get('/addictive', async (req, res) => {
  try {
    const userId = parseInt(req.query.user_id);
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    if (!userId) {
      return res.status(400).json({ error: 'user_id é obrigatório' });
    }

    const feed = await EngagementFeedService.getAddictiveFeed(userId, { limit, offset });

    res.json({
      success: true,
      data: feed,
      meta: {
        limit,
        offset,
        count: feed.length,
        has_more: feed.length === limit
      }
    });
  } catch (error) {
    console.error('Erro ao gerar feed:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## Passo 2: Conteúdo Infinito

### 2.1 Sistema de fallback para nunca acabar

```javascript
// Adicionar ao engagementFeedService.js

/**
 * Busca mais conteúdo quando o "novo" acaba
 * NUNCA retorna array vazio
 */
async getMoreContent(userId, offset, limit = 30) {
  // 1. Tenta artigos novos personalizados
  let articles = await this.getAddictiveFeed(userId, { limit, offset });

  if (articles.length >= limit) {
    return articles;
  }

  // 2. Se não tem novos suficientes, adiciona "revisitar"
  // (artigos que o usuário viu mas não clicou)
  const revisit = await this.getUnclickedImpressions(userId, limit - articles.length);
  articles = [...articles, ...revisit.map(a => ({ ...a, feed_type: 'revisit' }))];

  if (articles.length >= limit) {
    return articles;
  }

  // 3. Se ainda não tem, adiciona "populares da semana"
  const popular = await this.getPopularThisWeek(limit - articles.length);
  articles = [...articles, ...popular.map(a => ({ ...a, feed_type: 'popular_week' }))];

  if (articles.length >= limit) {
    return articles;
  }

  // 4. Último recurso: artigos mais antigos de categorias preferidas
  const older = await this.getOlderRelevant(userId, limit - articles.length);
  articles = [...articles, ...older.map(a => ({ ...a, feed_type: 'older' }))];

  // NUNCA retorna vazio - sempre tem mais
  return articles;
},

/**
 * Artigos que o usuário viu (impressão) mas não clicou
 * Bom para "segunda chance"
 */
async getUnclickedImpressions(userId, limit) {
  const result = await query(`
    SELECT DISTINCT a.*, s.name as site_name, c.name as category_name
    FROM articles a
    JOIN sites s ON a.site_id = s.id
    LEFT JOIN categories c ON a.category_id = c.id
    JOIN user_interactions ui ON a.id = ui.article_id
    WHERE ui.user_id = $1
      AND ui.interaction_type = 'impression'
      AND NOT EXISTS (
        SELECT 1 FROM user_interactions ui2
        WHERE ui2.user_id = $1 
          AND ui2.article_id = a.id
          AND ui2.interaction_type = 'click'
      )
    ORDER BY ui.created_at DESC
    LIMIT $2
  `, [userId, limit]);

  return result.rows;
},

/**
 * Artigos populares da última semana
 */
async getPopularThisWeek(limit) {
  const result = await query(`
    SELECT a.*, s.name as site_name, c.name as category_name,
           COUNT(ui.id) as popularity
    FROM articles a
    JOIN sites s ON a.site_id = s.id
    LEFT JOIN categories c ON a.category_id = c.id
    LEFT JOIN user_interactions ui ON a.id = ui.article_id
    WHERE a.published_at > NOW() - INTERVAL '7 days'
    GROUP BY a.id, s.name, c.name
    ORDER BY popularity DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
},

/**
 * Artigos mais antigos mas relevantes para o usuário
 */
async getOlderRelevant(userId, limit) {
  // Busca categorias preferidas do usuário
  const prefs = await query(`
    SELECT category_id FROM user_category_preferences
    WHERE user_id = $1
    ORDER BY preference_score DESC
    LIMIT 5
  `, [userId]);

  const categoryIds = prefs.rows.map(r => r.category_id);

  if (categoryIds.length === 0) {
    // Se não tem preferências, retorna aleatórios
    const result = await query(`
      SELECT a.*, s.name as site_name, c.name as category_name
      FROM articles a
      JOIN sites s ON a.site_id = s.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.published_at > NOW() - INTERVAL '14 days'
      ORDER BY RANDOM()
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  const result = await query(`
    SELECT a.*, s.name as site_name, c.name as category_name
    FROM articles a
    JOIN sites s ON a.site_id = s.id
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.category_id = ANY($1)
      AND a.published_at > NOW() - INTERVAL '14 days'
    ORDER BY a.published_at DESC
    LIMIT $2
  `, [categoryIds, limit]);

  return result.rows;
}
```

---

## Passo 3: Contadores em Tempo Real

### 3.1 Criar sistema de tracking de leitores ativos

```javascript
// src/services/liveTrackingService.js

import sseManager from './sseManager.js';
import { query } from '../config/database.js';

class LiveTrackingService {
  constructor() {
    // Map: articleId -> Set<sessionId>
    this.activeReaders = new Map();
    
    // Limpa leitores inativos a cada 30 segundos
    setInterval(() => this.cleanupInactive(), 30000);
    
    // Broadcast hot articles a cada 10 segundos
    setInterval(() => this.broadcastHotArticles(), 10000);
  }

  /**
   * Registra que um usuário está lendo um artigo
   */
  trackReader(articleId, sessionId) {
    if (!this.activeReaders.has(articleId)) {
      this.activeReaders.set(articleId, new Map());
    }
    
    // Armazena sessionId com timestamp
    this.activeReaders.get(articleId).set(sessionId, Date.now());
    
    const count = this.activeReaders.get(articleId).size;
    
    // Broadcast se tem leitores significativos
    if (count >= 3) {
      sseManager.broadcast('readers_update', {
        article_id: articleId,
        count: count,
        timestamp: new Date().toISOString()
      });
    }

    return count;
  }

  /**
   * Remove leitor de um artigo
   */
  untrackReader(articleId, sessionId) {
    if (this.activeReaders.has(articleId)) {
      this.activeReaders.get(articleId).delete(sessionId);
      
      if (this.activeReaders.get(articleId).size === 0) {
        this.activeReaders.delete(articleId);
      }
    }
  }

  /**
   * Retorna contagem de leitores ativos
   */
  getReaderCount(articleId) {
    return this.activeReaders.has(articleId) 
      ? this.activeReaders.get(articleId).size 
      : 0;
  }

  /**
   * Retorna artigos "quentes" (mais leitores)
   */
  getHotArticles(minReaders = 5, limit = 10) {
    const hot = [];
    
    for (const [articleId, readers] of this.activeReaders) {
      if (readers.size >= minReaders) {
        hot.push({ article_id: articleId, readers: readers.size });
      }
    }
    
    return hot
      .sort((a, b) => b.readers - a.readers)
      .slice(0, limit);
  }

  /**
   * Broadcast dos artigos mais lidos agora
   */
  broadcastHotArticles() {
    const hot = this.getHotArticles(3, 10);
    
    if (hot.length > 0) {
      sseManager.broadcast('hot_articles', {
        articles: hot,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Limpa leitores inativos (sem ping há 60s)
   */
  cleanupInactive() {
    const now = Date.now();
    const timeout = 60000; // 60 segundos

    for (const [articleId, readers] of this.activeReaders) {
      for (const [sessionId, lastSeen] of readers) {
        if (now - lastSeen > timeout) {
          readers.delete(sessionId);
        }
      }
      
      if (readers.size === 0) {
        this.activeReaders.delete(articleId);
      }
    }
  }

  /**
   * Estatísticas gerais
   */
  getStats() {
    let totalReaders = 0;
    let articlesBeingRead = 0;

    for (const [_, readers] of this.activeReaders) {
      totalReaders += readers.size;
      articlesBeingRead++;
    }

    return {
      total_active_readers: totalReaders,
      articles_being_read: articlesBeingRead,
      hot_articles: this.getHotArticles(5, 5)
    };
  }
}

// Singleton
const liveTrackingService = new LiveTrackingService();
export default liveTrackingService;
```

### 3.2 Endpoints para tracking

```javascript
// Adicionar em src/routes/events.js

import liveTrackingService from '../services/liveTrackingService.js';

/**
 * POST /api/events/reading
 * Registra que usuário está lendo um artigo
 */
router.post('/reading', (req, res) => {
  const { article_id, session_id } = req.body;
  
  if (!article_id || !session_id) {
    return res.status(400).json({ error: 'article_id e session_id são obrigatórios' });
  }

  const count = liveTrackingService.trackReader(article_id, session_id);
  
  res.json({ 
    success: true, 
    readers: count 
  });
});

/**
 * POST /api/events/stop-reading
 * Registra que usuário parou de ler
 */
router.post('/stop-reading', (req, res) => {
  const { article_id, session_id } = req.body;
  
  liveTrackingService.untrackReader(article_id, session_id);
  
  res.json({ success: true });
});

/**
 * GET /api/events/hot
 * Retorna artigos mais lidos agora
 */
router.get('/hot', (req, res) => {
  const hot = liveTrackingService.getHotArticles(3, 20);
  res.json({ 
    success: true, 
    data: hot 
  });
});

/**
 * GET /api/events/stats
 * Estatísticas de leitura em tempo real
 */
router.get('/stats', (req, res) => {
  const stats = liveTrackingService.getStats();
  res.json({ 
    success: true, 
    data: stats 
  });
});
```

---

## Passo 4: Sistema de Urgência

### 4.1 Classificar artigos por urgência

```javascript
// Adicionar ao engagementFeedService.js

/**
 * Classifica nível de urgência de um artigo
 * Retorna: 'live' | 'breaking' | 'hot' | 'new' | 'normal'
 */
classifyUrgency(article) {
  const now = new Date();
  const published = new Date(article.published_at);
  const ageMinutes = (now - published) / 60000;
  const activeReaders = article.active_readers || 0;

  // 🔴 AO VIVO - menos de 10 minutos
  if (ageMinutes < 10) {
    return {
      level: 'live',
      badge: '🔴 AO VIVO',
      color: '#FF0000',
      priority: 5
    };
  }

  // ⚡ URGENTE - menos de 30 minutos
  if (ageMinutes < 30) {
    return {
      level: 'breaking',
      badge: '⚡ URGENTE',
      color: '#FF6B00',
      priority: 4
    };
  }

  // 🔥 EM ALTA - muitos leitores ativos
  if (activeReaders >= 10) {
    return {
      level: 'hot',
      badge: `🔥 ${activeReaders} lendo`,
      color: '#FF4500',
      priority: 3
    };
  }

  // 🆕 NOVO - menos de 2 horas
  if (ageMinutes < 120) {
    return {
      level: 'new',
      badge: '🆕 NOVO',
      color: '#00AA00',
      priority: 2
    };
  }

  // Normal
  return {
    level: 'normal',
    badge: null,
    color: null,
    priority: 1
  };
},

/**
 * Adiciona metadados de urgência aos artigos
 */
addUrgencyMetadata(articles) {
  return articles.map(article => ({
    ...article,
    urgency: this.classifyUrgency(article)
  }));
}
```

### 4.2 Detectar breaking news automaticamente

```javascript
// src/services/breakingNewsDetector.js

import { query } from '../config/database.js';
import sseManager from './sseManager.js';

const BreakingNewsDetector = {
  // Palavras que indicam urgência
  URGENCY_KEYWORDS: [
    'urgente', 'última hora', 'agora', 'breaking',
    'ao vivo', 'live', 'acaba de', 'confirmado',
    'exclusivo', 'bomba', 'chocante', 'morre',
    'morte', 'tragédia', 'acidente', 'atentado',
    'terremoto', 'incêndio', 'prisão', 'preso'
  ],

  /**
   * Verifica se artigo é breaking news
   */
  isBreaking(article) {
    const title = article.title.toLowerCase();
    const summary = (article.summary || '').toLowerCase();
    const text = `${title} ${summary}`;

    // Verifica palavras-chave
    const hasUrgencyKeyword = this.URGENCY_KEYWORDS.some(kw => 
      text.includes(kw)
    );

    // Verifica idade (< 30 min)
    const ageMinutes = article.published_at 
      ? (Date.now() - new Date(article.published_at)) / 60000
      : 999;

    return hasUrgencyKeyword && ageMinutes < 30;
  },

  /**
   * Processa novos artigos e detecta breaking
   * Chamado pelo scraper após salvar novos artigos
   */
  async processNewArticles(articles) {
    for (const article of articles) {
      if (this.isBreaking(article)) {
        console.log(`🔴 BREAKING DETECTADO: ${article.title}`);
        
        // Broadcast via SSE
        sseManager.broadcast('breaking_news', {
          id: article.id,
          title: article.title,
          summary: article.summary,
          url: article.url,
          image_url: article.image_url,
          category: article.category_name,
          site: article.site_name,
          published_at: article.published_at,
          urgency: {
            level: 'breaking',
            badge: '⚡ URGENTE',
            color: '#FF6B00'
          }
        });

        // Marca no banco
        await query(
          'UPDATE articles SET is_breaking = true WHERE id = $1',
          [article.id]
        );
      }
    }
  }
};

export default BreakingNewsDetector;
```

### 4.3 Migração para suportar breaking

```sql
-- migrations/006_add_breaking_news.sql

-- Adiciona flag de breaking news
ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_breaking BOOLEAN DEFAULT false;

-- Adiciona índice para queries de breaking
CREATE INDEX IF NOT EXISTS idx_articles_breaking 
ON articles(is_breaking, published_at DESC) 
WHERE is_breaking = true;
```

---

## Passo 5: Push Notifications Inteligentes

### 5.1 Schema para push notifications

```sql
-- migrations/007_push_notifications.sql

-- Tokens de push por usuário
CREATE TABLE IF NOT EXISTS push_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL, -- 'ios', 'android', 'web'
  device_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, token)
);

-- Configurações de notificação por usuário
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  breaking_news BOOLEAN DEFAULT true,
  daily_digest BOOLEAN DEFAULT true,
  trending BOOLEAN DEFAULT true,
  personalized BOOLEAN DEFAULT true,
  quiet_hours_start TIME DEFAULT '23:00',
  quiet_hours_end TIME DEFAULT '07:00',
  max_per_day INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Histórico de notificações enviadas
CREATE TABLE IF NOT EXISTS notification_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  notification_type VARCHAR(50) NOT NULL, -- 'breaking', 'digest', 'trending', 'personalized'
  title TEXT NOT NULL,
  body TEXT,
  sent_at TIMESTAMP DEFAULT NOW(),
  opened_at TIMESTAMP,
  clicked BOOLEAN DEFAULT false
);

-- Índices
CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);
CREATE INDEX idx_notification_history_user ON notification_history(user_id, sent_at DESC);
```

### 5.2 Serviço de Push Notifications

```javascript
// src/services/pushNotificationService.js

import { query } from '../config/database.js';
// Adicionar: npm install firebase-admin (para FCM)
// ou: npm install @expo/expo-server-sdk (para Expo)

const PushNotificationService = {
  /**
   * Envia notificação de breaking news
   * Só para usuários que:
   * - Têm notificações ativas
   * - Não estão em horário silencioso
   * - Têm interesse na categoria
   * - Não receberam muitas notificações hoje
   */
  async sendBreakingNews(article) {
    console.log(`📱 Preparando push para breaking: ${article.title}`);

    // Busca usuários elegíveis
    const eligibleUsers = await query(`
      SELECT DISTINCT u.id, pt.token, pt.platform
      FROM users u
      JOIN push_tokens pt ON u.id = pt.user_id
      JOIN notification_preferences np ON u.id = np.user_id
      LEFT JOIN user_category_preferences ucp ON u.id = ucp.user_id 
        AND ucp.category_id = $1
      WHERE np.enabled = true
        AND np.breaking_news = true
        AND (
          ucp.preference_score > 0.3  -- Tem interesse na categoria
          OR ucp.id IS NULL           -- Ou é usuário novo (recebe tudo)
        )
        -- Não está em horário silencioso
        AND NOT (
          CURRENT_TIME >= np.quiet_hours_start 
          OR CURRENT_TIME <= np.quiet_hours_end
        )
        -- Não excedeu limite diário
        AND (
          SELECT COUNT(*) FROM notification_history nh
          WHERE nh.user_id = u.id 
            AND nh.sent_at > NOW() - INTERVAL '24 hours'
        ) < np.max_per_day
    `, [article.category_id]);

    console.log(`   Usuários elegíveis: ${eligibleUsers.rows.length}`);

    // Prepara notificação
    const notification = {
      title: `🔴 ${article.category_name || 'URGENTE'}`,
      body: article.title,
      data: {
        type: 'breaking',
        article_id: article.id.toString(),
        url: article.url
      }
    };

    // Envia para cada usuário
    for (const user of eligibleUsers.rows) {
      try {
        await this.sendToDevice(user.token, user.platform, notification);
        
        // Registra no histórico
        await query(`
          INSERT INTO notification_history 
          (user_id, article_id, notification_type, title, body)
          VALUES ($1, $2, 'breaking', $3, $4)
        `, [user.id, article.id, notification.title, notification.body]);

      } catch (error) {
        console.error(`   Erro ao enviar para user ${user.id}:`, error.message);
      }
    }

    console.log(`   ✅ Push enviado para ${eligibleUsers.rows.length} usuários`);
  },

  /**
   * Envia digest diário personalizado
   * Chamado pelo cron às 8h
   */
  async sendDailyDigest() {
    console.log('📱 Enviando digest diário...');

    const users = await query(`
      SELECT u.id, pt.token, pt.platform
      FROM users u
      JOIN push_tokens pt ON u.id = pt.user_id
      JOIN notification_preferences np ON u.id = np.user_id
      WHERE np.enabled = true AND np.daily_digest = true
    `);

    for (const user of users.rows) {
      try {
        // Busca top 3 artigos personalizados das últimas 12h
        const topArticles = await query(`
          SELECT a.title, a.id
          FROM articles a
          JOIN user_category_preferences ucp ON a.category_id = ucp.category_id
          WHERE ucp.user_id = $1
            AND a.published_at > NOW() - INTERVAL '12 hours'
          ORDER BY ucp.preference_score DESC, a.published_at DESC
          LIMIT 3
        `, [user.id]);

        if (topArticles.rows.length === 0) continue;

        const titles = topArticles.rows.map(a => `• ${a.title.slice(0, 50)}...`).join('\n');

        const notification = {
          title: `☀️ Bom dia! ${topArticles.rows.length} notícias para você`,
          body: titles,
          data: {
            type: 'digest',
            article_ids: topArticles.rows.map(a => a.id.toString())
          }
        };

        await this.sendToDevice(user.token, user.platform, notification);

        await query(`
          INSERT INTO notification_history 
          (user_id, notification_type, title, body)
          VALUES ($1, 'digest', $2, $3)
        `, [user.id, notification.title, notification.body]);

      } catch (error) {
        console.error(`Erro digest user ${user.id}:`, error.message);
      }
    }

    console.log(`✅ Digest enviado para ${users.rows.length} usuários`);
  },

  /**
   * Envia notificação de trending
   * Quando artigo passa de X leitores
   */
  async sendTrendingAlert(article, readerCount) {
    if (readerCount < 50) return; // Só se tiver muitos leitores

    console.log(`📱 Trending alert: ${article.title} (${readerCount} leitores)`);

    const users = await query(`
      SELECT DISTINCT u.id, pt.token, pt.platform
      FROM users u
      JOIN push_tokens pt ON u.id = pt.user_id
      JOIN notification_preferences np ON u.id = np.user_id
      JOIN user_category_preferences ucp ON u.id = ucp.user_id
      WHERE np.enabled = true 
        AND np.trending = true
        AND ucp.category_id = $1
        AND ucp.preference_score > 0.5
    `, [article.category_id]);

    const notification = {
      title: `🔥 Trending em ${article.category_name}`,
      body: `${readerCount} pessoas lendo: ${article.title}`,
      data: {
        type: 'trending',
        article_id: article.id.toString()
      }
    };

    for (const user of users.rows) {
      await this.sendToDevice(user.token, user.platform, notification);
    }
  },

  /**
   * Envia para dispositivo específico
   * Implementar com Firebase FCM ou Expo Push
   */
  async sendToDevice(token, platform, notification) {
    // TODO: Implementar com seu serviço de push
    // 
    // Firebase FCM:
    // const message = {
    //   token: token,
    //   notification: {
    //     title: notification.title,
    //     body: notification.body
    //   },
    //   data: notification.data
    // };
    // await admin.messaging().send(message);
    //
    // Expo:
    // const message = {
    //   to: token,
    //   sound: 'default',
    //   title: notification.title,
    //   body: notification.body,
    //   data: notification.data
    // };
    // await expo.sendPushNotificationsAsync([message]);

    console.log(`   📤 Push para ${platform}: ${notification.title}`);
  }
};

export default PushNotificationService;
```

### 5.3 Cron jobs para notificações

```javascript
// Adicionar em src/scheduler/jobs.js

import PushNotificationService from '../services/pushNotificationService.js';

// Digest diário às 8h
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ Cron: Enviando digest diário...');
  await PushNotificationService.sendDailyDigest();
});
```

---

## Passo 6: Endpoints Necessários

### Resumo de todos os endpoints a implementar:

```javascript
// src/routes/feeds.js

// Feed viciante (principal)
GET /feeds/addictive?user_id=X&limit=50&offset=0

// Feed cronológico (fallback)
GET /feeds/chronological?limit=50&offset=0

// Mais conteúdo (infinite scroll)
GET /feeds/more?user_id=X&offset=50&limit=30


// src/routes/events.js

// SSE - conexão real-time
GET /api/events?user_id=X

// Tracking de leitura
POST /api/events/reading      { article_id, session_id }
POST /api/events/stop-reading { article_id, session_id }

// Artigos quentes
GET /api/events/hot

// Estatísticas live
GET /api/events/stats


// src/routes/notifications.js (NOVO)

// Registrar token de push
POST /api/notifications/register   { user_id, token, platform }

// Preferências de notificação
GET  /api/notifications/preferences/:userId
PUT  /api/notifications/preferences/:userId  { enabled, breaking_news, ... }

// Histórico
GET /api/notifications/history/:userId?limit=50

// Marcar como lida
POST /api/notifications/:id/opened
```

---

## ✅ Checklist de Implementação

### Backend - Feed Viciante
- [ ] Criar `engagementFeedService.js`
- [ ] Implementar `getAddictiveFeed()`
- [ ] Implementar `getBreakingNews()`
- [ ] Implementar `getTrendingNow()`
- [ ] Implementar `getWildcards()`
- [ ] Implementar shuffle parcial
- [ ] Criar endpoint `GET /feeds/addictive`

### Backend - Conteúdo Infinito
- [ ] Implementar `getMoreContent()`
- [ ] Implementar fallbacks (revisit, popular, older)
- [ ] Garantir que NUNCA retorna vazio

### Backend - Tempo Real
- [ ] Criar `liveTrackingService.js`
- [ ] Implementar tracking de leitores ativos
- [ ] Broadcast de hot articles via SSE
- [ ] Endpoints de tracking

### Backend - Urgência
- [ ] Criar `breakingNewsDetector.js`
- [ ] Implementar detecção automática
- [ ] Broadcast de breaking via SSE
- [ ] Migração para `is_breaking`

### Backend - Push
- [ ] Migrações de banco
- [ ] Criar `pushNotificationService.js`
- [ ] Implementar breaking push
- [ ] Implementar daily digest
- [ ] Implementar trending alerts
- [ ] Cron jobs

---

**Próximo:** Ver `ENGAGEMENT_FRONTEND.md` para implementação no app.

