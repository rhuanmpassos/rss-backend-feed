-- Migration: 008b_add_columns_manual.sql
-- Script para adicionar colunas extras manualmente
-- Execute este script com um usuário que tenha permissão de OWNER
-- 
-- NOTA: Este script é opcional. O sistema funciona sem essas colunas,
-- mas elas melhoram a qualidade do aprendizado.

-- ============================================
-- 1. EXPANDIR USER_INTERACTIONS
-- ============================================

-- Adiciona campos extras para contexto comportamental
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

-- Índices para queries de aprendizado
CREATE INDEX IF NOT EXISTS idx_interactions_session 
ON user_interactions(session_id);

CREATE INDEX IF NOT EXISTS idx_interactions_time_patterns 
ON user_interactions(user_id, hour_of_day, day_of_week);

CREATE INDEX IF NOT EXISTS idx_interactions_user_type 
ON user_interactions(user_id, interaction_type, created_at DESC);

-- ============================================
-- 2. ADICIONAR FLAG BREAKING EM ARTICLES
-- ============================================

ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS is_breaking BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_articles_breaking 
ON articles(is_breaking, published_at DESC) 
WHERE is_breaking = true;

-- ============================================
-- DONE
-- ============================================

SELECT 'Colunas extras adicionadas com sucesso!' as status;

