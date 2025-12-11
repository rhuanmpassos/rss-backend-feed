-- Migration: 008_learning_system.sql
-- Sistema de Aprendizado do Usuário
-- Cria estruturas para rastrear comportamento e aprender preferências individuais
-- 
-- Features que habilita:
-- - Gatilhos emocionais personalizados (após 50+ cliques)
-- - Padrões temporais (após 2+ semanas de uso)
-- - Predição de clique (após 1000+ interações)
-- - Push inteligente (após 5+ sessões)

-- ============================================
-- 1. EXPANDIR USER_INTERACTIONS
-- ============================================

-- Adiciona campos extras para contexto comportamental
-- Usa DO block para continuar mesmo se não tiver permissão
DO $$
BEGIN
  -- Tenta adicionar colunas (pode falhar se não tiver permissão)
  BEGIN
    ALTER TABLE user_interactions 
    ADD COLUMN IF NOT EXISTS session_id UUID,
    ADD COLUMN IF NOT EXISTS scroll_velocity FLOAT,
    ADD COLUMN IF NOT EXISTS screen_position VARCHAR(20),
    ADD COLUMN IF NOT EXISTS viewport_time INTEGER,
    ADD COLUMN IF NOT EXISTS scroll_direction VARCHAR(10),
    ADD COLUMN IF NOT EXISTS day_of_week INTEGER,
    ADD COLUMN IF NOT EXISTS hour_of_day INTEGER,
    ADD COLUMN IF NOT EXISTS device_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS is_first_session BOOLEAN DEFAULT false;
    
    RAISE NOTICE 'Colunas adicionadas em user_interactions';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RAISE WARNING 'Não foi possível adicionar colunas em user_interactions: %. Adicione manualmente se necessário.', SQLERRM;
  END;
  
  -- Tenta criar índices (pode falhar se não tiver permissão)
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_interactions_session 
    ON user_interactions(session_id);
    
    CREATE INDEX IF NOT EXISTS idx_interactions_time_patterns 
    ON user_interactions(user_id, hour_of_day, day_of_week);
    
    CREATE INDEX IF NOT EXISTS idx_interactions_user_type 
    ON user_interactions(user_id, interaction_type, created_at DESC);
    
    RAISE NOTICE 'Índices criados em user_interactions';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RAISE WARNING 'Não foi possível criar índices em user_interactions: %. Crie manualmente se necessário.', SQLERRM;
  END;
END $$;


-- ============================================
-- 2. TABELA USER_PROFILES
-- ============================================
-- Perfil calculado do usuário (atualizado periodicamente)

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  
  -- Embedding do perfil (média dos artigos clicados)
  -- Requer extensão pgvector já instalada
  profile_embedding vector(384),
  
  -- Padrões temporais (JSON)
  -- Ex: {"peak_hours": [8, 12, 19], "peak_days": [1, 2, 3], "avg_session_duration": 420}
  temporal_patterns JSONB DEFAULT '{}',
  
  -- Preferências de conteúdo (JSON)
  -- Ex: {"preferred_length": "short", "preferred_sources": ["g1", "uol"], "avg_read_time": 45}
  content_preferences JSONB DEFAULT '{}',
  
  -- Gatilhos que funcionam para este usuário (JSON)
  -- Ex: {"urgency_multiplier": 1.5, "controversy_multiplier": 1.2, "high_ctr_keywords": ["exclusivo"]}
  engagement_triggers JSONB DEFAULT '{}',
  
  -- Estatísticas gerais
  total_sessions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_time_spent INTEGER DEFAULT 0,
  avg_session_duration INTEGER DEFAULT 0,
  
  -- Controle de features (ativam quando thresholds são atingidos)
  triggers_enabled BOOLEAN DEFAULT false,
  patterns_enabled BOOLEAN DEFAULT false,
  prediction_enabled BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT false,
  
  -- Timestamps
  first_interaction_at TIMESTAMP,
  last_interaction_at TIMESTAMP,
  last_calculated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);


-- ============================================
-- 3. TABELA USER_SESSIONS
-- ============================================
-- Rastreia sessões individuais para análise de comportamento

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  
  -- Timestamps
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration INTEGER,
  
  -- Métricas da sessão
  articles_viewed INTEGER DEFAULT 0,
  articles_clicked INTEGER DEFAULT 0,
  scroll_depth INTEGER DEFAULT 0,
  refresh_count INTEGER DEFAULT 0,
  
  -- Contexto
  device_type VARCHAR(20),
  entry_source VARCHAR(50),
  
  -- Score calculado ao fim
  engagement_score FLOAT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user 
ON user_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_duration 
ON user_sessions(user_id, duration) 
WHERE duration IS NOT NULL;


-- ============================================
-- 4. TABELA USER_KEYWORD_AFFINITY
-- ============================================
-- Keywords que geram cliques para cada usuário

CREATE TABLE IF NOT EXISTS user_keyword_affinity (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  keyword VARCHAR(100) NOT NULL,
  
  -- Contadores
  click_count INTEGER DEFAULT 0,
  impression_count INTEGER DEFAULT 0,
  
  -- CTR calculado automaticamente
  ctr FLOAT GENERATED ALWAYS AS (
    CASE WHEN impression_count > 0 
    THEN click_count::float / impression_count 
    ELSE 0 END
  ) STORED,
  
  last_clicked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_keyword_affinity_user_ctr 
ON user_keyword_affinity(user_id, ctr DESC);

CREATE INDEX IF NOT EXISTS idx_keyword_affinity_clicks 
ON user_keyword_affinity(user_id, click_count DESC) 
WHERE click_count > 0;


-- ============================================
-- 5. TABELA CLICKED_TITLES_ANALYSIS
-- ============================================
-- Análise de características dos títulos clicados

CREATE TABLE IF NOT EXISTS clicked_titles_analysis (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  
  -- Análise automática do título
  has_urgency BOOLEAN DEFAULT false,
  has_numbers BOOLEAN DEFAULT false,
  has_question BOOLEAN DEFAULT false,
  has_controversy BOOLEAN DEFAULT false,
  has_exclusivity BOOLEAN DEFAULT false,
  word_count INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clicked_titles_user 
ON clicked_titles_analysis(user_id, created_at DESC);


-- ============================================
-- 6. TABELA ARTICLES - ADICIONAR FLAG BREAKING
-- ============================================

-- Tenta adicionar coluna (pode falhar se não tiver permissão)
DO $$
BEGIN
  BEGIN
    ALTER TABLE articles 
    ADD COLUMN IF NOT EXISTS is_breaking BOOLEAN DEFAULT false;
    
    CREATE INDEX IF NOT EXISTS idx_articles_breaking 
    ON articles(is_breaking, published_at DESC) 
    WHERE is_breaking = true;
    
    RAISE NOTICE 'Coluna is_breaking adicionada em articles';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RAISE WARNING 'Não foi possível adicionar is_breaking em articles: %. Adicione manualmente se necessário.', SQLERRM;
  END;
END $$;


-- ============================================
-- 7. CONFIGURAÇÃO DE THRESHOLDS
-- ============================================
-- Tabela para configurar thresholds dinamicamente (opcional)

CREATE TABLE IF NOT EXISTS engagement_config (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insere configurações padrão
INSERT INTO engagement_config (key, value, description) VALUES
  ('thresholds', '{
    "MIN_CLICKS_FOR_TRIGGERS": 50,
    "MIN_DAYS_FOR_TEMPORAL": 14,
    "MIN_INTERACTIONS_FOR_PREDICTION": 1000,
    "MIN_SESSIONS_FOR_PUSH": 5,
    "MIN_CLICKS_FOR_KEYWORDS": 20
  }', 'Thresholds para ativação de features por usuário'),
  
  ('prediction_weights', '{
    "SIMILARITY_WEIGHT": 0.40,
    "TRIGGERS_WEIGHT": 0.25,
    "KEYWORDS_WEIGHT": 0.20,
    "CATEGORY_WEIGHT": 0.15
  }', 'Pesos do algoritmo de predição de clique'),
  
  ('feed_config', '{
    "WILDCARD_PERCENTAGE": 0.12,
    "BREAKING_TOP_POSITIONS": 2,
    "SHUFFLE_START": 5,
    "SHUFFLE_END": 20
  }', 'Configuração do feed de engajamento')
ON CONFLICT (key) DO NOTHING;


-- ============================================
-- 8. FUNÇÃO PARA ATUALIZAR THRESHOLDS
-- ============================================

CREATE OR REPLACE FUNCTION check_and_update_user_thresholds(p_user_id INTEGER)
RETURNS void AS $$
DECLARE
  v_total_clicks INTEGER;
  v_first_interaction TIMESTAMP;
  v_total_sessions INTEGER;
  v_total_interactions INTEGER;
  v_days_active INTEGER;
  v_thresholds JSONB;
BEGIN
  -- Busca thresholds da config
  SELECT value INTO v_thresholds 
  FROM engagement_config 
  WHERE key = 'thresholds';
  
  -- Calcula métricas do usuário
  SELECT 
    COUNT(*) FILTER (WHERE interaction_type = 'click'),
    MIN(created_at),
    COUNT(*)
  INTO v_total_clicks, v_first_interaction, v_total_interactions
  FROM user_interactions 
  WHERE user_id = p_user_id;
  
  SELECT COUNT(*) INTO v_total_sessions
  FROM user_sessions 
  WHERE user_id = p_user_id;
  
  -- Calcula dias ativos
  IF v_first_interaction IS NOT NULL THEN
    v_days_active := EXTRACT(DAY FROM (NOW() - v_first_interaction));
  ELSE
    v_days_active := 0;
  END IF;
  
  -- Atualiza flags no perfil
  INSERT INTO user_profiles (user_id, total_clicks, total_sessions, first_interaction_at)
  VALUES (p_user_id, v_total_clicks, v_total_sessions, v_first_interaction)
  ON CONFLICT (user_id) DO UPDATE SET
    total_clicks = v_total_clicks,
    total_sessions = v_total_sessions,
    first_interaction_at = COALESCE(user_profiles.first_interaction_at, v_first_interaction),
    last_interaction_at = NOW(),
    
    -- Atualiza flags baseado nos thresholds
    triggers_enabled = (v_total_clicks >= (v_thresholds->>'MIN_CLICKS_FOR_TRIGGERS')::int),
    patterns_enabled = (v_days_active >= (v_thresholds->>'MIN_DAYS_FOR_TEMPORAL')::int),
    prediction_enabled = (v_total_interactions >= (v_thresholds->>'MIN_INTERACTIONS_FOR_PREDICTION')::int),
    push_enabled = (v_total_sessions >= (v_thresholds->>'MIN_SESSIONS_FOR_PUSH')::int);
    
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 9. TRIGGER PARA ATUALIZAR STATS
-- ============================================

CREATE OR REPLACE FUNCTION update_user_profile_on_interaction()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualiza last_interaction_at
  INSERT INTO user_profiles (user_id, last_interaction_at)
  VALUES (NEW.user_id, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    last_interaction_at = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria trigger (se não existir)
DROP TRIGGER IF EXISTS trg_update_profile_on_interaction ON user_interactions;
CREATE TRIGGER trg_update_profile_on_interaction
AFTER INSERT ON user_interactions
FOR EACH ROW
EXECUTE FUNCTION update_user_profile_on_interaction();


-- ============================================
-- 10. VIEWS ÚTEIS
-- ============================================

-- View: Usuários com features habilitadas
CREATE OR REPLACE VIEW v_users_feature_status AS
SELECT 
  u.id as user_id,
  u.email,
  up.total_clicks,
  up.total_sessions,
  up.triggers_enabled,
  up.patterns_enabled,
  up.prediction_enabled,
  up.push_enabled,
  up.first_interaction_at,
  up.last_interaction_at,
  EXTRACT(DAY FROM (NOW() - up.first_interaction_at)) as days_active
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id;


-- View: Top keywords por usuário
CREATE OR REPLACE VIEW v_user_top_keywords AS
SELECT 
  user_id,
  keyword,
  click_count,
  impression_count,
  ctr,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ctr DESC) as rank
FROM user_keyword_affinity
WHERE click_count >= 2;


-- ============================================
-- DONE
-- ============================================

COMMENT ON TABLE user_profiles IS 'Perfil calculado de cada usuário para personalização';
COMMENT ON TABLE user_sessions IS 'Sessões individuais para análise de comportamento';
COMMENT ON TABLE user_keyword_affinity IS 'Keywords que geram cliques por usuário';
COMMENT ON TABLE clicked_titles_analysis IS 'Análise de características dos títulos clicados';
COMMENT ON TABLE engagement_config IS 'Configurações do sistema de engajamento';

