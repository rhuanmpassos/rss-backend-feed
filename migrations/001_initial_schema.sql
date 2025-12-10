-- Migration: Initial Schema
-- Cria tabelas do sistema de feeds RSS

-- Tabela de sites
CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500) NOT NULL UNIQUE,
  category VARCHAR(100),
  scraping_method VARCHAR(50) DEFAULT 'auto',
  last_scraped_at TIMESTAMP,
  scraping_interval INTEGER DEFAULT 3600,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de artigos
CREATE TABLE IF NOT EXISTS articles (
  id SERIAL PRIMARY KEY,
  site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url VARCHAR(1000) NOT NULL UNIQUE,
  summary TEXT,
  content TEXT,
  image_url VARCHAR(1000),
  author VARCHAR(255),
  published_at TIMESTAMP,
  scraped_at TIMESTAMP DEFAULT NOW(),
  category VARCHAR(100),
  category_confidence FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_articles_site_id ON articles(site_id);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);

-- Tabela de categorias
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de logs de scraping
CREATE TABLE IF NOT EXISTS scraping_logs (
  id SERIAL PRIMARY KEY,
  site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  articles_found INTEGER DEFAULT 0,
  error_message TEXT,
  scraping_duration INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraping_logs_site_id ON scraping_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_scraping_logs_created_at ON scraping_logs(created_at DESC);

-- Inserir categorias padrão
INSERT INTO categories (name, slug, description) VALUES
  ('Fórmula 1', 'formula-1', 'Notícias sobre Fórmula 1'),
  ('Futebol', 'futebol', 'Notícias sobre futebol'),
  ('Esportes', 'esportes', 'Notícias esportivas em geral'),
  ('Economia', 'economia', 'Notícias sobre economia'),
  ('Política', 'politica', 'Notícias políticas'),
  ('Tecnologia', 'tecnologia', 'Notícias de tecnologia'),
  ('Entretenimento', 'entretenimento', 'Notícias de entretenimento'),
  ('Negócios', 'negocios', 'Notícias de negócios'),
  ('Mundo', 'mundo', 'Notícias internacionais'),
  ('Brasil', 'brasil', 'Notícias nacionais')
ON CONFLICT (slug) DO NOTHING;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para sites
DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Ver estatísticas
SELECT 
  'Sites' as tabela, COUNT(*) as total FROM sites
UNION ALL
SELECT 
  'Articles' as tabela, COUNT(*) as total FROM articles
UNION ALL
SELECT 
  'Categories' as tabela, COUNT(*) as total FROM categories;
