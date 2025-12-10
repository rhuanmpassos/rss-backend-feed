-- Migration 004: Criar tabelas de usuários e interações
-- Estrutura básica para sistema de recomendação

-- Tabela users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela user_category_preferences
-- Armazena preferências de categorias do usuário (0.0 a 1.0)
CREATE TABLE IF NOT EXISTS user_category_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  preference_score FLOAT DEFAULT 0.5 CHECK (preference_score >= 0 AND preference_score <= 1),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, category_id)
);

-- Tabela user_interactions
-- Registra interações para Implicit Feedback (recomendação futura)
CREATE TABLE IF NOT EXISTS user_interactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN ('click', 'view', 'scroll_stop', 'impression')),
  duration INTEGER,              -- tempo em ms (para 'view')
  position INTEGER,              -- posição no feed quando viu
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_category_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_category_id ON user_category_preferences(category_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_score ON user_category_preferences(preference_score DESC);

CREATE INDEX IF NOT EXISTS idx_user_interactions_user_id ON user_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_article_id ON user_interactions(article_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_article ON user_interactions(user_id, article_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_type ON user_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_user_interactions_created_at ON user_interactions(created_at DESC);

-- Trigger para atualizar updated_at em user_category_preferences
DROP TRIGGER IF EXISTS update_user_category_preferences_updated_at ON user_category_preferences;
CREATE TRIGGER update_user_category_preferences_updated_at
  BEFORE UPDATE ON user_category_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Mostrar resultado
SELECT 
  'Users' as tabela, COUNT(*) as total FROM users
UNION ALL
SELECT 
  'User Category Preferences' as tabela, COUNT(*) as total FROM user_category_preferences
UNION ALL
SELECT 
  'User Interactions' as tabela, COUNT(*) as total FROM user_interactions;

