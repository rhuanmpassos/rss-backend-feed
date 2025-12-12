-- Migration: Adicionar campo password_hash para autenticação JWT
-- Data: 2025-12-11

-- Adiciona coluna password_hash na tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Índice para buscas por email (se não existir)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Comentário
COMMENT ON COLUMN users.password_hash IS 'Hash bcrypt da senha do usuário';




