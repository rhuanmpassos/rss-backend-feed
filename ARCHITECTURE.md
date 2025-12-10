# 📚 Arquitetura do Backend - RSS Feed Extractor

Este documento detalha a arquitetura completa do backend, incluindo banco de dados, cache, serviços e fluxos de dados.

---

## 📋 Índice

1. [Visão Geral](#-visão-geral)
2. [Stack Tecnológica](#-stack-tecnológica)
3. [Estrutura de Diretórios](#-estrutura-de-diretórios)
4. [Banco de Dados PostgreSQL](#-banco-de-dados-postgresql)
5. [Cache Redis (Upstash)](#-cache-redis-upstash)
6. [API REST](#-api-rest)
7. [Serviços](#-serviços)
8. [Workers e Scheduler](#-workers-e-scheduler)
9. [Fluxos de Dados](#-fluxos-de-dados)
10. [Eventos em Tempo Real (SSE)](#-eventos-em-tempo-real-sse)
11. [Variáveis de Ambiente](#-variáveis-de-ambiente)

---

## 🎯 Visão Geral

O sistema é um **agregador de notícias inteligente** que:
1. Faz **scraping** de sites de notícias
2. **Classifica** artigos automaticamente usando IA (Gemini)
3. **Gera feeds RSS/JSON** agregados
4. Notifica clientes em **tempo real** via SSE
5. Permite **bookmarks** de artigos favoritos

### Fluxo Principal

```
Sites cadastrados → Scraping automático → Deduplicação Redis → 
Salvamento PostgreSQL → Classificação Gemini → Broadcast SSE → 
Frontend atualizado em tempo real
```

---

## 🛠 Stack Tecnológica

| Tecnologia | Uso |
|------------|-----|
| **Node.js** | Runtime |
| **Express** | Framework web |
| **PostgreSQL** | Banco de dados principal |
| **Upstash Redis** | Cache e deduplicação |
| **Google Gemini** | Classificação de artigos com IA |
| **Cheerio** | Parser HTML para scraping |
| **node-cron** | Agendamento de tarefas |
| **RSS** | Geração de feeds RSS 2.0 |

### Dependências Principais

```json
{
  "@google/generative-ai": "^0.24.1",    // Gemini AI
  "@upstash/redis": "^1.35.7",           // Cache
  "axios": "^1.6.0",                      // HTTP client
  "cheerio": "^1.0.0-rc.12",             // HTML parser
  "express": "^4.18.2",                   // Web framework
  "node-cron": "^3.0.3",                  // Scheduler
  "pg": "^8.11.3",                        // PostgreSQL
  "robots-parser": "^3.0.1",              // Respeitar robots.txt
  "rss": "^1.2.2"                         // Gerar feeds RSS
}
```

---

## 📁 Estrutura de Diretórios

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js      # Pool de conexões PostgreSQL
│   │   ├── redis.js         # Cliente Upstash Redis + helpers
│   │   └── migrate.js       # Script de migração
│   │
│   ├── controllers/
│   │   ├── articlesController.js   # CRUD de artigos
│   │   ├── categoriesController.js # Listagem de categorias
│   │   ├── feedsController.js      # Geração de feeds RSS/JSON
│   │   ├── sitesController.js      # CRUD de sites
│   │   └── adminController.js      # Funções administrativas
│   │
│   ├── models/
│   │   ├── Article.js       # Model de artigos
│   │   ├── Category.js      # Model de categorias
│   │   ├── Site.js          # Model de sites
│   │   └── ScrapingLog.js   # Model de logs
│   │
│   ├── routes/
│   │   ├── articles.js      # /api/articles
│   │   ├── categories.js    # /api/categories
│   │   ├── feeds.js         # /feeds
│   │   ├── sites.js         # /api/sites
│   │   ├── admin.js         # /api/admin
│   │   └── events.js        # /api/events (SSE)
│   │
│   ├── services/
│   │   ├── scraperService.js          # Extração de artigos
│   │   ├── geminiClassifierService.js # Classificação via Gemini
│   │   ├── classifierService.js       # Classificação local (backup)
│   │   ├── feedGeneratorService.js    # Geração de feeds
│   │   └── sseManager.js              # Gerenciador de conexões SSE
│   │
│   ├── workers/
│   │   ├── scrapingWorker.js    # Worker de scraping
│   │   ├── classifierWorker.js  # Worker de classificação
│   │   └── cleanupWorker.js     # Worker de limpeza
│   │
│   ├── scheduler/
│   │   └── jobs.js          # Cron jobs agendados
│   │
│   ├── utils/
│   │   ├── rateLimiter.js   # Rate limiting + robots.txt
│   │   └── deduplication.js # Funções de deduplicação
│   │
│   └── server.js            # Entry point
│
└── migrations/
    ├── 001_initial_schema.sql  # Schema inicial
    └── 002_add_bookmarks.sql   # Adiciona bookmarks
```

---

## 🗄 Banco de Dados PostgreSQL

### Diagrama ER

```
┌─────────────────────────────────────────────────────────────────┐
│                          SITES                                   │
├─────────────────────────────────────────────────────────────────┤
│ id              SERIAL PRIMARY KEY                              │
│ name            VARCHAR(255) NOT NULL                           │
│ url             VARCHAR(500) NOT NULL UNIQUE                    │
│ category        VARCHAR(100)                                    │
│ scraping_method VARCHAR(50) DEFAULT 'auto'                      │
│ last_scraped_at TIMESTAMP                                       │
│ scraping_interval INTEGER DEFAULT 3600  (segundos)              │
│ active          BOOLEAN DEFAULT true                            │
│ created_at      TIMESTAMP DEFAULT NOW()                         │
│ updated_at      TIMESTAMP DEFAULT NOW()  (trigger automático)   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 1:N
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ARTICLES                                 │
├─────────────────────────────────────────────────────────────────┤
│ id                  SERIAL PRIMARY KEY                          │
│ site_id             INTEGER REFERENCES sites(id) ON DELETE CASCADE │
│ title               TEXT NOT NULL                               │
│ url                 VARCHAR(1000) NOT NULL UNIQUE               │
│ summary             TEXT                                        │
│ content             TEXT                                        │
│ image_url           VARCHAR(1000)                               │
│ author              VARCHAR(255)                                │
│ published_at        TIMESTAMP                                   │
│ scraped_at          TIMESTAMP DEFAULT NOW()                     │
│ category            VARCHAR(100)        ← Classificação IA      │
│ category_confidence FLOAT               ← Confiança 0-1         │
│ bookmarked          BOOLEAN DEFAULT false ← Preserva na limpeza │
│ created_at          TIMESTAMP DEFAULT NOW()                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        CATEGORIES                                │
├─────────────────────────────────────────────────────────────────┤
│ id          SERIAL PRIMARY KEY                                  │
│ name        VARCHAR(100) NOT NULL UNIQUE                        │
│ slug        VARCHAR(100) NOT NULL UNIQUE                        │
│ description TEXT                                                │
│ created_at  TIMESTAMP DEFAULT NOW()                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      SCRAPING_LOGS                               │
├─────────────────────────────────────────────────────────────────┤
│ id                SERIAL PRIMARY KEY                            │
│ site_id           INTEGER REFERENCES sites(id) ON DELETE CASCADE│
│ status            VARCHAR(50) NOT NULL  ('success' | 'failed')  │
│ articles_found    INTEGER DEFAULT 0                             │
│ error_message     TEXT                                          │
│ scraping_duration INTEGER (milissegundos)                       │
│ created_at        TIMESTAMP DEFAULT NOW()                       │
└─────────────────────────────────────────────────────────────────┘
```

### Categorias Padrão

```sql
'Fórmula 1', 'Futebol', 'Esportes', 'Economia', 'Política',
'Tecnologia', 'Entretenimento', 'Negócios', 'Mundo', 'Brasil',
'Saúde', 'Educação', 'Ciência', 'Meio Ambiente', 'Segurança',
'Religião', 'Automóveis', 'Games'
```

### Índices

```sql
-- Performance de consultas
CREATE INDEX idx_articles_site_id ON articles(site_id);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC NULLS LAST);
CREATE INDEX idx_articles_url ON articles(url);
CREATE INDEX idx_articles_bookmarked ON articles(bookmarked) WHERE bookmarked = true;
CREATE INDEX idx_scraping_logs_site_id ON scraping_logs(site_id);
CREATE INDEX idx_scraping_logs_created_at ON scraping_logs(created_at DESC);
```

### Trigger de Atualização

```sql
-- Atualiza updated_at automaticamente em sites
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Configuração de Conexão

```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },  // Para Render/Heroku
  max: 20,                              // Máximo de conexões
  idleTimeoutMillis: 30000,             // 30s idle
  connectionTimeoutMillis: 2000         // 2s timeout
});
```

---

## 🔴 Cache Redis (Upstash)

### Propósito

O Redis é usado para:
1. **Deduplicação de artigos** - Evita processar o mesmo artigo duas vezes
2. **Rate limiting** - Controla requisições por domínio
3. **Cache temporário** - TTL de 24h para deduplicação

### Estrutura de Chaves

```
┌─────────────────────────────────────────────────────────────────┐
│                     CHAVES REDIS                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DEDUPLICAÇÃO (TTL: 24h)                                        │
│  ─────────────────────────                                      │
│  dedup:url:{md5_hash}    → "1"   (URL já processada)            │
│  dedup:title:{md5_hash}  → "1"   (Título já processado)         │
│                                                                  │
│  RATE LIMITING (TTL: 15min)                                     │
│  ──────────────────────────                                     │
│  ratelimit:{domain}      → count (Contador de requisições)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Funções de Cache

```javascript
// Verificar duplicação
async function isDuplicate(url, title) {
  const normalizedUrl = normalizeUrl(url);
  const titleHash = hashTitle(title);
  
  // Verifica URL
  const urlKey = `dedup:url:${md5(normalizedUrl)}`;
  if (await cache.exists(urlKey)) {
    return { isDuplicate: true, reason: 'url' };
  }
  
  // Verifica título
  const titleKey = `dedup:title:${titleHash}`;
  if (await cache.exists(titleKey)) {
    return { isDuplicate: true, reason: 'title' };
  }
  
  return { isDuplicate: false };
}

// Marcar como processado (TTL 24h)
async function markAsProcessed(url, title) {
  await cache.set(`dedup:url:${hash}`, '1', 86400);
  await cache.set(`dedup:title:${hash}`, '1', 86400);
}
```

### Normalização de URL

Remove parâmetros de tracking antes de gerar hash:

```javascript
function normalizeUrl(url) {
  const parsed = new URL(url);
  // Remove UTMs e tracking
  parsed.searchParams.delete('utm_source');
  parsed.searchParams.delete('utm_medium');
  parsed.searchParams.delete('utm_campaign');
  parsed.searchParams.delete('ref');
  parsed.searchParams.delete('fbclid');
  parsed.searchParams.delete('gclid');
  return parsed.href.toLowerCase().replace(/\/$/, '');
}
```

---

## 🌐 API REST

### Endpoints de Sites

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/sites` | Lista todos os sites |
| `GET` | `/api/sites/:id` | Detalhes de um site |
| `GET` | `/api/sites/:id/stats` | Estatísticas do site |
| `GET` | `/api/sites/:id/articles` | Artigos do site |
| `POST` | `/api/sites` | Cria novo site |
| `POST` | `/api/sites/test` | Testa scraping de URL |
| `PUT` | `/api/sites/:id` | Atualiza site |
| `DELETE` | `/api/sites/:id` | Remove site e artigos |
| `POST` | `/api/sites/:id/scrape` | Força scraping imediato |

### Endpoints de Artigos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/articles` | Lista artigos (filtros: category, limit, offset) |
| `GET` | `/api/articles/:id` | Detalhes de um artigo |
| `GET` | `/api/articles/stats` | Estatísticas gerais |
| `GET` | `/api/articles/stats/by-category` | Estatísticas por categoria |
| `GET` | `/api/articles/bookmarked` | Lista artigos salvos |
| `POST` | `/api/articles/:id/bookmark` | Salva artigo |
| `DELETE` | `/api/articles/:id/bookmark` | Remove dos salvos |

### Endpoints de Categorias

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/categories` | Lista todas as categorias |
| `GET` | `/api/categories/:slug` | Detalhes de uma categoria |
| `GET` | `/api/categories/:slug/stats` | Estatísticas da categoria |

### Endpoints de Feeds RSS/JSON

| Endpoint | Descrição |
|----------|-----------|
| `/feeds/sites/:id.rss` | Feed RSS de um site |
| `/feeds/sites/:id.json` | Feed JSON de um site |
| `/feeds/categories/:slug.rss` | Feed RSS de uma categoria |
| `/feeds/categories/:slug.json` | Feed JSON de uma categoria |
| `/feeds/all.rss` | Feed RSS combinado (todos os sites) |
| `/feeds/all.json` | Feed JSON combinado |

### Endpoints Administrativos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/admin/clear-cache` | Limpa artigos órfãos do PostgreSQL |

---

## ⚙️ Serviços

### 1. ScraperService

Responsável por extrair artigos de sites de notícias.

```javascript
// Fluxo do scraping
async scrapeSite(siteId) {
  // 1. Busca site no banco
  const site = await Site.findById(siteId);
  
  // 2. Faz requisição respeitando rate limit e robots.txt
  const response = await fetchWithRateLimit(site.url);
  
  // 3. Parse HTML com Cheerio
  const $ = cheerio.load(response.data);
  
  // 4. Remove elementos desnecessários
  $('script, style, noscript, iframe, nav, footer, header, aside').remove();
  
  // 5. Extrai artigos usando seletores inteligentes
  const articles = await extractArticles($, site.url);
  
  // 6. Para cada artigo:
  for (const article of articles) {
    // Verifica deduplicação no Redis
    const dupl = await isDuplicate(article.url, article.title);
    if (dupl.isDuplicate) continue;
    
    // Busca imagem se não encontrou
    if (!article.imageUrl) {
      article.imageUrl = await extractImageFromArticlePage(article.url);
    }
    
    // Salva no PostgreSQL
    const saved = await Article.create({ siteId: site.id, ...article });
    
    // Classifica via Gemini (se rate limited, fica na fila)
    const classified = await GeminiClassifier.classifyArticle(article.title, article.summary);
    if (classified) {
      await Article.updateCategory(saved.id, classified.category, classified.confidence);
    }
    
    // Marca como processado no Redis
    await markAsProcessed(article.url, article.title);
  }
  
  // 7. Atualiza last_scraped_at
  await Site.updateLastScraped(siteId);
  
  // 8. Registra log de scraping
  await ScrapingLog.create({ siteId, status: 'success', articlesFound: articles.length });
}
```

**Seletores de Artigos (prioridade)**:
1. `article[itemtype*="NewsArticle"]` - Schema.org
2. `article` - Semântico HTML5
3. `a[href*="/noticia"]`, `a[href*="/news/"]` - Links diretos
4. `[class*="news-item"]`, `[class*="post-item"]` - Classes comuns
5. Seletores específicos para G1, UOL, Climatempo, etc.

**Extração de Imagens (algoritmo de pontuação)**:
1. Meta tags `og:image` e `twitter:image` (+alto)
2. JSON-LD structured data
3. `figure img`, `picture img`
4. Classes `wp-post-image`, `featured-img`
5. Atributos `data-src`, `data-lazy-src` (lazy loading)
6. Sistema de pontuação baseado em tamanho, posição e classe

---

### 2. GeminiClassifierService

Classifica artigos usando Google Gemini AI.

```javascript
async classifyArticle(title, summary = '') {
  const prompt = `
    Você é um classificador de notícias brasileiras. Retorne APENAS JSON válido.
    
    TEXTO: "${title}. ${summary}"
    
    CATEGORIAS: Fórmula 1, Futebol, Esportes, Economia, Política, Tecnologia, ...
    
    FORMATO: {"category":"CATEGORIA","confidence":0.95,"location":"ESTADO_OU_null"}
    
    REGRAS:
    1. TIMES DE FUTEBOL NÃO SÃO LOCALIZAÇÃO
    2. LOCATION só é preenchido se menciona um LUGAR GEOGRÁFICO
  `;
  
  const response = await axios.post(GEMINI_API_URL, { prompt }, { key: apiKey });
  
  return {
    category: parsed.category,      // "Tecnologia"
    confidence: parsed.confidence,  // 0.95
    location: parsed.location,      // "São Paulo" ou null
    method: 'gemini'
  };
}
```

**Rate Limiting**:
- Delay de 1s entre requests
- Se 429 (rate limit), espera 60s
- Artigos não classificados ficam na fila para retry pelo worker

---

### 3. FeedGeneratorService

Gera feeds RSS 2.0 e JSON Feed.

```javascript
// Gera RSS 2.0 com namespace media:
generateRSS(feedData, articles) {
  const feed = new RSS({
    title: feedData.title,
    description: feedData.description,
    feed_url: feedData.feed_url,
    site_url: feedData.site_url,
    language: 'pt-BR',
    custom_namespaces: { 'media': 'http://search.yahoo.com/mrss/' }
  });
  
  for (const article of articles) {
    feed.item({
      title: article.title,
      url: article.url,
      date: article.published_at,
      description: article.summary,
      categories: [article.category],
      enclosure: article.image_url ? { url: article.image_url, type: 'image/jpeg' } : null,
      custom_elements: [
        { 'media:thumbnail': { _attr: { url: article.image_url } } }
      ]
    });
  }
  
  return feed.xml({ indent: true });
}
```

---

### 4. SSEManager

Gerencia conexões SSE (Server-Sent Events) para atualização em tempo real.

```javascript
class SSEManager {
  // Map<Response, { categories: Set|null, sites: Set|null }>
  clients = new Map();
  
  // Adiciona cliente com filtros
  addClient(res, { categories, sites }) {
    this.clients.set(res, {
      categories: categories ? new Set(categories.map(normalizeCategory)) : null,
      sites: sites ? new Set(sites) : null
    });
  }
  
  // Broadcast filtrado - só envia para clientes interessados
  broadcastFiltered(event, data) {
    for (const [client, subscriptions] of this.clients) {
      if (this.shouldReceive(subscriptions, data.category, data.site_id)) {
        client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    }
  }
  
  // Heartbeat a cada 30s para manter conexões vivas
  startHeartbeat() {
    setInterval(() => {
      this.broadcast('heartbeat', { timestamp: new Date().toISOString() });
    }, 30000);
  }
}
```

**Eventos SSE**:
- `connected` - Conexão estabelecida
- `heartbeat` - Keep-alive (30s)
- `new_article` - Novo artigo classificado

**Filtros de Subscription**:
```
GET /api/events                              → Recebe TUDO
GET /api/events?categories=tecnologia        → Só Tecnologia
GET /api/events?categories=tecnologia,futebol&sites=1,5  → Tecnologia e Futebol, sites 1 e 5
```

---

## ⏰ Workers e Scheduler

### Cron Jobs

```javascript
// jobs.js
Scheduler.start() {
  // 1. SCRAPING - A cada 30 minutos
  cron.schedule('*/30 * * * *', () => ScrapingWorker.run());
  
  // 2. CLASSIFICAÇÃO - A cada 5 minutos
  cron.schedule('*/5 * * * *', () => ClassifierWorker.run());
  
  // 3. LIMPEZA - Todo dia às 03:00
  cron.schedule('0 3 * * *', () => CleanupWorker.run());
}
```

### ScrapingWorker

```javascript
async run() {
  // Busca sites que precisam de scraping
  // (last_scraped_at NULL ou diferença > scraping_interval)
  const sites = await Site.findReadyToScrape();
  
  for (const site of sites) {
    await ScraperService.scrapeSite(site.id);
    await delay(2000); // Delay entre sites
  }
}
```

### ClassifierWorker

```javascript
async run() {
  // Processa artigos que não foram classificados (fila do Gemini)
  const result = await GeminiClassifierService.processUncategorized(20);
  // Batch de 20 artigos por execução
}
```

### CleanupWorker

```javascript
async run() {
  const RETENTION_DAYS = 3;
  
  // Remove artigos > 3 dias (EXCETO bookmarked)
  const deletedArticles = await Article.deleteOlderThan(RETENTION_DAYS);
  
  // Remove logs de scraping > 3 dias
  const deletedLogs = await ScrapingLog.deleteOlderThan(RETENTION_DAYS);
}
```

---

## 🔄 Fluxos de Dados

### 1. Fluxo de Scraping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FLUXO DE SCRAPING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │  Cron   │───▶│   Busca      │───▶│   Fetch     │───▶│     Parse       │  │
│  │ (30min) │    │   Sites      │    │   HTML      │    │    Cheerio      │  │
│  └─────────┘    │   Prontos    │    │  (+robots)  │    │                 │  │
│                 └──────────────┘    └─────────────┘    └───────┬─────────┘  │
│                                                                 │           │
│                                                                 ▼           │
│  ┌─────────────────┐    ┌─────────────┐    ┌─────────────────────────────┐  │
│  │   Broadcast     │◀───│   Salva     │◀───│      Verifica               │  │
│  │   SSE           │    │   PostgreSQL │    │      Duplicação            │  │
│  │   (filtered)    │    │             │    │      (Redis)                │  │
│  └─────────────────┘    └──────┬──────┘    └─────────────────────────────┘  │
│                                │                                            │
│                                ▼                                            │
│                     ┌──────────────────┐                                    │
│                     │   Classifica     │                                    │
│                     │   Gemini API     │                                    │
│                     │   (ou fila)      │                                    │
│                     └──────────────────┘                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Fluxo de Classificação (Fila)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUXO DE CLASSIFICAÇÃO                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐    ┌─────────────────┐    ┌─────────────┐    ┌──────────────┐  │
│  │  Cron   │───▶│  Busca Artigos  │───▶│   Gemini    │───▶│   Atualiza   │  │
│  │ (5min)  │    │  category=NULL  │    │    API      │    │   Artigo     │  │
│  └─────────┘    └─────────────────┘    └─────────────┘    └──────┬───────┘  │
│                                                                   │         │
│                                                                   ▼         │
│                                              ┌───────────────────────────┐  │
│                                              │   Broadcast SSE           │  │
│                                              │   'new_article'           │  │
│                                              │   (clientes filtrados)    │  │
│                                              └───────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Fluxo de Geração de Feed

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUXO DE FEED RSS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌─────────────────┐    ┌───────────────────────┐  │
│  │   GET /feeds/    │───▶│   Consulta      │───▶│   Gera RSS 2.0        │  │
│  │   all.rss        │    │   PostgreSQL    │    │   ou JSON Feed        │  │
│  └──────────────────┘    │   (articles)    │    └───────────────────────┘  │
│                          └─────────────────┘                                │
│                                                                             │
│  Filtros disponíveis:                                                       │
│  • /feeds/sites/:id.rss      → Artigos de um site                          │
│  • /feeds/categories/:slug.rss → Artigos de uma categoria                  │
│  • /feeds/all.rss?limit=100  → Feed combinado com limite                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📡 Eventos em Tempo Real (SSE)

### Conexão do Cliente

```javascript
// Frontend
const eventSource = new EventSource('/api/events?categories=tecnologia,games');

eventSource.addEventListener('connected', (e) => {
  console.log('Conectado:', JSON.parse(e.data));
});

eventSource.addEventListener('new_article', (e) => {
  const article = JSON.parse(e.data);
  // Atualiza UI com novo artigo
});

eventSource.addEventListener('heartbeat', (e) => {
  // Keep-alive
});
```

### Formato dos Eventos

```
event: connected
data: {"message":"Connected to SSE","subscriptions":{"categories":["tecnologia"],"sites":"all"}}

event: heartbeat
data: {"timestamp":"2024-01-15T10:30:00.000Z","clients":5}

event: new_article
data: {"id":123,"title":"Nova descoberta...","category":"Tecnologia","site_id":5,...}
```

---

## 🔐 Variáveis de Ambiente

```env
# Servidor
PORT=3000
BASE_URL=http://localhost:3000
NODE_ENV=development

# PostgreSQL
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key

# Scraping
USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
RESPECT_ROBOTS_TXT=true
RATE_LIMIT_WINDOW=900000        # 15 minutos em ms
RATE_LIMIT_MAX_REQUESTS=100     # Max requests por domínio
REQUEST_DELAY=1500              # Delay entre requests em ms
```

---

## 📊 Estatísticas e Monitoramento

### Endpoint de Health Check

```
GET /health
Response: { "status": "ok", "timestamp": "2024-01-15T10:30:00.000Z" }
```

### Estatísticas de Artigos

```
GET /api/articles/stats
Response: {
  "total_articles": 1523,
  "categorized": 1500,
  "articles_today": 45,
  "active_sites": 12,
  "total_categories": 18
}
```

### Status SSE

```
GET /api/events/status
Response: {
  "total": 5,
  "withCategoryFilter": 3,
  "withSiteFilter": 1,
  "noFilters": 1,
  "categories": { "tecnologia": 2, "futebol": 1 },
  "sites": { "1": 1 }
}
```

---

## 🚀 Como Executar

```bash
# Instalar dependências
npm install

# Rodar migrations
npm run migrate

# Desenvolvimento (com hot reload)
npm run dev

# Produção
npm start
```

---

## 📝 Resumo

| Componente | Responsabilidade |
|------------|-----------------|
| **PostgreSQL** | Persistência de sites, artigos, categorias e logs |
| **Redis** | Deduplicação (24h TTL), rate limiting por domínio |
| **Gemini AI** | Classificação automática de artigos em 18 categorias |
| **Cheerio** | Parse HTML e extração de artigos |
| **node-cron** | Agendamento: scraping (30min), classificação (5min), limpeza (3AM) |
| **SSE** | Notificações em tempo real para frontend |
| **RSS/JSON** | Geração de feeds consumíveis por leitores RSS |

O sistema foi projetado para ser:
- **Resiliente**: Fila de classificação, retry automático
- **Respeitoso**: Rate limiting, robots.txt
- **Eficiente**: Deduplicação, índices otimizados
- **Real-time**: SSE com filtros por categoria/site
- **Limpo**: Auto-limpeza de artigos antigos (preserva bookmarks)

