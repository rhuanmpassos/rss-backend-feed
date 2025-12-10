# 📋 Plano de Implementação: Categorias Dinâmicas e Sistema de Recomendação

## 🎯 Objetivo

Transformar o sistema de categorização de **lista fixa** para **categorias dinâmicas e específicas**, preparando a base para o sistema de recomendação "For You".

---

## 📊 Como Funciona HOJE

### Fluxo Atual de Classificação

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SCRAPER SERVICE (scraperService.js)                      │
│    ↓                                                          │
│    Artigo extraído do site RSS                              │
│    ↓                                                          │
│    Artigo salvo no banco (category = NULL)                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. GEMINI CLASSIFIER (geminiClassifierService.js)           │
│    ↓                                                          │
│    Recebe: title + summary                                   │
│    ↓                                                          │
│    Envia para Gemini COM LISTA FIXA:                         │
│    ["Fórmula 1", "Futebol", "Esportes", ...] (18 categorias)│
│    ↓                                                          │
│    Gemini retorna: {"category": "Futebol", "confidence": 0.95}│
│    ↓                                                          │
│    VALIDAÇÃO: Verifica se está na lista fixa                 │
│    ↓                                                          │
│    Se válida → Retorna {category, confidence}                │
│    Se inválida → Retorna null (artigo fica sem categoria)    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. ARTICLE MODEL (Article.js)                                │
│    ↓                                                          │
│    updateCategory(id, "Futebol", 0.95)                       │
│    ↓                                                          │
│    UPDATE articles SET category = 'Futebol',                 │
│                        category_confidence = 0.95             │
│    ↓                                                          │
│    Salva como STRING no banco (VARCHAR)                      │
└─────────────────────────────────────────────────────────────┘
```

### Estrutura de Banco HOJE

```sql
-- Tabela articles
articles (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100),           -- ← STRING, sem FK
  category_confidence FLOAT,
  ...
)

-- Tabela categories (existe mas NÃO é usada)
categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE,
  slug VARCHAR(100) UNIQUE,
  ...
)
```

### Problemas Atuais

1. ❌ **Lista fixa**: Gemini só pode retornar 18 categorias pré-definidas
2. ❌ **Armazenamento**: `articles.category` é VARCHAR (string), não tem FK
3. ❌ **Validação rígida**: Se Gemini retornar "Badminton", é rejeitado
4. ❌ **Sem normalização**: "Futebol" e "Futebol Brasileiro" seriam diferentes
5. ❌ **Tabela categories existe, mas não é usada** (só referência)

---

## 🚀 Como Será no NOVO MODELO

### Novo Fluxo de Classificação

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SCRAPER SERVICE (scraperService.js)                      │
│    ↓                                                          │
│    Artigo extraído do site RSS                              │
│    ↓                                                          │
│    Artigo salvo no banco (category_id = NULL)                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. GEMINI CLASSIFIER (geminiClassifierService.js)           │
│    ↓                                                          │
│    Recebe: title + summary                                   │
│    ↓                                                          │
│    Envia para Gemini SEM lista fixa:                        │
│    "Classifique de forma ESPECÍFICA:                         │
│     'Fórmula 1' ao invés de 'Esportes',                      │
│     'Badminton' ao invés de 'Esportes', etc."                │
│    ↓                                                          │
│    Gemini retorna: {"category": "Badminton", "confidence": 0.95}│
│    ↓                                                          │
│    SEM VALIDAÇÃO de lista fixa                               │
│    ↓                                                          │
│    Retorna {category: "Badminton", confidence: 0.95}        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. CATEGORY SERVICE (categoryService.js) - NOVO             │
│    ↓                                                          │
│    normalizeAndGetCategory("Badminton")                      │
│    ↓                                                          │
│    Normaliza: "Badminton" → slug "badminton"                 │
│    ↓                                                          │
│    Busca no banco: SELECT * FROM categories                  │
│                     WHERE slug = 'badminton'                 │
│    ↓                                                          │
│    Se NÃO existe:                                            │
│      → INSERT INTO categories (name, slug)                   │
│        VALUES ('Badminton', 'badminton')                      │
│      → Retorna nova categoria criada                         │
│    ↓                                                          │
│    Se existe:                                                │
│      → Retorna categoria existente                           │
│    ↓                                                          │
│    Retorna: {id: 15, name: "Badminton", slug: "badminton"}  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. ARTICLE MODEL (Article.js)                               │
│    ↓                                                          │
│    updateCategory(id, categoryId, confidence)                │
│    ↓                                                          │
│    UPDATE articles SET category_id = 15,                     │
│                        category_confidence = 0.95              │
│    ↓                                                          │
│    Salva FK no banco (relacionamento correto)                │
└─────────────────────────────────────────────────────────────┘
```

### Nova Estrutura de Banco

```sql
-- Tabela articles (MODIFICADA)
articles (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id),  -- ← FK (novo)
  category_confidence FLOAT,
  -- category VARCHAR(100)  ← REMOVIDO após migração (não precisa manter)
  ...
)

-- Tabela categories (USADA CORRETAMENTE)
categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
)

-- NOVA: Tabela users
users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
)

-- NOVA: Tabela user_category_preferences
user_category_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  category_id INTEGER REFERENCES categories(id),
  preference_score FLOAT DEFAULT 0.5,  -- 0.0 a 1.0
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, category_id)
)

-- NOVA: Tabela user_interactions (para recomendação futura)
user_interactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  article_id INTEGER REFERENCES articles(id),
  interaction_type VARCHAR(50),  -- 'click', 'view', 'scroll_stop', 'impression'
  duration INTEGER,               -- tempo em ms (para 'view')
  position INTEGER,               -- posição no feed quando viu
  created_at TIMESTAMP DEFAULT NOW()
)
```

---

## 🔧 Mudanças Principais

### 1. Gemini: Classificação Livre

**Antes:**
```javascript
const CATEGORIES = [
  'Fórmula 1', 'Futebol', 'Esportes', ...
];

const prompt = `
TEXTO: "${text}"
CATEGORIAS: ${CATEGORIES.join(', ')}  // ← Força Gemini a escolher apenas da lista
...
`;
```

**Depois:**
```javascript
const prompt = `
Você é um classificador de notícias brasileiras. 
Classifique este artigo de forma ESPECÍFICA e precisa.

TEXTO: "${text}"

REGRAS:
- Seja ESPECÍFICO: "Fórmula 1" ao invés de "Esportes"
- Seja ESPECÍFICO: "Badminton" ao invés de "Esportes"
- Seja ESPECÍFICO: "Política - Direita" ao invés de "Política"
- Use nomes claros e diretos

FORMATO: {"category":"NOME_ESPECÍFICO","confidence":0.95}
`;
// Gemini classifica livremente, sem restrições
```

### 2. Normalização Inteligente

**Novo serviço: `categoryService.js`**

```javascript
async normalizeAndGetCategory(categoryName) {
  // 1. Normaliza nome para slug
  const slug = normalizeSlug(categoryName); // "Badminton" → "badminton"
  
  // 2. Busca categoria existente
  let category = await Category.findBySlug(slug);
  
  // 3. Se não existe, cria
  if (!category) {
    category = await Category.create({
      name: categoryName,  // Nome original: "Badminton"
      slug: slug            // Slug normalizado: "badminton"
    });
  }
  
  return category; // {id: 15, name: "Badminton", slug: "badminton"}
}
```

### 3. Banco de Dados: FK ao invés de String

**Antes:**
```sql
articles.category = 'Futebol'  -- VARCHAR, sem relacionamento
```

**Depois:**
```sql
articles.category_id = 5  -- FK para categories.id
-- Relacionamento correto, queries mais eficientes
```

### 4. Model Article: usa category_id

**Antes:**
```javascript
async updateCategory(id, category, confidence) {
  // category é string: "Futebol"
  UPDATE articles SET category = 'Futebol' ...
}
```

**Depois:**
```javascript
async updateCategory(id, categoryId, confidence) {
  // categoryId é número: 5
  UPDATE articles SET category_id = 5 ...
}
```

---

## 📁 Estrutura de Arquivos

### Arquivos a MODIFICAR

1. **`backend/src/services/geminiClassifierService.js`**
   - Remover lista fixa de categorias
   - Modificar prompt para classificação livre
   - Remover validação de lista fixa

2. **`backend/src/models/Article.js`**
   - Mudar `updateCategory(id, category, confidence)` → `updateCategory(id, categoryId, confidence)`
   - Atualizar `findAll()` para usar `category_id` ao invés de `category`
   - Atualizar `findUncategorized()` para verificar `category_id IS NULL`

3. **`backend/src/services/scraperService.js`**
   - Integrar com `categoryService` após classificação
   - Usar `category_id` ao invés de `category` (string)

4. **`backend/src/models/Category.js`**
   - Adicionar método `create({ name, slug })`
   - Adicionar método `findById(id)`

5. **`backend/src/services/feedGeneratorService.js`**
   - Atualizar para usar `category_id` nas queries
   - JOIN com tabela `categories` para buscar nome

### Arquivos a CRIAR

1. **`backend/src/services/categoryService.js`** (NOVO)
   - `normalizeAndGetCategory(categoryName)` - Normaliza e busca/cria categoria
   - `normalizeSlug(name)` - Função de normalização

2. **`backend/src/models/User.js`** (NOVO)
   - CRUD básico de usuários

3. **`backend/src/models/UserCategoryPreference.js`** (NOVO)
   - Gerenciar preferências de categorias do usuário

4. **`backend/src/models/UserInteraction.js`** (NOVO)
   - Registrar interações do usuário (cliques, views, etc.)

5. **`backend/migrations/003_add_category_id.sql`** (NOVO)
   - Adicionar coluna `category_id` em `articles`
   - Migrar dados existentes de `category` (string) para `category_id` (FK)
   - Criar índices

6. **`backend/migrations/004_create_users_tables.sql`** (NOVO)
   - Criar tabelas `users`, `user_category_preferences`, `user_interactions`

---

## 🗄️ Migração de Banco de Dados

### Migração 003: Adicionar category_id

```sql
-- 1. Adicionar coluna category_id
ALTER TABLE articles 
ADD COLUMN category_id INTEGER REFERENCES categories(id);

-- 2. Criar categorias a partir dos valores únicos de category
INSERT INTO categories (name, slug)
SELECT DISTINCT 
  category as name,
  LOWER(REGEXP_REPLACE(category, '[^a-zA-Z0-9]+', '-', 'g')) as slug
FROM articles
WHERE category IS NOT NULL
ON CONFLICT (slug) DO NOTHING;

-- 3. Migrar dados: atualizar category_id baseado em category (string)
UPDATE articles a
SET category_id = c.id
FROM categories c
WHERE a.category = c.name
  AND a.category_id IS NULL;

-- 4. Criar índice
CREATE INDEX idx_articles_category_id ON articles(category_id);

-- 5. Validar migração (verificar se todos os artigos têm category_id)
-- SELECT COUNT(*) FROM articles WHERE category IS NOT NULL AND category_id IS NULL;
-- Se retornar 0, migração OK!

-- 6. Remover coluna category (após validação)
ALTER TABLE articles DROP COLUMN category;
```

### Migração 004: Criar tabelas de usuários

```sql
-- Tabela users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela user_category_preferences
CREATE TABLE IF NOT EXISTS user_category_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  preference_score FLOAT DEFAULT 0.5,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, category_id)
);

-- Tabela user_interactions
CREATE TABLE IF NOT EXISTS user_interactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL,  -- 'click', 'view', 'scroll_stop', 'impression'
  duration INTEGER,                        -- tempo em ms (para 'view')
  position INTEGER,                        -- posição no feed quando viu
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_user_preferences_user_id ON user_category_preferences(user_id);
CREATE INDEX idx_user_preferences_category_id ON user_category_preferences(category_id);
CREATE INDEX idx_user_interactions_user_id ON user_interactions(user_id);
CREATE INDEX idx_user_interactions_article_id ON user_interactions(article_id);
CREATE INDEX idx_user_interactions_user_article ON user_interactions(user_id, article_id);
CREATE INDEX idx_user_interactions_type ON user_interactions(interaction_type);
CREATE INDEX idx_user_interactions_created_at ON user_interactions(created_at DESC);
```

---

## 🔄 Fluxo Completo de Implementação

### Fase 1: Migração do Banco ✅
1. Criar migração `003_add_category_id.sql`
2. Executar migração
3. Validar dados migrados

### Fase 2: Serviço de Normalização ✅
1. Criar `categoryService.js`
2. Implementar `normalizeSlug()`
3. Implementar `normalizeAndGetCategory()`

### Fase 3: Atualizar Gemini Classifier ✅
1. Remover lista fixa de categorias
2. Modificar prompt para classificação livre
3. Remover validação de lista fixa
4. Integrar com `categoryService`

### Fase 4: Atualizar Models ✅
1. Atualizar `Category.js` (adicionar `create`, `findById`)
2. Atualizar `Article.js` (usar `category_id`)
3. Atualizar queries para usar JOIN com `categories`

### Fase 5: Atualizar Scraper Service ✅
1. Integrar `categoryService` no fluxo de classificação
2. Usar `category_id` ao invés de `category` (string)

### Fase 6: Sistema de Usuários (Estrutura Básica) ✅
1. Criar migração `004_create_users_tables.sql`
2. Criar `User.js` model
3. Criar `UserCategoryPreference.js` model
4. Criar `UserInteraction.js` model

### Fase 7: Feeds Básicos ✅
1. Feed Cronológico (já funciona, apenas ajustar queries)
2. Feed YouTube (estrutura básica - filtrar por categoria "YouTube" ou similar)
3. Feed "For You" (estrutura básica - retorna artigos das 4 categorias preferidas do usuário em ordem cronológica)

---

## 📊 Exemplo Prático

### Artigo: "Hamilton vence GP de Mônaco"

**HOJE:**
```
Gemini: "Fórmula 1" (está na lista) ✅
Salva: articles.category = 'Fórmula 1'
```

**NOVO MODELO:**
```
Gemini: "Fórmula 1" (livre) ✅
Normaliza: slug = "formula-1"
Busca: categories WHERE slug = 'formula-1' → Existe? {id: 3, name: "Fórmula 1"}
Salva: articles.category_id = 3
```

### Artigo: "Brasil vence campeonato de Badminton"

**HOJE:**
```
Gemini: "Badminton" (NÃO está na lista) ❌
Resultado: Artigo fica sem categoria
```

**NOVO MODELO:**
```
Gemini: "Badminton" (livre) ✅
Normaliza: slug = "badminton"
Busca: categories WHERE slug = 'badminton' → NÃO existe
Cria: INSERT INTO categories (name, slug) VALUES ('Badminton', 'badminton')
     → {id: 25, name: "Badminton", slug: "badminton"}
Salva: articles.category_id = 25
```

---

## 🎯 Integração com Sistema de Recomendação Futuro

### Preparação para "For You"

O novo sistema de categorias dinâmicas prepara a base para o algoritmo de recomendação:

1. **Categorias Específicas** → Melhor matching de conteúdo
   - "Fórmula 1" é mais específico que "Esportes"
   - Permite recomendações mais precisas

2. **FK no Banco** → Queries eficientes
   ```sql
   -- Buscar artigos de categorias preferidas do usuário
   SELECT a.* FROM articles a
   JOIN user_category_preferences ucp ON a.category_id = ucp.category_id
   WHERE ucp.user_id = $1
   ORDER BY ucp.preference_score DESC, a.published_at DESC
   ```

3. **Normalização** → Evita duplicatas
   - "Futebol" e "Futebol Brasileiro" podem ser normalizados para "futebol"
   - Melhora agregação de dados para recomendação

4. **Estrutura de Usuários** → Base para CF
   - `user_interactions` → Dados para Collaborative Filtering
   - `user_category_preferences` → Perfil de preferências

### Fluxo Futuro "For You" (Estrutura Básica Agora)

```javascript
// Feed "For You" - Estrutura básica (sem algoritmo ainda)
async getForYouFeed(userId, limit = 50) {
  // 1. Busca 4 categorias preferidas do usuário
  const preferences = await UserCategoryPreference.findTopCategories(userId, 4);
  
  // 2. Se não tem preferências, retorna feed cronológico padrão
  if (preferences.length === 0) {
    return await Article.findAll({ limit });
  }
  
  // 3. Busca artigos dessas categorias em ordem cronológica
  const categoryIds = preferences.map(p => p.category_id);
  return await Article.findByCategoryIds(categoryIds, limit);
}
```

---

## ✅ Checklist de Implementação

### ✅ Correções SSE (CONCLUÍDAS)
- [x] Atualizar `Article.updateCategory` para retornar `site_name` via subquery
- [x] Atualizar broadcast em `geminiClassifierService.js` para incluir `created_at` e `site_name`
- [ ] Testar eventos SSE com formato completo

### ✅ Migração (ARQUIVOS CRIADOS)
- [x] Criar `003_add_category_id.sql`
- [x] Criar `004_create_users_tables.sql`
- [x] Criar script `run-migrations.js`
- [ ] Executar migrações (`node run-migrations.js`)
- [ ] Validar dados migrados

### ✅ Serviços (CONCLUÍDOS)
- [x] Criar `categoryService.js`
- [x] Implementar `normalizeSlug()`
- [x] Implementar `normalizeAndGetCategory()`
- [x] Atualizar `geminiClassifierService.js` (remover lista fixa, classificação livre)
- [x] Integrar `categoryService` no fluxo de classificação

### ✅ Models (CONCLUÍDOS)
- [x] Atualizar `Category.js` (adicionar `create`, `findById`, `findByName`, `findAllWithCount`)
- [x] Atualizar `Article.js` (usar `category_id`, `findByCategoryIds`, `findByIdWithCategory`)
- [x] Criar `User.js`
- [x] Criar `UserCategoryPreference.js`
- [x] Criar `UserInteraction.js`

### ✅ Integração (CONCLUÍDAS)
- [x] Atualizar `scraperService.js` para usar `categoryService`
- [x] Atualizar `feedGeneratorService.js` para usar `category_id` e `categorySlug`
- [x] Atualizar `articlesController.js` para novos parâmetros

### Feeds (Estrutura Básica)
- [x] Feed Cronológico (queries atualizadas para usar category_id)
- [ ] Feed YouTube (estrutura básica)
- [ ] Feed "For You" (estrutura básica - 4 categorias preferidas)

### Testes (PENDENTES)
- [ ] Executar migrações em ambiente de teste
- [ ] Testar classificação livre do Gemini
- [ ] Testar normalização de categorias
- [ ] Testar criação automática de categorias
- [ ] Testar feeds básicos

---

## 🚀 Próximos Passos (Após Implementação)

1. **Algoritmo "For You"** (futuro)
   - Content-Based Filtering (embeddings de título + snippet)
   - Collaborative Filtering (baseado em interações)
   - Sistema híbrido (combinação dos dois)

2. **Análise de Interações**
   - Tracking de cliques, views, scroll
   - Cálculo de preferências dinâmicas
   - Ajuste de scores de categorias

3. **Otimizações**
   - Cache de categorias
   - Índices adicionais
   - Queries otimizadas

---

## ✅ Correções SSE Implementadas

### ~~Problema: Gateway NÃO recebe todos os campos necessários~~

**RESOLVIDO!** O backend agora envia `site_name` e `created_at` no evento SSE.

**Arquivo:** `backend/src/services/geminiClassifierService.js` - Linha ~174

```javascript
// ATUAL (INCOMPLETO)
sseManager.broadcastFiltered('new_article', {
  id: updatedArticle.id,
  title: updatedArticle.title,
  url: updatedArticle.url,
  summary: updatedArticle.summary,
  image_url: updatedArticle.image_url,
  category: updatedArticle.category,
  category_confidence: updatedArticle.category_confidence,
  published_at: updatedArticle.published_at,
  site_id: updatedArticle.site_id
  // FALTA: site_name, created_at
});

// CORRETO (COMPLETO)
sseManager.broadcastFiltered('new_article', {
  id: updatedArticle.id,
  title: updatedArticle.title,
  url: updatedArticle.url,
  summary: updatedArticle.summary,
  image_url: updatedArticle.image_url,
  category: updatedArticle.category,           // Futuro: objeto { id, name, slug }
  category_confidence: updatedArticle.category_confidence,
  published_at: updatedArticle.published_at,
  created_at: updatedArticle.created_at,       // ← ADICIONAR
  site_id: updatedArticle.site_id,
  site_name: updatedArticle.site_name          // ← ADICIONAR (via JOIN)
});
```

### Correção no Model Article.js

**Arquivo:** `backend/src/models/Article.js` - Método `updateCategory`

```javascript
// ATUAL
async updateCategory(id, category, confidence) {
  const result = await query(
    `UPDATE articles 
     SET category = $1, category_confidence = $2 
     WHERE id = $3 
     RETURNING *`,
    [category, confidence, id]
  );
  return result.rows[0];
}

// CORRETO (com site_name via subquery)
async updateCategory(id, category, confidence) {
  const result = await query(
    `UPDATE articles 
     SET category = $1, category_confidence = $2 
     WHERE id = $3 
     RETURNING *, 
       (SELECT name FROM sites WHERE id = articles.site_id) as site_name`,
    [category, confidence, id]
  );
  return result.rows[0];
}
```

### Checklist de Correções SSE

- [ ] Atualizar `Article.updateCategory` para retornar `site_name`
- [ ] Atualizar broadcast no `geminiClassifierService.js` para incluir `created_at` e `site_name`
- [ ] Testar que gateway recebe todos os campos corretamente

---

## 📝 Notas Importantes

### Como estamos implementando backend primeiro (antes do app):

1. **Migração de Dados**: 
   - Migrar todos os dados existentes de `category` (string) para `category_id` (FK)
   - Após validação, **remover coluna `category`** (não precisa manter temporariamente)
   - Apenas manter durante a migração para garantir dados corretos

2. **Backward Compatibility**: 
   - **Não é necessário** manter compatibilidade com feeds/endpoints antigos
   - Como o app ainda não existe, podemos fazer breaking changes
   - Todos os endpoints serão atualizados para usar `category_id` desde o início

3. **Rate Limiting**: 
   - Manter rate limiting do Gemini (1 segundo entre requests, 1 minuto se rate limited)
   - Sistema de fila para artigos não categorizados continua funcionando

4. **Normalização**: 
   - Implementar normalização básica (slug) para evitar duplicatas óbvias
   - Exemplos: "Futebol" → "futebol", "Fórmula 1" → "formula-1"
   - Normalização avançada (ex: "Futebol" = "Futebol Brasileiro") pode ser adicionada depois se necessário

5. **Validação**: 
   - Validar dados migrados antes de remover coluna `category`
   - Verificar que todos os artigos com categoria têm `category_id` correspondente
   - Testar criação de novas categorias dinamicamente

6. **Preparação para App**: 
   - Estrutura de banco deve estar pronta para quando o app for desenvolvido
   - Endpoints devem retornar dados no formato que o app vai consumir
   - Incluir objeto `category` completo nas respostas (não só `category_id`)

---

**Status**: ✅ Implementado - Banco zerado e pronto para receber dados novos

### Scripts Úteis

```bash
# Limpar banco completamente
node clean-database.js

# Executar migrações
node run-migrations.js

# Corrigir migração de categorias (se necessário)
node fix-category-migration.js
```

