-- Migration 011: Seed de Categorias IPTC Media Topics
-- Baseado no padrão internacional IPTC com adaptações para notícias brasileiras

-- Limpa categorias existentes (cuidado em produção!)
-- TRUNCATE categories CASCADE;

-- ============================================
-- NÍVEL 1: CATEGORIAS RAIZ IPTC (17 categorias)
-- ============================================

INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description) VALUES
-- 01 - Artes, Cultura e Entretenimento
('Artes, Cultura e Entretenimento', 'artes-cultura-entretenimento', 1, '01000000', 'artes-cultura-entretenimento', NULL, 'Música, cinema, TV, teatro, literatura, artes visuais'),

-- 02 - Crime, Lei e Justiça  
('Crime, Lei e Justiça', 'crime-lei-justica', 1, '02000000', 'crime-lei-justica', NULL, 'Crimes, polícia, tribunais, prisões, legislação'),

-- 03 - Desastres e Acidentes
('Desastres e Acidentes', 'desastres-acidentes', 1, '03000000', 'desastres-acidentes', NULL, 'Acidentes, desastres naturais, emergências'),

-- 04 - Economia, Negócios e Finanças
('Economia, Negócios e Finanças', 'economia-negocios-financas', 1, '04000000', 'economia-negocios-financas', NULL, 'Mercados, empresas, comércio, finanças pessoais'),

-- 05 - Educação
('Educação', 'educacao', 1, '05000000', 'educacao', NULL, 'Escolas, universidades, ensino, pesquisa acadêmica'),

-- 06 - Meio Ambiente
('Meio Ambiente', 'meio-ambiente', 1, '06000000', 'meio-ambiente', NULL, 'Natureza, conservação, poluição, mudanças climáticas'),

-- 07 - Saúde
('Saúde', 'saude', 1, '07000000', 'saude', NULL, 'Medicina, doenças, hospitais, bem-estar'),

-- 08 - Interesse Humano
('Interesse Humano', 'interesse-humano', 1, '08000000', 'interesse-humano', NULL, 'Histórias pessoais, curiosidades, celebridades'),

-- 09 - Trabalho
('Trabalho', 'trabalho', 1, '09000000', 'trabalho', NULL, 'Emprego, sindicatos, mercado de trabalho'),

-- 10 - Estilo de Vida e Lazer
('Estilo de Vida e Lazer', 'estilo-vida-lazer', 1, '10000000', 'estilo-vida-lazer', NULL, 'Moda, gastronomia, viagens, hobbies'),

-- 11 - Política
('Política', 'politica', 1, '11000000', 'politica', NULL, 'Governo, eleições, partidos, políticas públicas'),

-- 12 - Religião
('Religião', 'religiao', 1, '12000000', 'religiao', NULL, 'Igrejas, fé, líderes religiosos'),

-- 13 - Ciência e Tecnologia
('Ciência e Tecnologia', 'ciencia-tecnologia', 1, '13000000', 'ciencia-tecnologia', NULL, 'Pesquisa científica, inovação, tecnologia digital'),

-- 14 - Sociedade
('Sociedade', 'sociedade', 1, '14000000', 'sociedade', NULL, 'Questões sociais, demografia, família'),

-- 15 - Esporte
('Esporte', 'esporte', 1, '15000000', 'esporte', NULL, 'Competições, atletas, times'),

-- 16 - Conflito, Guerra e Paz
('Conflito, Guerra e Paz', 'conflito-guerra-paz', 1, '16000000', 'conflito-guerra-paz', NULL, 'Guerras, conflitos armados, diplomacia, paz'),

-- 17 - Clima
('Clima', 'clima', 1, '17000000', 'clima', NULL, 'Previsão do tempo, fenômenos climáticos')

ON CONFLICT (slug) DO UPDATE SET 
  level = EXCLUDED.level,
  iptc_code = EXCLUDED.iptc_code,
  path = EXCLUDED.path,
  description = EXCLUDED.description;

-- ============================================
-- NÍVEL 2: SUBCATEGORIAS PRINCIPAIS
-- ============================================

-- Subcategorias de ARTES, CULTURA E ENTRETENIMENTO (01)
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Cinema', 'cinema', 2, '01001000', 'artes-cultura-entretenimento/cinema', (SELECT id FROM categories WHERE slug = 'artes-cultura-entretenimento'), 'Filmes, diretores, atores, premiações'),
  ('Música', 'musica', 2, '01002000', 'artes-cultura-entretenimento/musica', (SELECT id FROM categories WHERE slug = 'artes-cultura-entretenimento'), 'Artistas, álbuns, shows, festivais'),
  ('Televisão', 'televisao', 2, '01003000', 'artes-cultura-entretenimento/televisao', (SELECT id FROM categories WHERE slug = 'artes-cultura-entretenimento'), 'Novelas, séries, reality shows, programas'),
  ('Games', 'games', 2, '01004000', 'artes-cultura-entretenimento/games', (SELECT id FROM categories WHERE slug = 'artes-cultura-entretenimento'), 'Jogos eletrônicos, consoles, esports'),
  ('Celebridades', 'celebridades', 2, '01005000', 'artes-cultura-entretenimento/celebridades', (SELECT id FROM categories WHERE slug = 'artes-cultura-entretenimento'), 'Fofocas, vida de famosos'),
  ('K-Pop', 'k-pop', 2, '01006000', 'artes-cultura-entretenimento/k-pop', (SELECT id FROM categories WHERE slug = 'artes-cultura-entretenimento'), 'Música e cultura pop coreana')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- Subcategorias de CRIME, LEI E JUSTIÇA (02)
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Crimes Violentos', 'crimes-violentos', 2, '02001000', 'crime-lei-justica/crimes-violentos', (SELECT id FROM categories WHERE slug = 'crime-lei-justica'), 'Homicídios, assaltos, sequestros'),
  ('Corrupção e Fraude', 'corrupcao-fraude', 2, '02002000', 'crime-lei-justica/corrupcao-fraude', (SELECT id FROM categories WHERE slug = 'crime-lei-justica'), 'Corrupção política, fraudes financeiras'),
  ('Tráfico de Drogas', 'trafico-drogas', 2, '02003000', 'crime-lei-justica/trafico-drogas', (SELECT id FROM categories WHERE slug = 'crime-lei-justica'), 'Narcotráfico, apreensões'),
  ('Justiça', 'justica', 2, '02004000', 'crime-lei-justica/justica', (SELECT id FROM categories WHERE slug = 'crime-lei-justica'), 'Tribunais, julgamentos, decisões judiciais'),
  ('Polícia', 'policia', 2, '02005000', 'crime-lei-justica/policia', (SELECT id FROM categories WHERE slug = 'crime-lei-justica'), 'Operações policiais, investigações')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- Subcategorias de ECONOMIA (04)
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Mercado Financeiro', 'mercado-financeiro', 2, '04001000', 'economia-negocios-financas/mercado-financeiro', (SELECT id FROM categories WHERE slug = 'economia-negocios-financas'), 'Bolsa, ações, investimentos'),
  ('Criptomoedas', 'criptomoedas', 2, '04002000', 'economia-negocios-financas/criptomoedas', (SELECT id FROM categories WHERE slug = 'economia-negocios-financas'), 'Bitcoin, altcoins, blockchain'),
  ('Inflação e Preços', 'inflacao-precos', 2, '04003000', 'economia-negocios-financas/inflacao-precos', (SELECT id FROM categories WHERE slug = 'economia-negocios-financas'), 'Custo de vida, IPCA, preços'),
  ('Empresas', 'empresas', 2, '04004000', 'economia-negocios-financas/empresas', (SELECT id FROM categories WHERE slug = 'economia-negocios-financas'), 'Negócios, corporações, startups'),
  ('Câmbio', 'cambio', 2, '04005000', 'economia-negocios-financas/cambio', (SELECT id FROM categories WHERE slug = 'economia-negocios-financas'), 'Dólar, euro, moedas estrangeiras')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- Subcategorias de POLÍTICA (11)
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Governo Federal', 'governo-federal', 2, '11001000', 'politica/governo-federal', (SELECT id FROM categories WHERE slug = 'politica'), 'Presidência, ministérios, Planalto'),
  ('Congresso', 'congresso', 2, '11002000', 'politica/congresso', (SELECT id FROM categories WHERE slug = 'politica'), 'Câmara, Senado, votações'),
  ('STF e Judiciário', 'stf-judiciario', 2, '11003000', 'politica/stf-judiciario', (SELECT id FROM categories WHERE slug = 'politica'), 'Supremo, decisões judiciais políticas'),
  ('Eleições', 'eleicoes', 2, '11004000', 'politica/eleicoes', (SELECT id FROM categories WHERE slug = 'politica'), 'Campanhas, votação, resultados'),
  ('Política Internacional', 'politica-internacional', 2, '11005000', 'politica/politica-internacional', (SELECT id FROM categories WHERE slug = 'politica'), 'Relações exteriores, diplomacia')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- Subcategorias de CIÊNCIA E TECNOLOGIA (13)
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Inteligência Artificial', 'inteligencia-artificial', 2, '13001000', 'ciencia-tecnologia/inteligencia-artificial', (SELECT id FROM categories WHERE slug = 'ciencia-tecnologia'), 'IA, machine learning, ChatGPT'),
  ('Smartphones', 'smartphones', 2, '13002000', 'ciencia-tecnologia/smartphones', (SELECT id FROM categories WHERE slug = 'ciencia-tecnologia'), 'Celulares, apps, iOS, Android'),
  ('Espaço', 'espaco', 2, '13003000', 'ciencia-tecnologia/espaco', (SELECT id FROM categories WHERE slug = 'ciencia-tecnologia'), 'NASA, SpaceX, astronomia'),
  ('Internet', 'internet', 2, '13004000', 'ciencia-tecnologia/internet', (SELECT id FROM categories WHERE slug = 'ciencia-tecnologia'), 'Redes sociais, web, conectividade'),
  ('Cibersegurança', 'ciberseguranca', 2, '13005000', 'ciencia-tecnologia/ciberseguranca', (SELECT id FROM categories WHERE slug = 'ciencia-tecnologia'), 'Hackers, vazamentos, privacidade')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- Subcategorias de ESPORTE (15)
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Futebol', 'futebol', 2, '15001000', 'esporte/futebol', (SELECT id FROM categories WHERE slug = 'esporte'), 'Times, campeonatos, jogadores'),
  ('Automobilismo', 'automobilismo', 2, '15002000', 'esporte/automobilismo', (SELECT id FROM categories WHERE slug = 'esporte'), 'Corridas, pilotos, equipes'),
  ('Lutas', 'lutas', 2, '15003000', 'esporte/lutas', (SELECT id FROM categories WHERE slug = 'esporte'), 'MMA, boxe, artes marciais'),
  ('Tênis', 'tenis', 2, '15004000', 'esporte/tenis', (SELECT id FROM categories WHERE slug = 'esporte'), 'ATP, WTA, Grand Slams'),
  ('Basquete', 'basquete', 2, '15005000', 'esporte/basquete', (SELECT id FROM categories WHERE slug = 'esporte'), 'NBA, NBB, seleções'),
  ('Vôlei', 'volei', 2, '15006000', 'esporte/volei', (SELECT id FROM categories WHERE slug = 'esporte'), 'Superliga, seleção brasileira'),
  ('Olimpíadas', 'olimpiadas', 2, '15007000', 'esporte/olimpiadas', (SELECT id FROM categories WHERE slug = 'esporte'), 'Jogos Olímpicos, medalhas')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- Subcategorias de SAÚDE (07)
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Medicina', 'medicina', 2, '07001000', 'saude/medicina', (SELECT id FROM categories WHERE slug = 'saude'), 'Tratamentos, descobertas médicas'),
  ('Epidemias', 'epidemias', 2, '07002000', 'saude/epidemias', (SELECT id FROM categories WHERE slug = 'saude'), 'Doenças contagiosas, surtos'),
  ('Saúde Mental', 'saude-mental', 2, '07003000', 'saude/saude-mental', (SELECT id FROM categories WHERE slug = 'saude'), 'Psicologia, transtornos, bem-estar'),
  ('Nutrição', 'nutricao', 2, '07004000', 'saude/nutricao', (SELECT id FROM categories WHERE slug = 'saude'), 'Alimentação, dietas, obesidade')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- ============================================
-- NÍVEL 3: SUBCATEGORIAS ESPECÍFICAS
-- ============================================

-- Subcategorias de FUTEBOL
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Campeonato Brasileiro', 'campeonato-brasileiro', 3, '15001001', 'esporte/futebol/campeonato-brasileiro', (SELECT id FROM categories WHERE slug = 'futebol'), 'Série A, B, C, D'),
  ('Libertadores', 'libertadores', 3, '15001002', 'esporte/futebol/libertadores', (SELECT id FROM categories WHERE slug = 'futebol'), 'Copa Libertadores da América'),
  ('Champions League', 'champions-league', 3, '15001003', 'esporte/futebol/champions-league', (SELECT id FROM categories WHERE slug = 'futebol'), 'Liga dos Campeões da UEFA'),
  ('Copa do Brasil', 'copa-do-brasil', 3, '15001004', 'esporte/futebol/copa-do-brasil', (SELECT id FROM categories WHERE slug = 'futebol'), 'Copa nacional'),
  ('Seleção Brasileira', 'selecao-brasileira', 3, '15001005', 'esporte/futebol/selecao-brasileira', (SELECT id FROM categories WHERE slug = 'futebol'), 'Convocações, jogos da seleção')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- Subcategorias de AUTOMOBILISMO
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Fórmula 1', 'formula-1', 3, '15002001', 'esporte/automobilismo/formula-1', (SELECT id FROM categories WHERE slug = 'automobilismo'), 'GPs, pilotos, equipes de F1'),
  ('MotoGP', 'motogp', 3, '15002002', 'esporte/automobilismo/motogp', (SELECT id FROM categories WHERE slug = 'automobilismo'), 'Motociclismo de velocidade'),
  ('Stock Car', 'stock-car', 3, '15002003', 'esporte/automobilismo/stock-car', (SELECT id FROM categories WHERE slug = 'automobilismo'), 'Stock Car Brasil'),
  ('NASCAR', 'nascar', 3, '15002004', 'esporte/automobilismo/nascar', (SELECT id FROM categories WHERE slug = 'automobilismo'), 'Corridas americanas')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- Subcategorias de LUTAS
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('UFC/MMA', 'ufc-mma', 3, '15003001', 'esporte/lutas/ufc-mma', (SELECT id FROM categories WHERE slug = 'lutas'), 'Ultimate Fighting Championship'),
  ('Boxe', 'boxe', 3, '15003002', 'esporte/lutas/boxe', (SELECT id FROM categories WHERE slug = 'lutas'), 'Lutas de boxe profissional')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- Subcategorias de CRIPTOMOEDAS
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Bitcoin', 'bitcoin', 3, '04002001', 'economia-negocios-financas/criptomoedas/bitcoin', (SELECT id FROM categories WHERE slug = 'criptomoedas'), 'BTC, halving, mineração'),
  ('Ethereum', 'ethereum', 3, '04002002', 'economia-negocios-financas/criptomoedas/ethereum', (SELECT id FROM categories WHERE slug = 'criptomoedas'), 'ETH, smart contracts'),
  ('Altcoins', 'altcoins', 3, '04002003', 'economia-negocios-financas/criptomoedas/altcoins', (SELECT id FROM categories WHERE slug = 'criptomoedas'), 'Outras criptomoedas')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- Subcategorias de SMARTPHONES
INSERT INTO categories (name, slug, level, iptc_code, path, parent_id, description)
SELECT name, slug, level, iptc_code, path, parent_id, description FROM (VALUES
  ('Apple/iPhone', 'apple-iphone', 3, '13002001', 'ciencia-tecnologia/smartphones/apple-iphone', (SELECT id FROM categories WHERE slug = 'smartphones'), 'iPhone, iOS, Apple'),
  ('Android', 'android', 3, '13002002', 'ciencia-tecnologia/smartphones/android', (SELECT id FROM categories WHERE slug = 'smartphones'), 'Samsung, Xiaomi, Google')
) AS t(name, slug, level, iptc_code, path, parent_id, description)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, path = EXCLUDED.path;

-- ============================================
-- ATUALIZAR CONTAGEM E VERIFICAÇÃO
-- ============================================

-- Verificar estrutura criada
-- SELECT level, COUNT(*) as total FROM categories GROUP BY level ORDER BY level;
-- Esperado: Nível 1: 17, Nível 2: ~30, Nível 3: ~15

