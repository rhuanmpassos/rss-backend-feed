-- Migration: Add Bookmarks Support
-- Adiciona campo para marcar artigos salvos pelo usuário

-- Adiciona coluna bookmarked à tabela articles
ALTER TABLE articles ADD COLUMN IF NOT EXISTS bookmarked BOOLEAN DEFAULT false;

-- Cria índice para consultas rápidas de bookmarks
CREATE INDEX IF NOT EXISTS idx_articles_bookmarked ON articles(bookmarked) WHERE bookmarked = true;

-- Comentário informativo
COMMENT ON COLUMN articles.bookmarked IS 'Marca se o artigo foi salvo pelo usuário (não será deletado na limpeza automática)';

SELECT 'Migration de bookmarks concluída!' as message;
