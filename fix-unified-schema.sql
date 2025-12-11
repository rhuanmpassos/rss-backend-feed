-- Fix do schema unificado para compatibilidade com Feed Extractor
-- Executa APÓS setup-unified-db-v2.sql

\c unified_feed

-- =============================================
-- 1. CORRIGIR TABELA user_interactions
-- =============================================

-- Drop a tabela genérica e recriar com schema correto para Feed Extractor
DROP TABLE IF EXISTS user_interactions CASCADE;

-- Recriar com FK direta para articles (como documentado)
CREATE TABLE user_interactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN ('click', 'view', 'scroll_stop', 'impression')),
  duration INTEGER,              -- tempo em ms (para 'view')
  position INTEGER,              -- posição no feed quando viu
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance (como documentado no RECOMMENDATION_ALGORITHM.md)
CREATE INDEX idx_user_interactions_user_id ON user_interactions(user_id);
CREATE INDEX idx_user_interactions_article_id ON user_interactions(article_id);
CREATE INDEX idx_user_interactions_user_article ON user_interactions(user_id, article_id);
CREATE INDEX idx_user_interactions_type ON user_interactions(interaction_type);
CREATE INDEX idx_user_interactions_created_at ON user_interactions(created_at DESC);

-- =============================================
-- 2. CORRIGIR TABELA user_category_preferences
-- =============================================

-- Adicionar colunas que estão faltando
ALTER TABLE user_category_preferences 
DROP COLUMN IF EXISTS weight;

ALTER TABLE user_category_preferences 
ADD COLUMN IF NOT EXISTS preference_score FLOAT DEFAULT 0.5 CHECK (preference_score >= 0 AND preference_score <= 1);

ALTER TABLE user_category_preferences 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_category_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_category_id ON user_category_preferences(category_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_score ON user_category_preferences(preference_score DESC);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_user_category_preferences_updated_at ON user_category_preferences;
CREATE TRIGGER update_user_category_preferences_updated_at
  BEFORE UPDATE ON user_category_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 3. ADICIONAR CAMPOS FALTANDO EM articles
-- =============================================

-- Adicionar bookmarked (preserva artigos na limpeza)
ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS bookmarked BOOLEAN DEFAULT false;

-- Índice para bookmarked
CREATE INDEX IF NOT EXISTS idx_articles_bookmarked ON articles(bookmarked) WHERE bookmarked = true;

-- =============================================
-- 4. CRIAR TABELA article_similarities
-- (Para Collaborative Filtering - Fase 4)
-- =============================================

CREATE TABLE IF NOT EXISTS article_similarities (
  article_id_1 INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  article_id_2 INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  similarity FLOAT NOT NULL,
  common_users INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (article_id_1, article_id_2)
);

-- Índices para article_similarities
CREATE INDEX IF NOT EXISTS idx_similarities_article1 ON article_similarities(article_id_1);
CREATE INDEX IF NOT EXISTS idx_similarities_article2 ON article_similarities(article_id_2);
CREATE INDEX IF NOT EXISTS idx_similarities_similarity ON article_similarities(similarity DESC);

-- =============================================
-- 5. ADICIONAR ÍNDICES FALTANDO
-- =============================================

-- Índice para URL de artigos (deduplicação)
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);

-- Índices para sites
CREATE INDEX IF NOT EXISTS idx_scraping_logs_site_id ON scraping_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_scraping_logs_created_at ON scraping_logs(created_at DESC);

-- =============================================
-- 6. CRIAR TABELA bookmarks UNIFICADA (YouTube + Feed)
-- Mantém compatibilidade com ambos os sistemas
-- =============================================

-- A tabela videos já tem bookmarked INTEGER, então mantemos
-- Para artigos, usamos articles.bookmarked BOOLEAN

-- Tabela adicional para bookmarks de usuários autenticados
CREATE TABLE IF NOT EXISTS user_bookmarks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL CHECK(item_type IN ('article', 'video')),
  item_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON user_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_item ON user_bookmarks(item_type, item_id);

-- =============================================
-- 7. VERIFICAR RESULTADO
-- =============================================

SELECT 'user_interactions' as tabela, COUNT(*) as colunas 
FROM information_schema.columns WHERE table_name = 'user_interactions'
UNION ALL
SELECT 'user_category_preferences', COUNT(*) 
FROM information_schema.columns WHERE table_name = 'user_category_preferences'
UNION ALL
SELECT 'articles', COUNT(*) 
FROM information_schema.columns WHERE table_name = 'articles'
UNION ALL
SELECT 'article_similarities', COUNT(*) 
FROM information_schema.columns WHERE table_name = 'article_similarities';

-- Listar todas as tabelas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

