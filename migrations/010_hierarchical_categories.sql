-- Migration 010: Estrutura Hierárquica de Categorias (IPTC)
-- Adiciona suporte a taxonomia hierárquica baseada no padrão IPTC Media Topics

-- 1. Adicionar campos de hierarquia na tabela categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS iptc_code VARCHAR(20);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS path TEXT; -- Ex: "esporte/automobilismo/formula-1"
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Índices para queries hierárquicas eficientes
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_level ON categories(level);
CREATE INDEX IF NOT EXISTS idx_categories_path ON categories(path);
CREATE INDEX IF NOT EXISTS idx_categories_iptc_code ON categories(iptc_code);

-- 3. Tabela de relacionamento artigo-categoria (N:N) para multi-label
CREATE TABLE IF NOT EXISTS article_categories (
  article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  confidence FLOAT DEFAULT 0.5,
  is_primary BOOLEAN DEFAULT false,
  level INTEGER DEFAULT 1, -- Em qual nível da hierarquia foi classificado
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (article_id, category_id)
);

-- 4. Índices para article_categories
CREATE INDEX IF NOT EXISTS idx_article_categories_article ON article_categories(article_id);
CREATE INDEX IF NOT EXISTS idx_article_categories_category ON article_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_article_categories_primary ON article_categories(is_primary) WHERE is_primary = true;

-- 5. Tabela para preferências hierárquicas do usuário
-- Usuário pode ter scores diferentes por nível (ex: gosta de Esporte mas não de Futebol)
CREATE TABLE IF NOT EXISTS user_hierarchical_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  preference_score FLOAT DEFAULT 0.0, -- Score relativo (soma de todos = 1)
  interaction_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  impression_count INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, category_id)
);

-- 6. Índices para preferências hierárquicas
CREATE INDEX IF NOT EXISTS idx_user_hier_prefs_user ON user_hierarchical_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_hier_prefs_category ON user_hierarchical_preferences(category_id);
CREATE INDEX IF NOT EXISTS idx_user_hier_prefs_score ON user_hierarchical_preferences(preference_score DESC);

-- 7. View para buscar categoria com caminho completo
CREATE OR REPLACE VIEW categories_with_hierarchy AS
WITH RECURSIVE category_tree AS (
  -- Base: categorias raiz (sem parent)
  SELECT 
    id,
    name,
    slug,
    parent_id,
    level,
    iptc_code,
    path,
    name as full_path_name,
    ARRAY[id] as ancestors
  FROM categories
  WHERE parent_id IS NULL
  
  UNION ALL
  
  -- Recursão: categorias filhas
  SELECT 
    c.id,
    c.name,
    c.slug,
    c.parent_id,
    c.level,
    c.iptc_code,
    c.path,
    ct.full_path_name || ' > ' || c.name as full_path_name,
    ct.ancestors || c.id as ancestors
  FROM categories c
  JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree;

-- 8. Função para buscar todas as subcategorias de uma categoria
CREATE OR REPLACE FUNCTION get_subcategories(category_id_param INTEGER)
RETURNS TABLE(id INTEGER, name VARCHAR, slug VARCHAR, level INTEGER, path TEXT) AS $$
WITH RECURSIVE subcats AS (
  SELECT id, name, slug, level, path
  FROM categories
  WHERE parent_id = category_id_param
  
  UNION ALL
  
  SELECT c.id, c.name, c.slug, c.level, c.path
  FROM categories c
  JOIN subcats s ON c.parent_id = s.id
)
SELECT * FROM subcats;
$$ LANGUAGE SQL;

-- 9. Função para buscar ancestrais de uma categoria (caminho até a raiz)
CREATE OR REPLACE FUNCTION get_ancestors(category_id_param INTEGER)
RETURNS TABLE(id INTEGER, name VARCHAR, slug VARCHAR, level INTEGER) AS $$
WITH RECURSIVE ancestors AS (
  SELECT id, name, slug, level, parent_id
  FROM categories
  WHERE id = category_id_param
  
  UNION ALL
  
  SELECT c.id, c.name, c.slug, c.level, c.parent_id
  FROM categories c
  JOIN ancestors a ON c.id = a.parent_id
)
SELECT id, name, slug, level FROM ancestors ORDER BY level;
$$ LANGUAGE SQL;

-- 10. Comentários para documentação
COMMENT ON COLUMN categories.parent_id IS 'ID da categoria pai (NULL para categorias raiz)';
COMMENT ON COLUMN categories.level IS 'Nível na hierarquia: 1=raiz, 2=subcategoria, 3=específico';
COMMENT ON COLUMN categories.iptc_code IS 'Código IPTC Media Topics (ex: 15000000 para Esporte)';
COMMENT ON COLUMN categories.path IS 'Caminho slug completo (ex: esporte/automobilismo/formula-1)';
COMMENT ON TABLE article_categories IS 'Relacionamento N:N entre artigos e categorias (suporta multi-label)';
COMMENT ON TABLE user_hierarchical_preferences IS 'Preferências do usuário por categoria em qualquer nível da hierarquia';
