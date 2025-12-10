# 🧠 Algoritmo de Recomendação "For You"

## 🎯 Objetivo

Criar um feed personalizado que recomenda notícias que o usuário tem **maior probabilidade de clicar**, baseado em:
- **Conteúdo** (título + snippet) ⚠️ **APENAS título + snippet, não a notícia inteira**
- **Comportamento** (histórico de interações)
- **Preferências** (categorias favoritas)

### ⚠️ Importante: Limitação de Texto

**Por que trabalhamos apenas com título + snippet?**

#### 1. **RSS só fornece título + snippet**
- Feeds RSS normalmente contêm apenas:
  - `<title>` → Título da notícia
  - `<description>` ou `<summary>` → Snippet/resumo curto
- **Não incluem o conteúdo completo** da notícia
- Para obter conteúdo completo, seria necessário fazer scraping de cada página individual

#### 2. **Questões de Direitos Autorais**
- Mostrar notícia completa ao usuário pode violar direitos autorais
- Sites de notícias geralmente não permitem republicação completa
- Melhor prática: mostrar título + snippet e redirecionar para site original

#### 3. **O que o usuário vê**
- No feedcard: apenas título + snippet
- Ao clicar: abre link externo (site original)
- **Não temos acesso ao conteúdo completo que o usuário lê**

#### 4. **Opções para Embeddings**

**Opção A: Usar apenas título + snippet (ATUAL)**
- ✅ Mais simples
- ✅ Já disponível no RSS
- ✅ Modelos sentence-transformers funcionam bem com texto curto
- ✅ Menos processamento
- ⚠️ Menos contexto (pode reduzir precisão)

**Opção B: Fazer scraping do conteúdo completo (FUTURO)**
- ✅ Embeddings mais precisos (mais contexto)
- ✅ Melhor matching de conteúdo
- ❌ Mais complexo (scraping de cada página)
- ❌ Mais lento (requisições HTTP extras)
- ❌ Pode violar termos de uso de alguns sites
- ❌ Mais custo de processamento
- ⚠️ **Conteúdo completo usado APENAS para embeddings, não mostrado ao usuário**

**Recomendação:** Começar com Opção A (título + snippet). Se precisar melhorar precisão, implementar Opção B depois.

---

### 💡 Implementação Futura: Scraping de Conteúdo Completo

**Se decidirmos usar conteúdo completo para embeddings (Opção B):**

#### Como Funcionaria

1. **Scraping de Página Individual**
   - Quando artigo é salvo, fazer scraping da página completa
   - Extrair conteúdo principal (remover menus, ads, etc.)
   - Armazenar em `articles.content` (já existe no banco)

2. **Embeddings com Conteúdo Completo**
   ```javascript
   // Usa título + snippet + conteúdo completo
   const text = `${article.title}. ${article.summary}. ${article.content}`;
   const embedding = await generateEmbedding(text);
   ```

3. **Ainda Mostra Apenas Título + Snippet ao Usuário**
   - Conteúdo completo usado **APENAS para embeddings**
   - Usuário continua vendo apenas título + snippet no feedcard
   - Ao clicar, abre link externo (site original)

#### Vantagens
- ✅ Embeddings mais precisos (mais contexto)
- ✅ Melhor matching de conteúdo
- ✅ Não viola direitos autorais (não mostra ao usuário)

#### Desafios
- ⚠️ Mais complexo (scraping de cada página)
- ⚠️ Mais lento (requisições HTTP extras)
- ⚠️ Pode violar termos de uso de alguns sites
- ⚠️ Mais custo de processamento
- ⚠️ Alguns sites bloqueiam scraping

#### Implementação

**Boa notícia:** A tabela `articles` já tem o campo `content TEXT` (preparado para conteúdo completo).

O scraper já tem capacidade de fazer scraping de páginas individuais (usado para buscar imagens). Podemos estender para extrair conteúdo:

```javascript
// Adicionar método no scraperService.js
async extractContentFromArticlePage(articleUrl) {
  const response = await axios.get(articleUrl, {
    headers: { 'User-Agent': '...' },
    timeout: 10000
  });
  
  const $ = cheerio.load(response.data);
  
  // Remove elementos desnecessários
  $('script, style, nav, footer, aside, .ad, .advertisement').remove();
  
  // Busca conteúdo principal
  const contentSelectors = [
    'article .post-content',
    'article .entry-content',
    'article .article-content',
    'article .content',
    'article',
    'main [role="main"]'
  ];
  
  let $content = null;
  for (const selector of contentSelectors) {
    $content = $(selector).first();
    if ($content.length) break;
  }
  
  // Extrai texto limpo
  return $content.text().trim();
}
```

**Nota:** Por enquanto, vamos com Opção A (título + snippet). Opção B pode ser implementada depois se precisarmos melhorar precisão.

---

## 📊 Algoritmo Híbrido: Content-Based + Collaborative Filtering

### Por que Híbrido?

1. **Content-Based** → Funciona mesmo para usuários novos (cold start)
2. **Collaborative Filtering** → Aprende com comportamento de usuários similares
3. **Híbrido** → Combina os dois para melhor precisão

---

## 🔍 Como Funciona: Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CANDIDATE GENERATION (Geração de Candidatos)              │
│    ↓                                                          │
│    Content-Based: Busca artigos similares ao perfil          │
│    Collaborative: Busca artigos que usuários similares gostaram│
│    ↓                                                          │
│    Resultado: Lista de ~500-1000 artigos candidatos          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. RANKING (Ordenação)                                        │
│    ↓                                                          │
│    Calcula score para cada artigo:                           │
│    - Similaridade com perfil (Content-Based)                 │
│    - Score de Collaborative Filtering                        │
│    - Frescor (quanto mais recente, melhor)                   │
│    - Popularidade (quantos cliques recebeu)                  │
│    - Diversidade (evitar repetir mesma categoria)           │
│    ↓                                                          │
│    Ordena por score decrescente                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. FEED FINAL                                                 │
│    ↓                                                          │
│    Retorna top 50 artigos ordenados                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📐 Parte 1: Content-Based Filtering

### Como Funciona

**Baseado em similaridade de conteúdo** (título + snippet).

### 1.1. Embeddings de Texto

**⚠️ IMPORTANTE:** Embeddings são gerados **APENAS de título + snippet**, não da notícia completa.

Cada artigo é convertido em um **vetor numérico** (embedding) que representa seu conteúdo:

```javascript
// Artigo:
// Título: "Hamilton vence GP de Mônaco"
// Snippet: "Piloto da Mercedes conquista vitória histórica no circuito de Mônaco"
// 
// Texto usado para embedding: "Hamilton vence GP de Mônaco. Piloto da Mercedes conquista vitória histórica no circuito de Mônaco"
// Embedding: [0.23, -0.45, 0.67, ..., 0.12] (384 dimensões)

// Artigo:
// Título: "Verstappen conquista pole position"
// Snippet: "Holandês marca melhor tempo na classificação"
//
// Texto usado para embedding: "Verstappen conquista pole position. Holandês marca melhor tempo na classificação"
// Embedding: [0.25, -0.43, 0.65, ..., 0.15] (384 dimensões)

// Artigos similares (mesmo tema) têm embeddings próximos!
```

**Modelo usado:** `paraphrase-multilingual-MiniLM-L12-v2` (384 dimensões, multilíngue)

**Por que este modelo?**
- ✅ **Multilíngue**: Treinado em 50+ idiomas, incluindo **português brasileiro**
- ✅ **Otimizado para textos curtos**: Perfeito para título + snippet
- ✅ **Bom equilíbrio**: Qualidade vs. velocidade
- ✅ **Disponível em JavaScript**: Via `@xenova/transformers`

**Alternativas consideradas:**
| Modelo | Português | Velocidade | Qualidade | Tamanho |
|--------|-----------|------------|-----------|---------|
| `all-MiniLM-L6-v2` | ⭐⭐ Fraco (inglês) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 90MB |
| **`paraphrase-multilingual-MiniLM-L12-v2`** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 480MB |
| `multilingual-e5-base` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 1.1GB |

**Escolhemos `paraphrase-multilingual-MiniLM-L12-v2`** porque:
1. O app é de **notícias brasileiras** → precisa entender português
2. Textos são **curtos** (título + snippet) → não precisa de modelo gigante
3. Precisa ser **rápido** para processar muitos artigos

### 1.2. Perfil do Usuário

**Perfil = média das embeddings dos artigos que o usuário interagiu**

**⚠️ IMPORTANTE:** Cada embedding é gerado apenas de título + snippet do artigo.

```javascript
// Usuário clicou em:
// - Artigo 1: "Hamilton vence GP" + snippet → embedding [0.2, -0.4, 0.6, ...]
// - Artigo 2: "Verstappen pole" + snippet → embedding [0.3, -0.3, 0.7, ...]
// - Artigo 3: "Leclerc acelera" + snippet → embedding [0.1, -0.5, 0.5, ...]

// Perfil = média dos 3 embeddings (representa interesse em Fórmula 1)
// Perfil = [0.2, -0.4, 0.6, ...]
```

**O perfil captura o padrão de interesse do usuário baseado apenas nos títulos e snippets que ele clicou.**

### 1.3. Similaridade (Cosine Similarity)

**Quanto mais próximo de 1.0, mais similar:**

```javascript
function cosineSimilarity(vecA, vecB) {
  // Calcula distância entre dois vetores
  // Retorna valor entre -1 e 1
  // 1.0 = idêntico, 0.0 = não relacionado, -1.0 = oposto
}

// Exemplo:
// Perfil do usuário: [0.2, -0.4, 0.6]
// Artigo novo: [0.25, -0.35, 0.65]
// Similaridade: 0.92 → MUITO SIMILAR! ✅
```

### 1.4. Busca de Candidatos

```sql
-- Busca artigos com embeddings similares ao perfil do usuário
SELECT 
  a.*,
  -- Calcula similaridade (cosine similarity)
  1 - (embedding <=> $1::vector) as similarity
FROM articles a
WHERE a.category_id IN (
  -- Só busca em categorias que o usuário já interagiu
  SELECT DISTINCT category_id 
  FROM user_interactions ui
  JOIN articles a2 ON ui.article_id = a2.id
  WHERE ui.user_id = $2
)
ORDER BY similarity DESC
LIMIT 500;
```

**Nota:** Usa extensão `pgvector` do PostgreSQL para busca vetorial eficiente.

---

## 👥 Parte 2: Collaborative Filtering

### Como Funciona

**Baseado em comportamento de usuários similares.**

### 2.1. Item-Item Collaborative Filtering

**Conceito:** "Usuários que clicaram em X também clicaram em Y"

```javascript
// Usuário A clicou em: [Artigo 1, Artigo 3, Artigo 5]
// Usuário B clicou em: [Artigo 1, Artigo 3, Artigo 7]
// Similaridade: 2 artigos em comum → Usuários similares!

// Se Usuário A clicou em Artigo 7, recomendar para Usuário B
```

### 2.2. Matriz de Interações

```
        Artigo1  Artigo2  Artigo3  Artigo4  Artigo5
User1     1        0        1        0        1
User2     1        1        1        0        0
User3     0        1        0        1        1
User4     1        0        1        1        0
```

**1 = clicou, 0 = não clicou**

### 2.3. Cálculo de Similaridade entre Artigos

```javascript
// Similaridade entre Artigo1 e Artigo2:
// Quantos usuários clicaram em AMBOS?

// Artigo1: [User1, User2, User4] → 3 usuários
// Artigo2: [User2, User3] → 2 usuários
// Ambos: [User2] → 1 usuário

// Similaridade = 1 / sqrt(3 * 2) = 0.41
```

### 2.4. Score de Recomendação

```javascript
// Para recomendar Artigo X para Usuário Y:

// 1. Busca artigos que Usuário Y já clicou
const userArticles = [Artigo1, Artigo3, Artigo5];

// 2. Para cada artigo que Y clicou, busca similaridade com X
const similarities = [
  similarity(Artigo1, ArtigoX) = 0.8,
  similarity(Artigo3, ArtigoX) = 0.6,
  similarity(Artigo5, ArtigoX) = 0.4
];

// 3. Score = média ponderada (artigos mais recentes têm mais peso)
const score = weightedAverage(similarities, weights);
```

### 2.5. Implementação com LightFM

**Biblioteca:** `lightfm` (Python) ou `implicit` (Python)

```python
from lightfm import LightFM
from lightfm.datasets import fetch_movielens

# Treina modelo com interações
model = LightFM(loss='bpr')
model.fit(interactions, epochs=30)

# Gera recomendações
scores = model.predict(user_id, article_ids)
```

**Alternativa em JavaScript:** Implementar Item-Item CF manualmente (mais simples).

---

## 🔀 Parte 3: Sistema Híbrido

### Como Combinar os Dois

### 3.1. Geração de Candidatos

```javascript
async generateCandidates(userId, limit = 1000) {
  // 1. Content-Based: ~500 artigos
  const contentBased = await getContentBasedCandidates(userId, 500);
  
  // 2. Collaborative: ~500 artigos
  const collaborative = await getCollaborativeCandidates(userId, 500);
  
  // 3. Remove duplicados e junta
  const candidates = [...new Set([...contentBased, ...collaborative])];
  
  return candidates.slice(0, limit);
}
```

### 3.2. Ranking Final

```javascript
function calculateFinalScore(article, userProfile) {
  // 1. Score Content-Based (0 a 1)
  const contentScore = cosineSimilarity(
    article.embedding,
    userProfile.embedding
  );
  
  // 2. Score Collaborative (0 a 1)
  const collaborativeScore = getCollaborativeScore(article.id, userProfile.id);
  
  // 3. Frescor (quanto mais recente, melhor)
  const freshness = calculateFreshness(article.published_at);
  
  // 4. Popularidade (quantos cliques)
  const popularity = article.click_count / 1000; // Normalizado
  
  // 5. Diversidade (penaliza se já mostrou categoria recentemente)
  const diversity = calculateDiversity(article.category_id, userProfile.recentCategories);
  
  // Score final (pesos ajustáveis)
  const finalScore = 
    (contentScore * 0.4) +           // 40% conteúdo
    (collaborativeScore * 0.3) +      // 30% colaborativo
    (freshness * 0.15) +              // 15% frescor
    (popularity * 0.1) +              // 10% popularidade
    (diversity * 0.05);               // 5% diversidade
  
  return finalScore;
}
```

### 3.3. Ordenação e Diversidade

```javascript
// Ordena por score
candidates.sort((a, b) => b.score - a.score);

// Aplica diversidade: garante que não repete mesma categoria muito seguido
const diversified = applyDiversity(candidates, {
  maxSameCategoryInRow: 3,  // Máximo 3 da mesma categoria seguidos
  categoryDistribution: 0.3  // 30% de cada categoria preferida
});
```

---

## 📊 Fluxo Completo Detalhado

### Passo 1: Preparação

```javascript
async getForYouFeed(userId, limit = 50) {
  // 1. Busca perfil do usuário
  const userProfile = await getUserProfile(userId);
  
  // 2. Se usuário novo (sem interações), retorna feed cronológico
  if (!userProfile.hasInteractions) {
    return await getChronologicalFeed(limit);
  }
  
  // 3. Gera candidatos
  const candidates = await generateCandidates(userId, 1000);
  
  // 4. Calcula scores
  const scored = candidates.map(article => ({
    ...article,
    score: calculateFinalScore(article, userProfile)
  }));
  
  // 5. Ordena e aplica diversidade
  const ranked = applyRankingAndDiversity(scored);
  
  // 6. Retorna top N
  return ranked.slice(0, limit);
}
```

### Passo 2: Perfil do Usuário

```javascript
async getUserProfile(userId) {
  // 1. Busca interações recentes (últimos 100 cliques)
  const interactions = await UserInteraction.findRecent(userId, 100);
  
  // 2. Busca embeddings dos artigos interagidos
  const articleIds = interactions.map(i => i.article_id);
  const articles = await Article.findByIdsWithEmbeddings(articleIds);
  
  // 3. Calcula embedding médio (perfil)
  const embeddings = articles.map(a => a.embedding);
  const profileEmbedding = averageEmbeddings(embeddings);
  
  // 4. Busca categorias preferidas
  const preferences = await UserCategoryPreference.findByUserId(userId);
  
  // 5. Categorias recentes (para diversidade)
  const recentCategories = interactions
    .slice(0, 20)
    .map(i => i.article.category_id);
  
  return {
    userId,
    embedding: profileEmbedding,
    preferences,
    recentCategories,
    hasInteractions: interactions.length > 0
  };
}
```

### Passo 3: Content-Based Candidates

```javascript
async getContentBasedCandidates(userId, limit) {
  const userProfile = await getUserProfile(userId);
  
  // Busca artigos similares usando pgvector
  const query = `
    SELECT 
      a.*,
      1 - (a.embedding <=> $1::vector) as similarity
    FROM articles a
    WHERE a.category_id = ANY($2::int[])
      AND a.published_at > NOW() - INTERVAL '7 days'
      AND a.id NOT IN (
        SELECT article_id 
        FROM user_interactions 
        WHERE user_id = $3 AND interaction_type = 'click'
      )
    ORDER BY similarity DESC
    LIMIT $4
  `;
  
  const categoryIds = userProfile.preferences.map(p => p.category_id);
  const results = await db.query(query, [
    userProfile.embedding,
    categoryIds,
    userId,
    limit
  ]);
  
  return results.rows;
}
```

### Passo 4: Collaborative Candidates

```javascript
async getCollaborativeCandidates(userId, limit) {
  // 1. Busca artigos que o usuário clicou
  const userArticles = await UserInteraction.findClickedArticles(userId);
  
  // 2. Para cada artigo, busca artigos similares (Item-Item CF)
  const similarArticles = new Map();
  
  for (const article of userArticles) {
    // Busca artigos que usuários similares também clicaram
    const similar = await getSimilarArticles(article.id, 10);
    
    for (const sim of similar) {
      const currentScore = similarArticles.get(sim.id) || 0;
      similarArticles.set(sim.id, currentScore + sim.similarity);
    }
  }
  
  // 3. Ordena por score e retorna top N
  const sorted = Array.from(similarArticles.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  
  const articleIds = sorted.map(([id]) => id);
  return await Article.findByIds(articleIds);
}
```

### Passo 5: Similaridade entre Artigos (Item-Item)

```javascript
async getSimilarArticles(articleId, limit) {
  // Busca artigos que usuários que clicaram neste também clicaram
  const query = `
    WITH article_users AS (
      SELECT DISTINCT user_id
      FROM user_interactions
      WHERE article_id = $1 AND interaction_type = 'click'
    ),
    similar_articles AS (
      SELECT 
        ui.article_id,
        COUNT(DISTINCT ui.user_id) as common_users,
        COUNT(DISTINCT au.user_id) as total_users
      FROM user_interactions ui
      JOIN article_users au ON ui.user_id = au.user_id
      WHERE ui.article_id != $1
        AND ui.interaction_type = 'click'
      GROUP BY ui.article_id
    )
    SELECT 
      sa.article_id,
      (sa.common_users::float / sa.total_users) as similarity
    FROM similar_articles sa
    WHERE sa.common_users >= 2  -- Mínimo 2 usuários em comum
    ORDER BY similarity DESC
    LIMIT $2
  `;
  
  const results = await db.query(query, [articleId, limit]);
  return results.rows;
}
```

---

## 🎯 Exemplo Prático Completo

### Cenário

**Usuário:** João (id: 1)
**Histórico:** Clicou em 10 artigos sobre Fórmula 1 e Futebol

### Passo 1: Perfil do Usuário

```javascript
// Embeddings dos 10 artigos clicados:
// - "Hamilton vence GP": [0.2, -0.4, 0.6, ...]
// - "Verstappen pole": [0.25, -0.35, 0.65, ...]
// - "Flamengo vence": [0.1, 0.3, -0.2, ...]
// ...

// Perfil (média): [0.18, -0.15, 0.35, ...]

// Preferências:
// - Fórmula 1: score 0.9
// - Futebol: score 0.8
```

### Passo 2: Candidatos Content-Based

```javascript
// Busca artigos com embedding similar ao perfil
// Embeddings comparados são baseados APENAS em título + snippet
// Encontra:
// - "Leclerc conquista pole" + snippet sobre F1 → similarity 0.92 ✅
//   (título + snippet similar aos de F1 que João clicou)
// - "Brasil vence Badminton" + snippet sobre esporte → similarity 0.15 ❌
//   (título + snippet não similar ao perfil de João)
// - "Flamengo contrata" + snippet sobre futebol → similarity 0.78 ✅
//   (título + snippet similar aos de futebol que João clicou)
```

### Passo 3: Candidatos Collaborative

```javascript
// Usuários similares a João também clicaram em:
// - "Sainz vence corrida": 5 usuários similares ✅
// - "Palmeiras campeão": 3 usuários similares ✅
```

### Passo 4: Ranking Final

```javascript
// Artigos candidatos com scores:

1. "Leclerc conquista pole"
   - Content: 0.92
   - Collaborative: 0.65
   - Freshness: 0.95 (publicado há 2h)
   - Popularity: 0.8
   - Score Final: 0.85

2. "Sainz vence corrida"
   - Content: 0.75
   - Collaborative: 0.90
   - Freshness: 0.85 (publicado há 5h)
   - Popularity: 0.7
   - Score Final: 0.80

3. "Flamengo contrata"
   - Content: 0.78
   - Collaborative: 0.60
   - Freshness: 0.90 (publicado há 3h)
   - Popularity: 0.6
   - Score Final: 0.72
```

### Passo 5: Feed Final

```javascript
// Retorna top 50 ordenados:
[
  { id: 123, title: "Leclerc conquista pole", score: 0.85 },
  { id: 456, title: "Sainz vence corrida", score: 0.80 },
  { id: 789, title: "Flamengo contrata", score: 0.72 },
  ...
]
```

---

## 🛠️ Implementação Técnica

### Estrutura de Banco

#### Já Implementado ✅

```sql
-- Tabela categories (categorias dinâmicas)
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela articles (usa category_id FK)
-- Coluna `category` (string) foi REMOVIDA
ALTER TABLE articles ADD COLUMN category_id INTEGER REFERENCES categories(id);
CREATE INDEX idx_articles_category_id ON articles(category_id);

-- Tabela users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela user_category_preferences
CREATE TABLE user_category_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  preference_score FLOAT DEFAULT 0.5 CHECK (preference_score >= 0 AND preference_score <= 1),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, category_id)
);

-- Tabela user_interactions
CREATE TABLE user_interactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN ('click', 'view', 'scroll_stop', 'impression')),
  duration INTEGER,
  position INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Futuro (Fase 3+) - Embeddings

```sql
-- FUTURO: Tabela para armazenar embeddings (requer pgvector)
-- Executar: CREATE EXTENSION vector;
ALTER TABLE articles ADD COLUMN embedding vector(384);

-- Índice para busca vetorial eficiente
CREATE INDEX idx_articles_embedding ON articles 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Tabela de similaridade entre artigos (cache para Collaborative Filtering)
CREATE TABLE article_similarities (
  article_id_1 INTEGER REFERENCES articles(id),
  article_id_2 INTEGER REFERENCES articles(id),
  similarity FLOAT,
  common_users INTEGER,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (article_id_1, article_id_2)
);
```

### Serviço de Embeddings

```javascript
// services/embeddingService.js
import { pipeline } from '@xenova/transformers';

class EmbeddingService {
  constructor() {
    this.model = null;
  }

  async loadModel() {
    if (!this.model) {
      // Modelo multilíngue - entende português brasileiro
      this.model = await pipeline('feature-extraction', 
        'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
    }
    return this.model;
  }

  async generateEmbedding(text) {
    const model = await this.loadModel();
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }
  
  async generateArticleEmbedding(article) {
    // ⚠️ IMPORTANTE: Por padrão, usa APENAS título + snippet (summary)
    // Isso porque RSS só fornece título + snippet
    // 
    // FUTURO: Se implementarmos scraping de conteúdo completo,
    // podemos usar: `${article.title}. ${article.summary}. ${article.content}`
    // para embeddings mais precisos (mas ainda mostrar apenas título + snippet ao usuário)
    
    const text = `${article.title}. ${article.summary || ''}`;
    return await this.generateEmbedding(text);
  }

  // Gera embeddings em batch (mais eficiente para muitos artigos)
  async generateBatchEmbeddings(articles) {
    const texts = articles.map(a => `${a.title}. ${a.summary || ''}`);
    const model = await this.loadModel();
    
    const embeddings = [];
    for (const text of texts) {
      const output = await model(text, { pooling: 'mean', normalize: true });
      embeddings.push(Array.from(output.data));
    }
    
    return embeddings;
  }
}

export default new EmbeddingService();
```

### Serviço de Recomendação

```javascript
// services/recommendationService.js
class RecommendationService {
  async getForYouFeed(userId, limit = 50) {
    // Implementa todo o fluxo descrito acima
  }
  
  async updateUserProfile(userId) {
    // Recalcula perfil do usuário baseado em interações recentes
  }
  
  async updateArticleSimilarities(articleId) {
    // Recalcula similaridades quando novo artigo é criado
  }
}
```

---

## ⚡ Otimizações

### 1. Cache de Perfis

```javascript
// Cache perfil do usuário por 1 hora
const userProfile = await cache.get(`profile:${userId}`) || 
  await calculateUserProfile(userId);
await cache.set(`profile:${userId}`, userProfile, 3600);
```

### 2. Pré-cálculo de Similaridades

```javascript
// Calcula similaridades entre artigos em background
// Atualiza tabela article_similarities periodicamente
```

### 3. Limite de Candidatos

```javascript
// Gera apenas candidatos relevantes (similaridade > 0.3)
// Reduz processamento
```

### 4. Batch Processing

```javascript
// Processa recomendações em batch para múltiplos usuários
// Mais eficiente que processar um por vez
```

---

## 👁️ Implicit Feedback: Tracking de Comportamento

### O que é Implicit Feedback?

São interações que o usuário faz **sem clicar explicitamente**, mas que indicam interesse:

| Tipo | Exemplo | Peso |
|------|---------|------|
| **Click** | Clicou no artigo | ⭐⭐⭐⭐⭐ Alto |
| **Dwell Time** | Parou na notícia por X segundos | ⭐⭐⭐⭐ Médio-Alto |
| **Scroll Stop** | Scrollou e parou em uma notícia | ⭐⭐⭐ Médio |
| **Impression** | Notícia apareceu na tela | ⭐ Baixo |
| **Skip** | Passou rápido pela notícia | ❌ Negativo |

### Implementação no App

#### 1. Tracking de Impressões (Notícia apareceu na tela)

```typescript
// App: Quando notícia entra no viewport
const onArticleVisible = (articleId: string) => {
  // Registra que a notícia foi vista
  trackInteraction({
    article_id: articleId,
    interaction_type: 'impression',
    timestamp: Date.now()
  });
};

// Usar IntersectionObserver para detectar
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      onArticleVisible(entry.target.dataset.articleId);
    }
  });
}, { threshold: 0.5 }); // 50% visível
```

#### 2. Tracking de Dwell Time (Tempo parado na notícia)

```typescript
// App: Mede quanto tempo o usuário ficou com a notícia visível
const articleTimers = new Map<string, number>();

const onArticleEnterViewport = (articleId: string) => {
  articleTimers.set(articleId, Date.now());
};

const onArticleLeaveViewport = (articleId: string) => {
  const startTime = articleTimers.get(articleId);
  if (startTime) {
    const dwellTime = Date.now() - startTime;
    
    // Só registra se ficou mais de 2 segundos (evita scroll rápido)
    if (dwellTime > 2000) {
      trackInteraction({
        article_id: articleId,
        interaction_type: 'view',
        duration: dwellTime
      });
    }
    
    articleTimers.delete(articleId);
  }
};
```

#### 3. Tracking de Scroll Stop (Parou em uma notícia)

```typescript
// App: Detecta quando o usuário para de scrollar
let scrollTimeout: NodeJS.Timeout;
let lastVisibleArticle: string | null = null;

const onScroll = () => {
  clearTimeout(scrollTimeout);
  
  scrollTimeout = setTimeout(() => {
    // Usuário parou de scrollar por 1.5 segundos
    const visibleArticle = getArticleInCenter();
    
    if (visibleArticle && visibleArticle !== lastVisibleArticle) {
      trackInteraction({
        article_id: visibleArticle,
        interaction_type: 'scroll_stop',
        timestamp: Date.now()
      });
      lastVisibleArticle = visibleArticle;
    }
  }, 1500); // 1.5 segundos sem scroll
};

const getArticleInCenter = (): string | null => {
  const centerY = window.innerHeight / 2;
  const elements = document.elementsFromPoint(window.innerWidth / 2, centerY);
  const article = elements.find(el => el.dataset.articleId);
  return article?.dataset.articleId || null;
};
```

#### 4. Tracking de Click (Abriu o link externo)

```typescript
// App: Quando clica para abrir a notícia
const onArticleClick = (articleId: string) => {
  trackInteraction({
    article_id: articleId,
    interaction_type: 'click',
    timestamp: Date.now()
  });
};
```

### Envio para Backend

```typescript
// App: Envia interações em batch (não a cada interação)
class InteractionTracker {
  private queue: Interaction[] = [];
  private flushInterval = 30000; // 30 segundos

  constructor() {
    // Envia a cada 30 segundos
    setInterval(() => this.flush(), this.flushInterval);
    
    // Envia quando o app vai para background
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flush();
    });
  }

  track(interaction: Interaction) {
    this.queue.push(interaction);
    
    // Se acumulou muitas, envia imediatamente
    if (this.queue.length >= 20) {
      this.flush();
    }
  }

  async flush() {
    if (this.queue.length === 0) return;
    
    const interactions = [...this.queue];
    this.queue = [];
    
    try {
      await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactions })
      });
    } catch (error) {
      // Se falhar, volta para a fila
      this.queue = [...interactions, ...this.queue];
    }
  }
}
```

### Tabela de Interações (Implementada ✅)

```sql
-- Já criada em migrations/004_create_users_tables.sql
CREATE TABLE user_interactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN ('click', 'view', 'scroll_stop', 'impression')),
  duration INTEGER,                        -- tempo em ms (para 'view')
  position INTEGER,                        -- posição no feed quando viu
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para queries rápidas
CREATE INDEX idx_user_interactions_user_article ON user_interactions(user_id, article_id);
CREATE INDEX idx_user_interactions_type ON user_interactions(interaction_type);
CREATE INDEX idx_user_interactions_created_at ON user_interactions(created_at DESC);
```

### Como Usar no Algoritmo de Recomendação

#### Cálculo de Score de Interesse

```javascript
function calculateInterestScore(interactions) {
  let score = 0;
  
  for (const interaction of interactions) {
    switch (interaction.interaction_type) {
      case 'click':
        score += 1.0;  // Peso máximo
        break;
      case 'view':
        // Quanto mais tempo, maior o interesse
        const dwellScore = Math.min(interaction.duration / 10000, 0.8); // Max 0.8
        score += dwellScore;
        break;
      case 'scroll_stop':
        score += 0.3;  // Interesse médio
        break;
      case 'impression':
        score += 0.1;  // Interesse baixo
        break;
    }
  }
  
  return score;
}
```

#### Atualização de Preferências de Categoria

```javascript
async function updateCategoryPreferences(userId) {
  // Busca interações dos últimos 7 dias
  const interactions = await UserInteraction.findRecent(userId, 7);
  
  // Agrupa por categoria
  const categoryScores = new Map();
  
  for (const interaction of interactions) {
    const article = await Article.findById(interaction.article_id);
    const currentScore = categoryScores.get(article.category_id) || 0;
    const interactionScore = calculateInterestScore([interaction]);
    
    categoryScores.set(article.category_id, currentScore + interactionScore);
  }
  
  // Normaliza scores (0 a 1)
  const maxScore = Math.max(...categoryScores.values());
  
  for (const [categoryId, score] of categoryScores) {
    const normalizedScore = score / maxScore;
    
    await UserCategoryPreference.upsert({
      user_id: userId,
      category_id: categoryId,
      preference_score: normalizedScore
    });
  }
}
```

### Exemplo Prático

**Usuário João scrollou pelo feed:**

1. **Notícia A** (Fórmula 1) - impression (passou rápido)
2. **Notícia B** (Futebol) - scroll_stop + view (3s) (parou, leu título)
3. **Notícia C** (Política) - impression (passou rápido)
4. **Notícia D** (Fórmula 1) - scroll_stop + view (8s) + click (muito interessado!)
5. **Notícia E** (Economia) - impression (passou rápido)

**Cálculo de scores:**
- Fórmula 1: 0.1 (impression) + 0.3 + 0.8 + 1.0 (click) = **2.2** ⭐
- Futebol: 0.3 + 0.3 (view 3s) = **0.6**
- Política: 0.1 = **0.1**
- Economia: 0.1 = **0.1**

**Resultado:** Sistema aprende que João gosta muito de Fórmula 1!

---

## 📈 Métricas de Sucesso

### Como Medir se o Algoritmo Está Funcionando

1. **CTR (Click-Through Rate)**
   - % de artigos clicados no feed "For You"
   - Meta: > 5% (vs 2-3% em feed cronológico)

2. **Engagement**
   - Tempo médio no feed
   - Scroll depth
   - Artigos salvos

3. **Diversidade**
   - Quantas categorias diferentes o usuário vê
   - Meta: 3-5 categorias por sessão

4. **Freshness**
   - % de artigos com menos de 24h
   - Meta: > 60%

---

## 🚀 Roadmap de Implementação

### Fase 1: Estrutura Básica ✅ (IMPLEMENTADO)
- ✅ Categorias dinâmicas (Gemini classifica livremente)
- ✅ Tabela `categories` com normalização por slug
- ✅ `categoryService.js` para criar categorias automaticamente
- ✅ Tabelas de usuários (`users`, `user_category_preferences`, `user_interactions`)
- ✅ Models: `User.js`, `UserCategoryPreference.js`, `UserInteraction.js`
- ✅ `Article.js` usando `category_id` (FK)
- ✅ Feed cronológico com `category_id`

### Fase 2: Implicit Feedback ✅ (BACKEND IMPLEMENTADO)
- ✅ Endpoint `POST /api/interactions` para receber batch de interações
- ✅ Endpoint `POST /api/interactions/single` para interação única
- ✅ Endpoint `GET /api/interactions/user/:userId` para listar interações
- ✅ Endpoint `GET /api/interactions/user/:userId/stats` para estatísticas
- ✅ `interactionsController.js` com validação e processamento
- ✅ Atualização automática de preferências de categoria
- ✅ `recommendationService.js` com Feed "For You" básico
- ✅ Endpoint `GET /feeds/for-you?user_id=X` para feed personalizado
- ✅ Endpoint `GET /feeds/chronological` para feed cronológico
- [ ] **APP**: Implementar tracking de impressões (IntersectionObserver)
- [ ] **APP**: Implementar tracking de dwell time
- [ ] **APP**: Implementar tracking de scroll stop
- [ ] **APP**: Implementar envio em batch

### Fase 3: Content-Based (Embeddings) ✅ (COMPLETO)
- ✅ `embeddingService.js` com modelo multilíngue (`paraphrase-multilingual-MiniLM-L12-v2`)
- ✅ `@xenova/transformers` instalado
- ✅ Extensão `pgvector` habilitada no PostgreSQL
- ✅ Coluna `embedding vector(384)` adicionada em `articles`
- ✅ Tabela `article_similarities` criada
- ✅ Geração de embeddings integrada no `geminiClassifierService.js`
- ✅ Métodos em `Article.js`: `updateEmbedding`, `findSimilarByEmbedding`, `findEmbeddingsByIds`
- ✅ `recommendationService.js` usa embeddings para busca por similaridade
- ✅ Perfil do usuário calculado como média dos embeddings dos artigos clicados
- ✅ Script `generate-embeddings.js` para processar artigos existentes

### Fase 4: Collaborative Filtering
- [ ] Implementar Item-Item CF
- [ ] Tabela de similaridades entre artigos
- [ ] Cálculo de scores colaborativos

### Fase 5: Sistema Híbrido
- [ ] Combinar Content-Based + CF + Implicit Feedback
- [ ] Ranking final com pesos ajustáveis
- [ ] Diversidade e frescor
- [ ] Atualização dinâmica de preferências

### Fase 6: Otimizações
- [ ] Cache de perfis (Redis)
- [ ] Pré-cálculo de similaridades (background job)
- [ ] A/B testing para ajustar pesos
- [ ] Métricas de engagement em tempo real

---

## 📝 Resumo

**Algoritmo:** Híbrido (Content-Based + Collaborative Filtering)

**⚠️ IMPORTANTE:** Por padrão, o algoritmo trabalha **APENAS com título + snippet** de cada notícia. Isso porque:
- **RSS só fornece título + snippet** (limitação do formato)
- O usuário vê apenas título + snippet no feedcard
- A notícia completa é lida em site externo (não temos acesso)
- Embeddings são gerados apenas de título + snippet
- Perfil do usuário é baseado apenas nesses textos curtos

**FUTURO:** Podemos implementar scraping de conteúdo completo para melhorar embeddings (mais contexto = mais precisão), mas:
- Conteúdo completo seria usado **APENAS para embeddings**
- Usuário continuaria vendo apenas título + snippet
- Evita questões de direitos autorais

**Como funciona:**
1. Gera candidatos baseado em conteúdo similar (título + snippet) e comportamento de usuários similares
2. Calcula score combinando similaridade, frescor, popularidade e diversidade
3. Ordena e retorna top N artigos

**Vantagens:**
- ✅ Funciona para usuários novos (Content-Based)
- ✅ Aprende com comportamento (Collaborative)
- ✅ Combina o melhor dos dois mundos
- ✅ Modelo multilíngue (`paraphrase-multilingual-MiniLM-L12-v2`) entende português brasileiro
- ✅ Otimizado para textos curtos (título + snippet)

**Desafios:**
- ⚠️ Requer embeddings (processamento)
- ⚠️ Requer dados de interações (usuários precisam usar o app)
- ⚠️ Cold start (usuários novos precisam de fallback)
- ⚠️ Texto limitado (apenas título + snippet) pode reduzir precisão vs. conteúdo completo
  - **Solução futura:** Implementar scraping de conteúdo completo para embeddings (sem mostrar ao usuário)

---

**Status**: 📋 Documentação Completa - Pronto para Implementação

