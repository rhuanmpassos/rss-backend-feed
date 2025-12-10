-- Migration 003: Adicionar category_id em articles
-- Migra de category (string) para category_id (FK)

-- 1. Adicionar coluna category_id
ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);

-- 2. Criar categorias a partir dos valores únicos de category (que ainda não existem)
INSERT INTO categories (name, slug)
SELECT DISTINCT 
  category as name,
  LOWER(REGEXP_REPLACE(REGEXP_REPLACE(category, '[^a-zA-Z0-9À-ÿ\s]+', '', 'g'), '\s+', '-', 'g')) as slug
FROM articles
WHERE category IS NOT NULL
  AND category NOT IN (SELECT name FROM categories)
ON CONFLICT (slug) DO NOTHING;

-- 3. Migrar dados: atualizar category_id baseado em category (string)
UPDATE articles a
SET category_id = c.id
FROM categories c
WHERE a.category = c.name
  AND a.category_id IS NULL;

-- 4. Criar índice para category_id
CREATE INDEX IF NOT EXISTS idx_articles_category_id ON articles(category_id);

-- 5. Verificar migração (deve retornar 0 se tudo migrou corretamente)
-- SELECT COUNT(*) as artigos_sem_category_id FROM articles WHERE category IS NOT NULL AND category_id IS NULL;

-- 6. Remover coluna category antiga (EXECUTAR APENAS APÓS VALIDAR!)
-- ATENÇÃO: Descomente a linha abaixo APENAS após validar que a migração funcionou
-- ALTER TABLE articles DROP COLUMN category;

-- Mostrar resultado da migração
SELECT 
  'Artigos com category_id' as status, 
  COUNT(*) as total 
FROM articles 
WHERE category_id IS NOT NULL
UNION ALL
SELECT 
  'Artigos pendentes (category sem category_id)' as status, 
  COUNT(*) as total 
FROM articles 
WHERE category IS NOT NULL AND category_id IS NULL
UNION ALL
SELECT 
  'Total de categorias' as status, 
  COUNT(*) as total 
FROM categories;

