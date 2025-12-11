# 🧠 LEARNING BACKEND - Sistema de Aprendizado do Usuário

Este documento detalha como o backend aprende TUDO sobre cada usuário para personalizar e "persuadir" de forma inteligente.

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Passo 1: Schema de Dados](#passo-1-schema-de-dados)
3. [Passo 2: Processamento de Sinais](#passo-2-processamento-de-sinais)
4. [Passo 3: Perfil do Usuário](#passo-3-perfil-do-usuário)
5. [Passo 4: Detecção de Padrões](#passo-4-detecção-de-padrões)
6. [Passo 5: Predição de Interesse](#passo-5-predição-de-interesse)
7. [Passo 6: Gatilhos Emocionais](#passo-6-gatilhos-emocionais)
8. [Passo 7: A/B Testing](#passo-7-ab-testing)

---

## Visão Geral

### O Que o Sistema Aprende:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PIRÂMIDE DE APRENDIZADO                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  NÍVEL 1: INTERESSES EXPLÍCITOS                                     │
│           "O que ele clica"                                         │
│           → Categorias, fontes, palavras-chave                      │
│                                                                      │
│  NÍVEL 2: INTERESSES LATENTES                                       │
│           "O que ele PARARIA para ver"                              │
│           → Embeddings mostram padrões não óbvios                   │
│                                                                      │
│  NÍVEL 3: PADRÕES COMPORTAMENTAIS                                   │
│           "Como e quando ele consome"                               │
│           → Horários, velocidade, frequência                        │
│                                                                      │
│  NÍVEL 4: GATILHOS EMOCIONAIS                                       │
│           "O que faz ele clicar"                                    │
│           → Palavras, urgência, polêmica                            │
│                                                                      │
│  NÍVEL 5: PREDIÇÃO                                                  │
│           "O que ele VAI querer"                                    │
│           → Score de probabilidade de clique                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Passo 1: Schema de Dados

### 1.1 Migração: Dados Comportamentais Expandidos

```sql
-- migrations/008_learning_system.sql

-- Expandir user_interactions com mais contexto
ALTER TABLE user_interactions 
ADD COLUMN IF NOT EXISTS session_id UUID,
ADD COLUMN IF NOT EXISTS scroll_velocity FLOAT,        -- pixels/segundo (velocidade do scroll)
ADD COLUMN IF NOT EXISTS screen_position VARCHAR(20),  -- 'top', 'middle', 'bottom'
ADD COLUMN IF NOT EXISTS viewport_time INTEGER,        -- ms que ficou visível na tela
ADD COLUMN IF NOT EXISTS scroll_direction VARCHAR(10), -- 'up', 'down'
ADD COLUMN IF NOT EXISTS day_of_week INTEGER,          -- 0-6 (domingo-sábado)
ADD COLUMN IF NOT EXISTS hour_of_day INTEGER,          -- 0-23
ADD COLUMN IF NOT EXISTS device_type VARCHAR(20),      -- 'ios', 'android', 'web'
ADD COLUMN IF NOT EXISTS is_first_session BOOLEAN DEFAULT false;

-- Índices para queries de aprendizado
CREATE INDEX IF NOT EXISTS idx_interactions_session ON user_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_time_patterns ON user_interactions(user_id, hour_of_day, day_of_week);

-- Perfil completo do usuário (calculado)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  
  -- Embedding do perfil (média dos artigos clicados)
  profile_embedding vector(384),
  
  -- Padrões temporais (JSON)
  -- {"peak_hours": [8, 12, 19], "peak_days": [1, 2, 3], "avg_session_duration": 420}
  temporal_patterns JSONB DEFAULT '{}',
  
  -- Preferências de conteúdo (JSON)
  -- {"preferred_length": "short", "preferred_sources": ["g1", "uol"], "avg_read_time": 45}
  content_preferences JSONB DEFAULT '{}',
  
  -- Gatilhos que funcionam (JSON)
  -- {"urgency_multiplier": 1.5, "controversy_multiplier": 1.2, "keywords": ["exclusivo", "urgente"]}
  engagement_triggers JSONB DEFAULT '{}',
  
  -- Estatísticas gerais
  total_sessions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_time_spent INTEGER DEFAULT 0,  -- segundos
  avg_session_duration INTEGER DEFAULT 0,
  
  -- Última atualização
  last_calculated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sessões do usuário (para análise de comportamento)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration INTEGER,  -- segundos
  
  -- Métricas da sessão
  articles_viewed INTEGER DEFAULT 0,
  articles_clicked INTEGER DEFAULT 0,
  scroll_depth INTEGER DEFAULT 0,       -- até onde scrollou
  refresh_count INTEGER DEFAULT 0,      -- quantas vezes deu pull-to-refresh
  
  -- Contexto
  device_type VARCHAR(20),
  entry_source VARCHAR(50),  -- 'push', 'organic', 'share'
  
  -- Análise
  engagement_score FLOAT,  -- calculado ao fim da sessão
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, started_at DESC);

-- Keywords que geram cliques por usuário
CREATE TABLE IF NOT EXISTS user_keyword_affinity (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  keyword VARCHAR(100) NOT NULL,
  click_count INTEGER DEFAULT 0,
  impression_count INTEGER DEFAULT 0,
  ctr FLOAT GENERATED ALWAYS AS (
    CASE WHEN impression_count > 0 
    THEN click_count::float / impression_count 
    ELSE 0 END
  ) STORED,
  last_clicked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_keyword_affinity_user ON user_keyword_affinity(user_id, ctr DESC);

-- Histórico de títulos clicados (para análise de gatilhos)
CREATE TABLE IF NOT EXISTS clicked_titles_analysis (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  
  -- Análise do título
  has_urgency BOOLEAN DEFAULT false,      -- contém "urgente", "agora", etc
  has_numbers BOOLEAN DEFAULT false,      -- contém números
  has_question BOOLEAN DEFAULT false,     -- é pergunta
  has_controversy BOOLEAN DEFAULT false,  -- palavras polêmicas
  word_count INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clicked_titles_user ON clicked_titles_analysis(user_id);
```

### 1.2 Criar tabela de experimentos A/B

```sql
-- Experimentos A/B
CREATE TABLE IF NOT EXISTS experiments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  
  -- Variantes: {"control": "Feed padrão", "treatment": "Feed com wildcards"}
  variants JSONB NOT NULL,
  
  -- Configuração
  traffic_percent FLOAT DEFAULT 100,  -- % de usuários no experimento
  
  status VARCHAR(20) DEFAULT 'draft',  -- 'draft', 'running', 'paused', 'completed'
  
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Usuários em experimentos
CREATE TABLE IF NOT EXISTS user_experiments (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
  variant VARCHAR(50) NOT NULL,  -- 'control' ou 'treatment'
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, experiment_id)
);

-- Métricas dos experimentos
CREATE TABLE IF NOT EXISTS experiment_events (
  id SERIAL PRIMARY KEY,
  experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  variant VARCHAR(50) NOT NULL,
  
  event_type VARCHAR(50) NOT NULL,  -- 'session_start', 'click', 'scroll', etc
  event_value FLOAT,                 -- valor numérico (ex: duração em segundos)
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiment_events ON experiment_events(experiment_id, variant, event_type);
```

---

## Passo 2: Processamento de Sinais

### 2.1 Serviço de Ingestão de Eventos

```javascript
// src/services/learningService.js

import { query } from '../config/database.js';
import EmbeddingService from './embeddingService.js';

const LearningService = {
  /**
   * Processa batch de interações do app
   * Chamado pelo endpoint POST /api/interactions
   */
  async processInteractionBatch(userId, interactions, sessionId, deviceType) {
    console.log(`🧠 Processando ${interactions.length} interações do usuário ${userId}`);

    const now = new Date();
    const hourOfDay = now.getHours();
    const dayOfWeek = now.getDay();

    for (const interaction of interactions) {
      // 1. Salva interação com contexto expandido
      await query(`
        INSERT INTO user_interactions 
        (user_id, article_id, interaction_type, duration, position, 
         session_id, scroll_velocity, screen_position, viewport_time,
         hour_of_day, day_of_week, device_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        userId,
        interaction.article_id,
        interaction.interaction_type,
        interaction.duration || null,
        interaction.position || null,
        sessionId,
        interaction.scroll_velocity || null,
        interaction.screen_position || null,
        interaction.viewport_time || null,
        hourOfDay,
        dayOfWeek,
        deviceType
      ]);

      // 2. Se foi clique, processa análise de título
      if (interaction.interaction_type === 'click') {
        await this.analyzeClickedTitle(userId, interaction.article_id);
        await this.updateKeywordAffinity(userId, interaction.article_id, 'click');
      }

      // 3. Se foi impressão, atualiza keywords
      if (interaction.interaction_type === 'impression') {
        await this.updateKeywordAffinity(userId, interaction.article_id, 'impression');
      }
    }

    // 4. Atualiza sessão
    await this.updateSession(userId, sessionId, interactions);

    // 5. Agenda recálculo do perfil (debounced)
    this.scheduleProfileUpdate(userId);

    return { processed: interactions.length };
  },

  /**
   * Analisa título clicado para detectar padrões de gatilhos
   */
  async analyzeClickedTitle(userId, articleId) {
    const article = await query(
      'SELECT id, title FROM articles WHERE id = $1',
      [articleId]
    );

    if (!article.rows[0]) return;

    const title = article.rows[0].title.toLowerCase();

    // Detecta características do título
    const hasUrgency = /urgente|agora|última hora|breaking|ao vivo/i.test(title);
    const hasNumbers = /\d+/.test(title);
    const hasQuestion = /\?/.test(title);
    const hasControversy = /polêmic|escândalo|choca|impressiona|revela|bomba|denúncia/i.test(title);
    const wordCount = title.split(/\s+/).length;

    await query(`
      INSERT INTO clicked_titles_analysis 
      (user_id, article_id, title, has_urgency, has_numbers, has_question, has_controversy, word_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [userId, articleId, article.rows[0].title, hasUrgency, hasNumbers, hasQuestion, hasControversy, wordCount]);
  },

  /**
   * Atualiza afinidade por keywords do título
   */
  async updateKeywordAffinity(userId, articleId, eventType) {
    const article = await query(
      'SELECT title FROM articles WHERE id = $1',
      [articleId]
    );

    if (!article.rows[0]) return;

    // Extrai palavras significativas (> 4 caracteres, não stop words)
    const stopWords = new Set(['para', 'como', 'sobre', 'mais', 'depois', 'antes', 'ainda', 'mesmo', 'sendo']);
    const keywords = article.rows[0].title
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4 && !stopWords.has(w))
      .slice(0, 5); // Top 5 keywords

    for (const keyword of keywords) {
      if (eventType === 'click') {
        await query(`
          INSERT INTO user_keyword_affinity (user_id, keyword, click_count, impression_count, last_clicked_at)
          VALUES ($1, $2, 1, 0, NOW())
          ON CONFLICT (user_id, keyword)
          DO UPDATE SET 
            click_count = user_keyword_affinity.click_count + 1,
            last_clicked_at = NOW()
        `, [userId, keyword]);
      } else {
        await query(`
          INSERT INTO user_keyword_affinity (user_id, keyword, click_count, impression_count)
          VALUES ($1, $2, 0, 1)
          ON CONFLICT (user_id, keyword)
          DO UPDATE SET 
            impression_count = user_keyword_affinity.impression_count + 1
        `, [userId, keyword]);
      }
    }
  },

  /**
   * Atualiza dados da sessão
   */
  async updateSession(userId, sessionId, interactions) {
    const clicks = interactions.filter(i => i.interaction_type === 'click').length;
    const views = interactions.filter(i => i.interaction_type === 'view').length;

    await query(`
      INSERT INTO user_sessions (id, user_id, articles_viewed, articles_clicked)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id)
      DO UPDATE SET
        articles_viewed = user_sessions.articles_viewed + $3,
        articles_clicked = user_sessions.articles_clicked + $4,
        ended_at = NOW()
    `, [sessionId, userId, views, clicks]);
  },

  // Debounce para recálculo de perfil
  profileUpdateTimers: new Map(),

  scheduleProfileUpdate(userId) {
    // Cancela timer anterior
    if (this.profileUpdateTimers.has(userId)) {
      clearTimeout(this.profileUpdateTimers.get(userId));
    }

    // Agenda novo recálculo em 30 segundos
    const timer = setTimeout(() => {
      this.recalculateUserProfile(userId);
      this.profileUpdateTimers.delete(userId);
    }, 30000);

    this.profileUpdateTimers.set(userId, timer);
  },

  /**
   * Recalcula perfil completo do usuário
   */
  async recalculateUserProfile(userId) {
    console.log(`🔄 Recalculando perfil do usuário ${userId}...`);

    // 1. Calcula embedding do perfil (média dos artigos clicados)
    const profileEmbedding = await this.calculateProfileEmbedding(userId);

    // 2. Calcula padrões temporais
    const temporalPatterns = await this.calculateTemporalPatterns(userId);

    // 3. Calcula preferências de conteúdo
    const contentPreferences = await this.calculateContentPreferences(userId);

    // 4. Calcula gatilhos de engajamento
    const engagementTriggers = await this.calculateEngagementTriggers(userId);

    // 5. Calcula estatísticas gerais
    const stats = await this.calculateStats(userId);

    // 6. Salva perfil
    await query(`
      INSERT INTO user_profiles 
      (user_id, profile_embedding, temporal_patterns, content_preferences, 
       engagement_triggers, total_sessions, total_clicks, total_time_spent, 
       avg_session_duration, last_calculated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        profile_embedding = $2,
        temporal_patterns = $3,
        content_preferences = $4,
        engagement_triggers = $5,
        total_sessions = $6,
        total_clicks = $7,
        total_time_spent = $8,
        avg_session_duration = $9,
        last_calculated_at = NOW()
    `, [
      userId,
      profileEmbedding ? `[${profileEmbedding.join(',')}]` : null,
      JSON.stringify(temporalPatterns),
      JSON.stringify(contentPreferences),
      JSON.stringify(engagementTriggers),
      stats.totalSessions,
      stats.totalClicks,
      stats.totalTimeSpent,
      stats.avgSessionDuration
    ]);

    console.log(`   ✅ Perfil do usuário ${userId} atualizado`);
  },

  /**
   * Calcula embedding do perfil (média dos artigos clicados)
   */
  async calculateProfileEmbedding(userId) {
    const result = await query(`
      SELECT a.embedding::text
      FROM user_interactions ui
      JOIN articles a ON ui.article_id = a.id
      WHERE ui.user_id = $1 
        AND ui.interaction_type = 'click'
        AND a.embedding IS NOT NULL
      ORDER BY ui.created_at DESC
      LIMIT 50
    `, [userId]);

    if (result.rows.length === 0) return null;

    // Converte e calcula média
    const embeddings = result.rows.map(r => 
      r.embedding.slice(1, -1).split(',').map(Number)
    );

    return EmbeddingService.averageEmbeddings(embeddings);
  },

  /**
   * Calcula padrões temporais do usuário
   */
  async calculateTemporalPatterns(userId) {
    // Horários mais ativos
    const hourResult = await query(`
      SELECT hour_of_day, COUNT(*) as count
      FROM user_interactions
      WHERE user_id = $1 AND hour_of_day IS NOT NULL
      GROUP BY hour_of_day
      ORDER BY count DESC
      LIMIT 5
    `, [userId]);

    const peakHours = hourResult.rows.map(r => r.hour_of_day);

    // Dias mais ativos
    const dayResult = await query(`
      SELECT day_of_week, COUNT(*) as count
      FROM user_interactions
      WHERE user_id = $1 AND day_of_week IS NOT NULL
      GROUP BY day_of_week
      ORDER BY count DESC
      LIMIT 3
    `, [userId]);

    const peakDays = dayResult.rows.map(r => r.day_of_week);

    // Duração média de sessão
    const sessionResult = await query(`
      SELECT AVG(duration) as avg_duration
      FROM user_sessions
      WHERE user_id = $1 AND duration IS NOT NULL
    `, [userId]);

    return {
      peak_hours: peakHours,
      peak_days: peakDays,
      avg_session_duration: Math.round(sessionResult.rows[0]?.avg_duration || 0)
    };
  },

  /**
   * Calcula preferências de conteúdo
   */
  async calculateContentPreferences(userId) {
    // Fontes preferidas
    const sourcesResult = await query(`
      SELECT s.name, COUNT(*) as count
      FROM user_interactions ui
      JOIN articles a ON ui.article_id = a.id
      JOIN sites s ON a.site_id = s.id
      WHERE ui.user_id = $1 AND ui.interaction_type = 'click'
      GROUP BY s.name
      ORDER BY count DESC
      LIMIT 5
    `, [userId]);

    // Tempo médio de leitura
    const readTimeResult = await query(`
      SELECT AVG(duration) as avg_read_time
      FROM user_interactions
      WHERE user_id = $1 
        AND interaction_type = 'view'
        AND duration > 5000
    `, [userId]);

    // Tamanho preferido de título
    const titleLengthResult = await query(`
      SELECT AVG(cta.word_count) as avg_words
      FROM clicked_titles_analysis cta
      WHERE cta.user_id = $1
    `, [userId]);

    const avgWords = titleLengthResult.rows[0]?.avg_words || 0;
    const preferredLength = avgWords < 8 ? 'short' : avgWords < 15 ? 'medium' : 'long';

    return {
      preferred_sources: sourcesResult.rows.map(r => r.name),
      avg_read_time: Math.round(readTimeResult.rows[0]?.avg_read_time || 0) / 1000,
      preferred_title_length: preferredLength
    };
  },

  /**
   * Calcula gatilhos de engajamento que funcionam para o usuário
   */
  async calculateEngagementTriggers(userId) {
    // Taxa de clique por característica de título
    const analysis = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE has_urgency) as urgency_clicks,
        COUNT(*) FILTER (WHERE has_numbers) as numbers_clicks,
        COUNT(*) FILTER (WHERE has_question) as question_clicks,
        COUNT(*) FILTER (WHERE has_controversy) as controversy_clicks,
        COUNT(*) as total_clicks
      FROM clicked_titles_analysis
      WHERE user_id = $1
    `, [userId]);

    const stats = analysis.rows[0];
    const total = stats.total_clicks || 1;

    // Calcula multiplicadores (quão mais provável é clicar se tem essa característica)
    // Baseline é 0.25 (25% dos títulos gerais têm cada característica)
    const baseline = 0.25;

    const urgencyRate = stats.urgency_clicks / total;
    const numbersRate = stats.numbers_clicks / total;
    const questionRate = stats.question_clicks / total;
    const controversyRate = stats.controversy_clicks / total;

    // Keywords com maior CTR
    const keywordsResult = await query(`
      SELECT keyword, ctr
      FROM user_keyword_affinity
      WHERE user_id = $1 AND click_count >= 2
      ORDER BY ctr DESC
      LIMIT 10
    `, [userId]);

    return {
      urgency_multiplier: urgencyRate > baseline ? 1 + (urgencyRate - baseline) * 2 : 1,
      numbers_multiplier: numbersRate > baseline ? 1 + (numbersRate - baseline) * 2 : 1,
      question_multiplier: questionRate > baseline ? 1 + (questionRate - baseline) * 2 : 1,
      controversy_multiplier: controversyRate > baseline ? 1 + (controversyRate - baseline) * 2 : 1,
      high_ctr_keywords: keywordsResult.rows.map(r => r.keyword)
    };
  },

  /**
   * Calcula estatísticas gerais
   */
  async calculateStats(userId) {
    const result = await query(`
      SELECT 
        (SELECT COUNT(*) FROM user_sessions WHERE user_id = $1) as total_sessions,
        (SELECT COUNT(*) FROM user_interactions WHERE user_id = $1 AND interaction_type = 'click') as total_clicks,
        (SELECT COALESCE(SUM(duration), 0) FROM user_sessions WHERE user_id = $1) as total_time_spent,
        (SELECT AVG(duration) FROM user_sessions WHERE user_id = $1 AND duration IS NOT NULL) as avg_session_duration
    `, [userId]);

    return {
      totalSessions: parseInt(result.rows[0].total_sessions) || 0,
      totalClicks: parseInt(result.rows[0].total_clicks) || 0,
      totalTimeSpent: parseInt(result.rows[0].total_time_spent) || 0,
      avgSessionDuration: Math.round(result.rows[0].avg_session_duration) || 0
    };
  }
};

export default LearningService;
```

---

## Passo 3: Perfil do Usuário

### 3.1 Modelo de Perfil

```javascript
// src/models/UserProfile.js

import { query } from '../config/database.js';

const UserProfile = {
  /**
   * Busca perfil completo do usuário
   */
  async findByUserId(userId) {
    const result = await query(`
      SELECT 
        up.*,
        up.profile_embedding::text as profile_embedding_text
      FROM user_profiles up
      WHERE up.user_id = $1
    `, [userId]);

    if (!result.rows[0]) return null;

    const profile = result.rows[0];
    
    // Parse embedding
    if (profile.profile_embedding_text) {
      profile.profile_embedding = profile.profile_embedding_text
        .slice(1, -1)
        .split(',')
        .map(Number);
    }

    return profile;
  },

  /**
   * Busca perfil simplificado para uso no feed
   */
  async getSimplifiedProfile(userId) {
    const profile = await this.findByUserId(userId);
    
    if (!profile) {
      return {
        isNew: true,
        hasPreferences: false
      };
    }

    return {
      isNew: false,
      hasPreferences: true,
      hasEmbedding: !!profile.profile_embedding,
      temporalPatterns: profile.temporal_patterns || {},
      engagementTriggers: profile.engagement_triggers || {},
      contentPreferences: profile.content_preferences || {}
    };
  },

  /**
   * Verifica se é horário de pico do usuário
   */
  async isPeakHour(userId) {
    const profile = await this.findByUserId(userId);
    if (!profile || !profile.temporal_patterns?.peak_hours) return false;

    const currentHour = new Date().getHours();
    return profile.temporal_patterns.peak_hours.includes(currentHour);
  },

  /**
   * Busca keywords de alta afinidade do usuário
   */
  async getHighAffinityKeywords(userId, limit = 20) {
    const result = await query(`
      SELECT keyword, ctr
      FROM user_keyword_affinity
      WHERE user_id = $1 AND click_count >= 2
      ORDER BY ctr DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  }
};

export default UserProfile;
```

---

## Passo 4: Detecção de Padrões

### 4.1 Serviço de Detecção de Padrões

```javascript
// src/services/patternDetectionService.js

import { query } from '../config/database.js';

const PatternDetectionService = {
  /**
   * Detecta padrão de consumo do usuário
   * Retorna: 'heavy', 'regular', 'casual', 'dormant'
   */
  async detectUserPattern(userId) {
    const stats = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as interactions_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as interactions_today,
        COUNT(DISTINCT DATE(created_at)) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as active_days
      FROM user_interactions
      WHERE user_id = $1
    `, [userId]);

    const { interactions_week, interactions_today, active_days } = stats.rows[0];

    // Heavy user: usa todos os dias, muitas interações
    if (active_days >= 6 && interactions_week > 100) {
      return 'heavy';
    }

    // Regular: usa maioria dos dias
    if (active_days >= 4 && interactions_week > 30) {
      return 'regular';
    }

    // Casual: usa algumas vezes por semana
    if (active_days >= 1 && interactions_week > 5) {
      return 'casual';
    }

    // Dormant: não usou recentemente
    return 'dormant';
  },

  /**
   * Detecta tendência de engajamento
   * Está aumentando, estável ou diminuindo?
   */
  async detectEngagementTrend(userId) {
    const result = await query(`
      WITH weekly_stats AS (
        SELECT 
          DATE_TRUNC('week', created_at) as week,
          COUNT(*) as interactions
        FROM user_interactions
        WHERE user_id = $1 
          AND created_at > NOW() - INTERVAL '4 weeks'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week
      )
      SELECT 
        ARRAY_AGG(interactions ORDER BY week) as weekly_interactions
      FROM weekly_stats
    `, [userId]);

    const weekly = result.rows[0]?.weekly_interactions || [];

    if (weekly.length < 2) return 'unknown';

    const recent = weekly.slice(-2);
    const older = weekly.slice(0, -2);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.length > 0 
      ? older.reduce((a, b) => a + b, 0) / older.length 
      : recentAvg;

    const change = (recentAvg - olderAvg) / olderAvg;

    if (change > 0.2) return 'increasing';
    if (change < -0.2) return 'decreasing';
    return 'stable';
  },

  /**
   * Detecta interesse emergente
   * Categoria que o usuário começou a consumir mais recentemente
   */
  async detectEmergingInterests(userId) {
    const result = await query(`
      WITH recent_categories AS (
        SELECT 
          a.category_id,
          c.name as category_name,
          COUNT(*) as recent_count
        FROM user_interactions ui
        JOIN articles a ON ui.article_id = a.id
        JOIN categories c ON a.category_id = c.id
        WHERE ui.user_id = $1 
          AND ui.created_at > NOW() - INTERVAL '7 days'
          AND ui.interaction_type = 'click'
        GROUP BY a.category_id, c.name
      ),
      older_categories AS (
        SELECT 
          a.category_id,
          COUNT(*) as older_count
        FROM user_interactions ui
        JOIN articles a ON ui.article_id = a.id
        WHERE ui.user_id = $1 
          AND ui.created_at BETWEEN NOW() - INTERVAL '30 days' AND NOW() - INTERVAL '7 days'
          AND ui.interaction_type = 'click'
        GROUP BY a.category_id
      )
      SELECT 
        rc.category_id,
        rc.category_name,
        rc.recent_count,
        COALESCE(oc.older_count, 0) as older_count,
        CASE 
          WHEN COALESCE(oc.older_count, 0) = 0 THEN rc.recent_count
          ELSE (rc.recent_count - oc.older_count)::float / oc.older_count
        END as growth_rate
      FROM recent_categories rc
      LEFT JOIN older_categories oc ON rc.category_id = oc.category_id
      WHERE rc.recent_count >= 3
      ORDER BY growth_rate DESC
      LIMIT 3
    `, [userId]);

    return result.rows.filter(r => r.growth_rate > 0.5);
  },

  /**
   * Detecta horário ideal para notificação
   */
  async detectBestNotificationTime(userId) {
    const result = await query(`
      SELECT 
        hour_of_day,
        COUNT(*) as interactions,
        COUNT(*) FILTER (WHERE interaction_type = 'click') as clicks
      FROM user_interactions
      WHERE user_id = $1 
        AND hour_of_day IS NOT NULL
        AND created_at > NOW() - INTERVAL '14 days'
      GROUP BY hour_of_day
      HAVING COUNT(*) >= 3
      ORDER BY clicks DESC, interactions DESC
      LIMIT 3
    `, [userId]);

    return result.rows.map(r => ({
      hour: r.hour_of_day,
      score: parseInt(r.clicks) + parseInt(r.interactions) * 0.1
    }));
  }
};

export default PatternDetectionService;
```

---

## Passo 5: Predição de Interesse

### 5.1 Score de Probabilidade de Clique

```javascript
// src/services/predictionService.js

import { query } from '../config/database.js';
import UserProfile from '../models/UserProfile.js';
import EmbeddingService from './embeddingService.js';

const PredictionService = {
  /**
   * Calcula probabilidade de clique para um artigo
   * Combina: similaridade de embedding + gatilhos + categoria
   */
  async predictClickProbability(userId, article) {
    const profile = await UserProfile.findByUserId(userId);
    
    if (!profile) {
      // Usuário novo - score baseado apenas em popularidade
      return { score: 0.5, reason: 'new_user' };
    }

    let score = 0.5; // Base
    const factors = [];

    // 1. SIMILARIDADE DE EMBEDDING (40% do peso)
    if (profile.profile_embedding && article.embedding) {
      const similarity = EmbeddingService.cosineSimilarity(
        profile.profile_embedding,
        article.embedding
      );
      score += (similarity - 0.5) * 0.4;
      factors.push({ type: 'similarity', value: similarity });
    }

    // 2. GATILHOS EMOCIONAIS (25% do peso)
    const triggers = profile.engagement_triggers || {};
    const title = article.title.toLowerCase();

    // Urgência
    if (/urgente|agora|última hora|breaking/i.test(title)) {
      const mult = triggers.urgency_multiplier || 1;
      score *= mult;
      factors.push({ type: 'urgency', multiplier: mult });
    }

    // Números no título
    if (/\d+/.test(title)) {
      const mult = triggers.numbers_multiplier || 1;
      score *= mult;
      factors.push({ type: 'numbers', multiplier: mult });
    }

    // Polêmica
    if (/polêmic|escândalo|choca|revela/i.test(title)) {
      const mult = triggers.controversy_multiplier || 1;
      score *= mult;
      factors.push({ type: 'controversy', multiplier: mult });
    }

    // 3. KEYWORDS DE ALTA AFINIDADE (20% do peso)
    const highCtrKeywords = triggers.high_ctr_keywords || [];
    const titleWords = title.split(/\s+/);
    const matchedKeywords = titleWords.filter(w => highCtrKeywords.includes(w));
    
    if (matchedKeywords.length > 0) {
      score += matchedKeywords.length * 0.1;
      factors.push({ type: 'keywords', matched: matchedKeywords });
    }

    // 4. PREFERÊNCIA DE CATEGORIA (15% do peso)
    const categoryPref = await query(`
      SELECT preference_score FROM user_category_preferences
      WHERE user_id = $1 AND category_id = $2
    `, [userId, article.category_id]);

    if (categoryPref.rows[0]) {
      score += (categoryPref.rows[0].preference_score - 0.5) * 0.15;
      factors.push({ type: 'category', score: categoryPref.rows[0].preference_score });
    }

    // Normaliza score entre 0 e 1
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      factors,
      predicted_ctr: score * 100
    };
  },

  /**
   * Rankeia artigos por probabilidade de clique
   */
  async rankArticlesByPrediction(userId, articles) {
    const predictions = await Promise.all(
      articles.map(async (article) => ({
        ...article,
        prediction: await this.predictClickProbability(userId, article)
      }))
    );

    // Ordena por score de predição (com alguma aleatoriedade para diversidade)
    return predictions.sort((a, b) => {
      const scoreA = a.prediction.score + (Math.random() * 0.1 - 0.05);
      const scoreB = b.prediction.score + (Math.random() * 0.1 - 0.05);
      return scoreB - scoreA;
    });
  },

  /**
   * Seleciona melhor horário para enviar notificação
   */
  async predictBestPushTime(userId, article) {
    const profile = await UserProfile.findByUserId(userId);
    
    if (!profile || !profile.temporal_patterns?.peak_hours) {
      // Default: 8h, 12h ou 19h
      const hour = new Date().getHours();
      if (hour < 8) return { hour: 8, reason: 'default_morning' };
      if (hour < 12) return { hour: 12, reason: 'default_lunch' };
      return { hour: 19, reason: 'default_evening' };
    }

    const peakHours = profile.temporal_patterns.peak_hours;
    const currentHour = new Date().getHours();

    // Encontra próximo horário de pico
    const nextPeakHour = peakHours.find(h => h > currentHour) || peakHours[0];

    return {
      hour: nextPeakHour,
      reason: 'user_peak_hour',
      confidence: 0.8
    };
  }
};

export default PredictionService;
```

---

## Passo 6: Gatilhos Emocionais

### 6.1 Serviço de Otimização de Títulos

```javascript
// src/services/titleOptimizationService.js

const TitleOptimizationService = {
  /**
   * Analisa características de um título
   */
  analyzeTitle(title) {
    return {
      hasUrgency: /urgente|agora|última hora|breaking|ao vivo|acaba de/i.test(title),
      hasNumbers: /\d+/.test(title),
      hasQuestion: /\?$/.test(title),
      hasControversy: /polêmic|escândalo|choca|impressiona|revela|bomba|denúncia|surpreende/i.test(title),
      hasCelebrity: /famoso|celebridade|estrela|ator|atriz|cantor|jogador/i.test(title),
      hasExclusivity: /exclusivo|inédito|revelado|primeiro|único/i.test(title),
      hasListFormat: /^\d+\s|top\s\d+|\d+\scoisas|\d+\sdicas/i.test(title),
      wordCount: title.split(/\s+/).length,
      charCount: title.length
    };
  },

  /**
   * Calcula "clickbait score" de um título
   * Quanto maior, mais provável de gerar clique
   */
  calculateClickbaitScore(title) {
    const analysis = this.analyzeTitle(title);
    let score = 0;

    if (analysis.hasUrgency) score += 2;
    if (analysis.hasNumbers) score += 1.5;
    if (analysis.hasQuestion) score += 1;
    if (analysis.hasControversy) score += 2;
    if (analysis.hasCelebrity) score += 1.5;
    if (analysis.hasExclusivity) score += 1.5;
    if (analysis.hasListFormat) score += 1;

    // Títulos muito curtos ou muito longos perdem pontos
    if (analysis.wordCount < 5) score -= 1;
    if (analysis.wordCount > 20) score -= 1;

    return {
      score,
      analysis,
      recommendation: score < 2 ? 'low_engagement_risk' : score < 4 ? 'medium' : 'high_engagement'
    };
  },

  /**
   * Sugere melhorias para um título (para uso interno/editorial)
   */
  suggestImprovements(title) {
    const analysis = this.analyzeTitle(title);
    const suggestions = [];

    if (!analysis.hasUrgency && !analysis.hasNumbers) {
      suggestions.push('Considere adicionar senso de urgência ou números');
    }

    if (analysis.wordCount > 15) {
      suggestions.push('Título muito longo - considere encurtar');
    }

    if (!analysis.hasQuestion && !analysis.hasExclusivity) {
      suggestions.push('Considere formato de pergunta ou exclusividade');
    }

    return suggestions;
  }
};

export default TitleOptimizationService;
```

---

## Passo 7: A/B Testing

### 7.1 Serviço de Experimentos

```javascript
// src/services/experimentService.js

import { query } from '../config/database.js';

const ExperimentService = {
  /**
   * Atribui usuário a um experimento
   */
  async assignUserToExperiment(userId, experimentName) {
    // Busca experimento
    const experiment = await query(
      'SELECT * FROM experiments WHERE name = $1 AND status = $2',
      [experimentName, 'running']
    );

    if (!experiment.rows[0]) return null;

    // Verifica se já está atribuído
    const existing = await query(
      'SELECT variant FROM user_experiments WHERE user_id = $1 AND experiment_id = $2',
      [userId, experiment.rows[0].id]
    );

    if (existing.rows[0]) {
      return existing.rows[0].variant;
    }

    // Atribui aleatoriamente
    const variants = Object.keys(experiment.rows[0].variants);
    const variant = variants[Math.floor(Math.random() * variants.length)];

    await query(
      'INSERT INTO user_experiments (user_id, experiment_id, variant) VALUES ($1, $2, $3)',
      [userId, experiment.rows[0].id, variant]
    );

    return variant;
  },

  /**
   * Retorna variante do usuário em um experimento
   */
  async getUserVariant(userId, experimentName) {
    const result = await query(`
      SELECT ue.variant
      FROM user_experiments ue
      JOIN experiments e ON ue.experiment_id = e.id
      WHERE ue.user_id = $1 AND e.name = $2
    `, [userId, experimentName]);

    return result.rows[0]?.variant || null;
  },

  /**
   * Registra evento do experimento
   */
  async trackExperimentEvent(userId, experimentName, eventType, eventValue = null) {
    const variant = await this.getUserVariant(userId, experimentName);
    if (!variant) return;

    const experiment = await query(
      'SELECT id FROM experiments WHERE name = $1',
      [experimentName]
    );

    await query(`
      INSERT INTO experiment_events (experiment_id, user_id, variant, event_type, event_value)
      VALUES ($1, $2, $3, $4, $5)
    `, [experiment.rows[0].id, userId, variant, eventType, eventValue]);
  },

  /**
   * Calcula resultados do experimento
   */
  async getExperimentResults(experimentName) {
    const result = await query(`
      SELECT 
        variant,
        event_type,
        COUNT(*) as count,
        AVG(event_value) as avg_value
      FROM experiment_events ee
      JOIN experiments e ON ee.experiment_id = e.id
      WHERE e.name = $1
      GROUP BY variant, event_type
      ORDER BY variant, event_type
    `, [experimentName]);

    // Agrupa por variante
    const byVariant = {};
    for (const row of result.rows) {
      if (!byVariant[row.variant]) {
        byVariant[row.variant] = {};
      }
      byVariant[row.variant][row.event_type] = {
        count: parseInt(row.count),
        avg_value: parseFloat(row.avg_value) || null
      };
    }

    return byVariant;
  },

  /**
   * Cria novo experimento
   */
  async createExperiment(name, description, variants) {
    const result = await query(`
      INSERT INTO experiments (name, description, variants)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [name, description, JSON.stringify(variants)]);

    return result.rows[0];
  },

  /**
   * Inicia experimento
   */
  async startExperiment(experimentName) {
    await query(`
      UPDATE experiments 
      SET status = 'running', started_at = NOW()
      WHERE name = $1
    `, [experimentName]);
  },

  /**
   * Para experimento
   */
  async stopExperiment(experimentName) {
    await query(`
      UPDATE experiments 
      SET status = 'completed', ended_at = NOW()
      WHERE name = $1
    `, [experimentName]);
  }
};

export default ExperimentService;
```

### 7.2 Uso no Feed

```javascript
// No engagementFeedService.js

import ExperimentService from './experimentService.js';

async getAddictiveFeed(userId, options) {
  // Verifica se usuário está em experimento de feed
  const feedVariant = await ExperimentService.getUserVariant(userId, 'feed_algorithm_v2');

  if (feedVariant === 'treatment') {
    // Nova versão do algoritmo
    return this.getExperimentalFeed(userId, options);
  }

  // Versão de controle (padrão)
  return this.getStandardFeed(userId, options);
}

// Quando usuário interage, registra no experimento
async trackFeedInteraction(userId, articleId, interactionType) {
  await ExperimentService.trackExperimentEvent(
    userId, 
    'feed_algorithm_v2', 
    interactionType,
    interactionType === 'view' ? duration : null
  );
}
```

---

## ✅ Checklist de Implementação

### Backend - Schema de Dados
- [ ] Executar migração 008_learning_system.sql
- [ ] Verificar índices criados
- [ ] Testar queries básicas

### Backend - Processamento de Sinais
- [ ] Criar LearningService
- [ ] Implementar processInteractionBatch
- [ ] Implementar analyzeClickedTitle
- [ ] Implementar updateKeywordAffinity
- [ ] Implementar recálculo de perfil

### Backend - Perfil do Usuário
- [ ] Criar UserProfile model
- [ ] Implementar getSimplifiedProfile
- [ ] Implementar getHighAffinityKeywords

### Backend - Detecção de Padrões
- [ ] Criar PatternDetectionService
- [ ] Implementar detectUserPattern
- [ ] Implementar detectEngagementTrend
- [ ] Implementar detectEmergingInterests
- [ ] Implementar detectBestNotificationTime

### Backend - Predição
- [ ] Criar PredictionService
- [ ] Implementar predictClickProbability
- [ ] Implementar rankArticlesByPrediction
- [ ] Implementar predictBestPushTime

### Backend - Gatilhos
- [ ] Criar TitleOptimizationService
- [ ] Implementar analyzeTitle
- [ ] Implementar calculateClickbaitScore

### Backend - A/B Testing
- [ ] Criar ExperimentService
- [ ] Implementar assignUserToExperiment
- [ ] Implementar trackExperimentEvent
- [ ] Implementar getExperimentResults
- [ ] Integrar com feed

---

**Próximo:** Ver `LEARNING_FRONTEND.md` para implementação de tracking no app.

