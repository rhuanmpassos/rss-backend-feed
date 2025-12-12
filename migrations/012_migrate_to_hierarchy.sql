-- Migration 012: Migrar categorias existentes para hierarquia IPTC
-- Mapeia categorias antigas para a nova estrutura hierárquica

-- ============================================
-- 1. MAPEAMENTO DE CATEGORIAS ANTIGAS → IPTC
-- ============================================

-- Criar tabela temporária de mapeamento
CREATE TEMP TABLE category_mapping (
  old_slug VARCHAR(100),
  new_level1_slug VARCHAR(100),
  new_level2_slug VARCHAR(100),
  new_level3_slug VARCHAR(100)
);

-- Inserir mapeamentos
INSERT INTO category_mapping (old_slug, new_level1_slug, new_level2_slug, new_level3_slug) VALUES
-- Esportes específicos
('formula-1', 'esporte', 'automobilismo', 'formula-1'),
('futebol', 'esporte', 'futebol', NULL),
('esportes', 'esporte', NULL, NULL),
('basquete', 'esporte', 'basquete', NULL),
('tenis', 'esporte', 'tenis', NULL),
('mma', 'esporte', 'lutas', 'ufc-mma'),
('ufc', 'esporte', 'lutas', 'ufc-mma'),

-- Economia e Finanças
('economia', 'economia-negocios-financas', NULL, NULL),
('bitcoin', 'economia-negocios-financas', 'criptomoedas', 'bitcoin'),
('criptomoedas', 'economia-negocios-financas', 'criptomoedas', NULL),
('bolsa-de-valores', 'economia-negocios-financas', 'mercado-financeiro', NULL),
('negocios', 'economia-negocios-financas', 'empresas', NULL),

-- Política
('politica', 'politica', NULL, NULL),
('governo', 'politica', 'governo-federal', NULL),
('eleicoes', 'politica', 'eleicoes', NULL),

-- Tecnologia
('tecnologia', 'ciencia-tecnologia', NULL, NULL),
('inteligencia-artificial', 'ciencia-tecnologia', 'inteligencia-artificial', NULL),
('ia', 'ciencia-tecnologia', 'inteligencia-artificial', NULL),
('games', 'artes-cultura-entretenimento', 'games', NULL),
('apple', 'ciencia-tecnologia', 'smartphones', 'apple-iphone'),
('android', 'ciencia-tecnologia', 'smartphones', 'android'),

-- Crime e Segurança
('seguranca', 'crime-lei-justica', NULL, NULL),
('crime', 'crime-lei-justica', 'crimes-violentos', NULL),
('policia', 'crime-lei-justica', 'policia', NULL),

-- Saúde
('saude', 'saude', NULL, NULL),

-- Entretenimento
('entretenimento', 'artes-cultura-entretenimento', NULL, NULL),
('cinema', 'artes-cultura-entretenimento', 'cinema', NULL),
('musica', 'artes-cultura-entretenimento', 'musica', NULL),
('series', 'artes-cultura-entretenimento', 'televisao', NULL),
('k-pop', 'artes-cultura-entretenimento', 'k-pop', NULL),

-- Outros
('mundo', 'conflito-guerra-paz', NULL, NULL),
('internacional', 'conflito-guerra-paz', NULL, NULL),
('meio-ambiente', 'meio-ambiente', NULL, NULL),
('clima', 'clima', NULL, NULL),
('educacao', 'educacao', NULL, NULL),
('ciencia', 'ciencia-tecnologia', NULL, NULL),
('religiao', 'religiao', NULL, NULL),
('automoveis', 'estilo-vida-lazer', NULL, NULL),
('brasil', 'sociedade', NULL, NULL),
('diversos', 'interesse-humano', NULL, NULL);

-- ============================================
-- 2. ATUALIZAR CATEGORIAS EXISTENTES
-- ============================================

-- Para cada categoria antiga que já existe, atualizar para apontar para o pai correto
-- Primeiro, vamos marcar as categorias antigas que serão migradas

-- Atualizar categorias que já existem mas não têm parent_id
UPDATE categories c
SET 
  parent_id = (
    SELECT parent.id 
    FROM categories parent 
    WHERE parent.slug = cm.new_level2_slug
  ),
  level = 3,
  path = cm.new_level1_slug || '/' || COALESCE(cm.new_level2_slug, '') || '/' || c.slug
FROM category_mapping cm
WHERE c.slug = cm.old_slug
  AND cm.new_level3_slug IS NOT NULL
  AND c.parent_id IS NULL;

-- Atualizar categorias de nível 2 (sem nível 3)
UPDATE categories c
SET 
  parent_id = (
    SELECT parent.id 
    FROM categories parent 
    WHERE parent.slug = cm.new_level1_slug
  ),
  level = 2,
  path = cm.new_level1_slug || '/' || c.slug
FROM category_mapping cm
WHERE c.slug = cm.old_slug
  AND cm.new_level2_slug IS NULL
  AND cm.new_level3_slug IS NULL
  AND c.parent_id IS NULL;

-- ============================================
-- 3. MIGRAR ARTIGOS PARA article_categories
-- ============================================

-- Inserir na tabela article_categories (N:N)
-- Artigos que têm category_id válido
INSERT INTO article_categories (article_id, category_id, confidence, is_primary, level)
SELECT 
  a.id as article_id,
  a.category_id,
  COALESCE(a.category_confidence, 0.5) as confidence,
  true as is_primary,
  COALESCE(c.level, 1) as level
FROM articles a
JOIN categories c ON a.category_id = c.id
WHERE a.category_id IS NOT NULL
ON CONFLICT (article_id, category_id) DO NOTHING;

-- Se artigo tem categoria de nível 3, também adicionar ancestrais (nível 2 e 1)
INSERT INTO article_categories (article_id, category_id, confidence, is_primary, level)
SELECT DISTINCT
  ac.article_id,
  c.parent_id as category_id,
  ac.confidence * 0.9 as confidence, -- Confiança um pouco menor para ancestrais
  false as is_primary,
  c.level - 1 as level
FROM article_categories ac
JOIN categories c ON ac.category_id = c.id
WHERE c.parent_id IS NOT NULL
  AND c.level >= 2
ON CONFLICT (article_id, category_id) DO NOTHING;

-- Adicionar nível 1 também
INSERT INTO article_categories (article_id, category_id, confidence, is_primary, level)
SELECT DISTINCT
  ac.article_id,
  c.parent_id as category_id,
  ac.confidence * 0.8 as confidence,
  false as is_primary,
  1 as level
FROM article_categories ac
JOIN categories c ON ac.category_id = c.id
WHERE c.parent_id IS NOT NULL
  AND c.level = 2
ON CONFLICT (article_id, category_id) DO NOTHING;

-- ============================================
-- 4. MIGRAR PREFERÊNCIAS DE USUÁRIO
-- ============================================

-- Copiar preferências existentes para a nova tabela hierárquica
INSERT INTO user_hierarchical_preferences (
  user_id, 
  category_id, 
  preference_score, 
  interaction_count,
  click_count,
  created_at,
  updated_at
)
SELECT 
  ucp.user_id,
  ucp.category_id,
  ucp.preference_score,
  0 as interaction_count, -- Será recalculado
  0 as click_count, -- Será recalculado
  ucp.created_at,
  ucp.updated_at
FROM user_category_preferences ucp
WHERE ucp.category_id IS NOT NULL
ON CONFLICT (user_id, category_id) DO UPDATE SET
  preference_score = EXCLUDED.preference_score,
  updated_at = NOW();

-- Adicionar preferências para categorias pai (herança)
INSERT INTO user_hierarchical_preferences (user_id, category_id, preference_score)
SELECT DISTINCT
  uhp.user_id,
  c.parent_id as category_id,
  AVG(uhp.preference_score) as preference_score
FROM user_hierarchical_preferences uhp
JOIN categories c ON uhp.category_id = c.id
WHERE c.parent_id IS NOT NULL
GROUP BY uhp.user_id, c.parent_id
ON CONFLICT (user_id, category_id) DO UPDATE SET
  preference_score = GREATEST(user_hierarchical_preferences.preference_score, EXCLUDED.preference_score);

-- ============================================
-- 5. VERIFICAÇÃO E LIMPEZA
-- ============================================

-- Verificar migração
-- SELECT 'articles_migrated' as metric, COUNT(*) FROM article_categories;
-- SELECT 'preferences_migrated' as metric, COUNT(*) FROM user_hierarchical_preferences;
-- SELECT 'categories_by_level' as metric, level, COUNT(*) FROM categories GROUP BY level;

-- Limpar tabela temporária
DROP TABLE IF EXISTS category_mapping;

-- ============================================
-- 6. ADICIONAR COLUNAS DE CACHE PARA PERFORMANCE
-- ============================================

-- Adicionar coluna para cache do caminho hierárquico em articles
ALTER TABLE articles ADD COLUMN IF NOT EXISTS category_path TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS category_level1_id INTEGER REFERENCES categories(id);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS category_level2_id INTEGER REFERENCES categories(id);

-- Índices para as novas colunas
CREATE INDEX IF NOT EXISTS idx_articles_category_level1 ON articles(category_level1_id);
CREATE INDEX IF NOT EXISTS idx_articles_category_level2 ON articles(category_level2_id);

-- Atualizar cache de categoria para artigos existentes
UPDATE articles a
SET 
  category_path = c.path,
  category_level1_id = (
    SELECT id FROM categories 
    WHERE level = 1 AND c.path LIKE slug || '%'
    LIMIT 1
  )
FROM categories c
WHERE a.category_id = c.id
  AND a.category_path IS NULL;
