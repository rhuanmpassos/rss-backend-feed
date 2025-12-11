# 📋 IMPLEMENTATION TRACKER - Sistema de Engajamento por Usuário

Este documento rastreia a implementação de todas as features que dependem **apenas do próprio usuário** (não de outros usuários).

**Última atualização:** 2024-12-11

---

## 📊 Status Geral

| Componente | Status | Progresso |
|------------|--------|-----------|
| Migrations | 🟢 Concluído | 100% |
| Modelos | 🟢 Concluído | 100% |
| Serviços | 🟢 Concluído | 100% |
| Endpoints | 🟢 Concluído | 100% |
| Feed-Gateway | 🟢 Concluído | 100% |
| Integração | 🟡 Precisa rodar migration | 90% |

**Legenda:** 🔴 Pendente | 🟡 Em Progresso | 🟢 Concluído

---

## 🗄️ 1. MIGRATIONS

### 1.1 Migration: `008_learning_system.sql`

**Status:** 🟢 Concluído

**O que cria:**
- [x] Expandir `user_interactions` com campos extras (scroll_velocity, screen_position, etc)
- [x] Tabela `user_profiles` (perfil calculado do usuário)
- [x] Tabela `user_sessions` (sessões do usuário)
- [x] Tabela `user_keyword_affinity` (keywords que geram cliques)
- [x] Tabela `clicked_titles_analysis` (análise de títulos clicados)
- [x] Tabela `engagement_config` (configurações dinâmicas)
- [x] Função `check_and_update_user_thresholds` (atualiza flags)
- [x] Trigger para atualizar perfil automaticamente
- [x] Views úteis (`v_users_feature_status`, `v_user_top_keywords`)
- [x] Índices otimizados

**Arquivo:** `backend/migrations/008_learning_system.sql`

**⚠️ AÇÃO NECESSÁRIA:** Rodar a migration:
```bash
cd backend && node run-migrations.js
```

---

## 📦 2. MODELOS

### 2.1 Modelo: `UserProfile.js`

**Status:** 🟢 Concluído

**Métodos:**
- [x] `findByUserId(userId)` - Busca perfil completo
- [x] `upsert(userId, data)` - Cria ou atualiza perfil
- [x] `getSimplifiedProfile(userId)` - Perfil para uso no feed
- [x] `isPeakHour(userId)` - Verifica se é horário de pico do usuário
- [x] `getHighAffinityKeywords(userId)` - Keywords de alta afinidade
- [x] `updateFeatureFlags(userId)` - Atualiza flags de features
- [x] `getThresholds()` - Busca thresholds de config
- [x] `getFeatureStats()` - Estatísticas de features

**Arquivo:** `backend/src/models/UserProfile.js`

---

### 2.2 Modelo: `UserSession.js`

**Status:** 🟢 Concluído

**Métodos:**
- [x] `create(data)` - Cria nova sessão
- [x] `findById(sessionId)` - Busca sessão
- [x] `update(sessionId, data)` - Atualiza sessão
- [x] `increment(sessionId, increments)` - Incrementa contadores
- [x] `end(sessionId)` - Finaliza sessão
- [x] `findByUserId(userId)` - Lista sessões do usuário
- [x] `getStats(userId)` - Estatísticas de sessões
- [x] `findActiveSessions(userId)` - Sessões ativas
- [x] `cleanupStaleSessions()` - Limpa sessões antigas
- [x] `getTimePatterns(userId)` - Padrões de horário

**Arquivo:** `backend/src/models/UserSession.js`

---

## ⚙️ 3. SERVIÇOS

### 3.1 Serviço: `learningService.js`

**Status:** 🟢 Concluído

**Responsabilidade:** Processar interações e aprender sobre o usuário

**Métodos:**
- [x] `processInteractionBatch(userId, interactions, sessionId)` - Processa batch de interações
- [x] `analyzeClickedTitle(userId, articleId)` - Analisa título clicado (detecta gatilhos)
- [x] `updateKeywordAffinity(userId, articleId, eventType)` - Atualiza afinidade por keywords
- [x] `scheduleProfileUpdate(userId)` - Agenda recálculo (debounced)
- [x] `recalculateUserProfile(userId)` - Recalcula perfil completo
- [x] `calculateProfileEmbedding(userId)` - Calcula embedding do perfil
- [x] `calculateTemporalPatterns(userId)` - Calcula padrões de horário
- [x] `calculateContentPreferences(userId)` - Calcula preferências de conteúdo
- [x] `calculateEngagementTriggers(userId)` - Calcula gatilhos que funcionam
- [x] `calculateStats(userId)` - Calcula estatísticas gerais
- [x] `forceRecalculate(userId)` - Força recálculo imediato

**Thresholds (configuráveis via banco):**
```javascript
THRESHOLDS = {
  MIN_CLICKS_FOR_TRIGGERS: 50,      // Ativa gatilhos emocionais
  MIN_DAYS_FOR_PATTERNS: 14,        // Ativa padrões temporais
  MIN_INTERACTIONS_FOR_PREDICTION: 1000, // Ativa predição de clique
  MIN_SESSIONS_FOR_PUSH: 5          // Ativa push inteligente
}
```

**Arquivo:** `backend/src/services/learningService.js`

---

### 3.2 Serviço: `predictionService.js`

**Status:** 🟢 Concluído

**Responsabilidade:** Prever probabilidade de clique

**Métodos:**
- [x] `predictClickProbability(userId, article)` - Calcula P(clique) para um artigo
- [x] `rankArticlesByPrediction(userId, articles)` - Ordena artigos por probabilidade
- [x] `selectArticlesForPush(userId, articles, count)` - Seleciona artigos para push
- [x] `predictBestPushTime(userId)` - Melhor horário para push
- [x] `getWeights()` - Busca pesos de configuração
- [x] `explainPrediction(prediction)` - Explica predição em linguagem natural

**Fatores considerados:**
- Similaridade de embedding (40%)
- Gatilhos emocionais (25%)
- Keywords de alta afinidade (20%)
- Preferência de categoria (15%)

**Arquivo:** `backend/src/services/predictionService.js`

---

### 3.3 Serviço: `patternDetectionService.js`

**Status:** 🟢 Concluído

**Responsabilidade:** Detectar padrões de comportamento

**Métodos:**
- [x] `detectUserPattern(userId)` - Tipo de usuário (heavy/regular/casual/dormant/new)
- [x] `detectEngagementTrend(userId)` - Tendência (increasing/stable/decreasing)
- [x] `detectEmergingInterests(userId)` - Categorias crescendo
- [x] `detectBestNotificationTime(userId)` - Melhor horário para notificar
- [x] `detectWeekdayPattern(userId)` - Padrão de dias da semana
- [x] `getFullAnalysis(userId)` - Análise completa

**Arquivo:** `backend/src/services/patternDetectionService.js`

---

### 3.4 Serviço: `engagementFeedService.js`

**Status:** 🟢 Concluído

**Responsabilidade:** Gerar feed otimizado para engajamento

**Métodos:**
- [x] `getAddictiveFeed(userId, options)` - Feed principal viciante
- [x] `getBreakingNews(limit)` - Notícias urgentes (últimas 2h)
- [x] `getWildcards(userId, limit)` - Artigos surpresa (descoberta)
- [x] `assembleFeed(components)` - Monta feed intercalado
- [x] `partialShuffle(array, start, end)` - Shuffle para imprevisibilidade
- [x] `addDisplayMetadata(articles)` - Adiciona badges e metadados
- [x] `classifyUrgency(article)` - Classifica urgência (live/breaking/new)
- [x] `getTimeAgo(date)` - Timestamp amigável
- [x] `getMoreContent(userId, offset, limit)` - Conteúdo infinito
- [x] `getUnclickedImpressions(userId, limit)` - Artigos não clicados
- [x] `getPopularThisWeek(limit)` - Populares da semana

**Arquivo:** `backend/src/services/engagementFeedService.js`

---

### 3.5 Serviço: `pushNotificationService.js` (Preparação)

**Status:** 🟡 Parcial (lógica pronta, integração pendente)

**Responsabilidade:** Push inteligente baseado no perfil

A lógica de decisão está implementada em `predictionService.js`:
- [x] `predictBestPushTime(userId)` - Melhor horário do usuário
- [x] `selectArticlesForPush(userId, articles, count)` - Seleciona artigo para push

**Pendente:** Integração com Firebase/Expo Push quando o app estiver pronto.

**Arquivo:** (a criar quando integrar com push)

---

## 🌐 4. ENDPOINTS

### 4.1 Rota: `/api/interactions` (Atualizado)

**Status:** 🟢 Concluído

**Mudanças implementadas:**
- [x] Aceitar campos extras (scroll_velocity, screen_position, viewport_time, session_id, device_type)
- [x] Chamar `LearningService.processInteractionBatch()`
- [x] Retornar confirmação com stats

**Novos endpoints:**
- [x] `POST /api/sessions` - Inicia sessão
- [x] `PUT /api/sessions/:sessionId/end` - Finaliza sessão
- [x] `GET /api/sessions/user/:userId` - Lista sessões

**Arquivo:** `backend/src/routes/interactions.js` + `backend/src/controllers/interactionsController.js`

---

### 4.2 Rota: `/feeds/addictive`

**Status:** 🟢 Concluído

**Endpoints:**
- [x] `GET /feeds/addictive?user_id=X&limit=50&offset=0` - Feed viciante
- [x] `GET /feeds/addictive/more?user_id=X&offset=50` - Mais conteúdo (scroll infinito)
- [x] `GET /feeds/breaking` - Notícias das últimas 2h
- [x] `GET /feeds/predict?user_id=X&article_id=Y` - Predição de clique

**Arquivo:** `backend/src/routes/feeds.js` + `backend/src/controllers/feedsController.js`

---

### 4.3 Rota: `/api/users/:userId/profile`

**Status:** 🟢 Concluído

**Endpoints:**
- [x] `GET /api/interactions/users/:userId/profile` - Perfil simplificado
- [x] `GET /api/interactions/users/:userId/profile/full` - Perfil completo (admin)
- [x] `GET /api/interactions/users/:userId/patterns` - Análise de padrões
- [x] `POST /api/interactions/users/:userId/profile/recalculate` - Força recálculo

**Arquivo:** `backend/src/routes/interactions.js` + `backend/src/controllers/interactionsController.js`

---

## 🔗 5. INTEGRAÇÃO

### 5.1 Integrar com Feed Existente

**Status:** 🟢 Concluído

**Tarefas:**
- [x] `engagementFeedService.js` usa `recommendationService.js` internamente
- [x] Fallback gracioso quando usuário não tem dados suficientes
- [x] Log de qual estratégia está sendo usada
- [x] Predição só ativa quando usuário tem 1000+ interações

---

### 5.2 Integrar com Scraping

**Status:** 🟡 Parcial

**Tarefas:**
- [x] Migration adicionou coluna `is_breaking` em articles
- [ ] (Opcional) Detectar breaking news automaticamente no scraper
- [ ] (Opcional) Marcar artigos como `is_breaking` quando detectado

**Nota:** O feed já detecta breaking por horário (< 2h), então a coluna é opcional.

---

## 📊 6. THRESHOLDS E CONFIGURAÇÕES

```javascript
// config/engagement.js

export const ENGAGEMENT_CONFIG = {
  // Quando ativar features por usuário
  thresholds: {
    MIN_CLICKS_FOR_TRIGGERS: 50,        // Gatilhos emocionais
    MIN_DAYS_FOR_TEMPORAL: 14,          // Padrões de horário
    MIN_INTERACTIONS_FOR_PREDICTION: 1000, // Predição de clique
    MIN_SESSIONS_FOR_PUSH: 5,           // Push inteligente
    MIN_CLICKS_FOR_KEYWORDS: 20         // Afinidade por keywords
  },

  // Pesos do algoritmo de predição
  prediction: {
    SIMILARITY_WEIGHT: 0.40,
    TRIGGERS_WEIGHT: 0.25,
    KEYWORDS_WEIGHT: 0.20,
    CATEGORY_WEIGHT: 0.15
  },

  // Configuração do feed
  feed: {
    WILDCARD_PERCENTAGE: 0.12,          // 12% de descobertas
    BREAKING_TOP_POSITIONS: 2,          // Breaking nas posições 1-2
    SHUFFLE_START: 5,                   // Começa shuffle na posição 5
    SHUFFLE_END: 20                     // Termina shuffle na posição 20
  },

  // Recálculo de perfil
  profile: {
    RECALC_DEBOUNCE_MS: 30000,          // 30 segundos após última interação
    MAX_EMBEDDINGS_FOR_PROFILE: 50      // Usa últimos 50 cliques
  }
};
```

---

## 📝 7. ORDEM DE IMPLEMENTAÇÃO

1. **Migration** - Criar tabelas
2. **Modelos** - UserProfile, UserSession
3. **learningService.js** - Processamento de interações
4. **patternDetectionService.js** - Detecção de padrões
5. **predictionService.js** - Predição de clique
6. **engagementFeedService.js** - Feed viciante
7. **Endpoints** - Atualizar/criar rotas
8. **Integração** - Conectar tudo

---

## 🧪 8. COMO TESTAR

### Testar Aprendizado
```bash
# Simula interações de um usuário
node scripts/simulate-user-interactions.js --user_id=1 --count=100

# Verifica perfil gerado
curl http://localhost:3001/api/users/1/profile
```

### Testar Feed
```bash
# Feed para usuário novo (sem dados)
curl "http://localhost:3001/feeds/addictive?user_id=999&limit=10"

# Feed para usuário com histórico
curl "http://localhost:3001/feeds/addictive?user_id=1&limit=10"
```

### Testar Predição
```bash
# Score de predição para artigo específico
curl "http://localhost:3001/api/predict?user_id=1&article_id=123"
```

---

## 📅 9. CHANGELOG

| Data | Mudança |
|------|---------|
| 2024-12-11 | Documento criado |
| 2024-12-11 | ✅ Migration 008_learning_system.sql criada |
| 2024-12-11 | ✅ Modelos UserProfile.js e UserSession.js criados |
| 2024-12-11 | ✅ LearningService implementado |
| 2024-12-11 | ✅ PatternDetectionService implementado |
| 2024-12-11 | ✅ PredictionService implementado |
| 2024-12-11 | ✅ EngagementFeedService implementado |
| 2024-12-11 | ✅ Endpoints atualizados (interactions, feeds) |
| 2024-12-11 | ✅ Feed-Gateway atualizado (tipos, rotas) |
| 2024-12-11 | ✅ Migration 008 executada com sucesso |
| 2024-12-11 | ✅ Tabelas de aprendizado criadas |
| 2024-12-11 | ⚠️  Colunas extras em user_interactions precisam ser adicionadas manualmente (permissão) |


---

## 🌐 10. FEED-GATEWAY (Atualizado)

O gateway em `C:\Users\Rhuan\Documents\projects\RSSapp\feed-gateway` foi atualizado:

### Tipos Atualizados (`src/types.ts`)
- [x] `Interaction` - Novos campos: scroll_velocity, screen_position, viewport_time
- [x] `InteractionBatch` - Novos campos: session_id, device_type
- [x] `UserSession` - Novo tipo para sessões
- [x] `UserProfile` - Novo tipo para perfil
- [x] `DisplayMetadata` - Metadados de exibição
- [x] `AddictiveFeedItem` - Item do feed viciante

### Rotas Adicionadas (`src/routes/api.ts`)

**Sessões:**
- [x] `POST /api/sessions` - Inicia sessão
- [x] `PUT /api/sessions/:sessionId/end` - Finaliza sessão
- [x] `GET /api/sessions/user/:userId` - Lista sessões

**Perfil:**
- [x] `GET /api/users/:userId/profile` - Perfil do usuário
- [x] `GET /api/users/:userId/patterns` - Padrões de comportamento

**Feed Viciante:**
- [x] `GET /api/feeds/addictive` - Feed otimizado
- [x] `GET /api/feeds/addictive/more` - Scroll infinito
- [x] `GET /api/feeds/breaking` - Breaking news
- [x] `GET /api/feeds/predict` - Predição de clique

---

## ⚠️ 10. NOTAS IMPORTANTES

1. **Fallback Gracioso**: Sempre ter comportamento padrão quando usuário não tem dados suficientes
2. **Não Bloquear**: Processamento de learning deve ser assíncrono, não travar requests
3. **Debounce**: Recálculo de perfil deve ser debounced (não a cada interação)
4. **Logs**: Logar qual estratégia está sendo usada (útil para debug)
5. **Thresholds Configuráveis**: Todos os thresholds em arquivo de config

