-- Migration 005: Adicionar suporte a embeddings (pgvector)
-- Requer extensão pgvector instalada no PostgreSQL

-- 1. Habilita extensão pgvector (se disponível)
-- NOTA: Em serviços cloud (Render, Supabase, Neon), pgvector já está instalado
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Adiciona coluna embedding na tabela articles
-- Vetor de 384 dimensões (paraphrase-multilingual-MiniLM-L12-v2)
ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS embedding vector(384);

-- 3. Cria índice para busca vetorial eficiente (IVFFlat)
-- NOTA: Só funciona depois de ter alguns artigos com embeddings
-- CREATE INDEX IF NOT EXISTS idx_articles_embedding 
-- ON articles USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);

-- 4. Tabela de similaridade entre artigos (cache para Collaborative Filtering)
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

-- 5. Verificar resultado
SELECT 
  'pgvector instalado' as status,
  EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as resultado
UNION ALL
SELECT 
  'Coluna embedding existe' as status,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'embedding') as resultado;

