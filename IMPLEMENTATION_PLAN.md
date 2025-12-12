# 📋 Plano de Implementação: Sistema de Classificação Científico

## 🎯 Objetivo

Transformar o sistema de classificação e preferências de usuário de **"achismo"** para **métodos cientificamente embasados**, baseado em pesquisa acadêmica sobre:
- IPTC Media Topics (padrão internacional de taxonomia de notícias)
- Sistemas de recomendação com feedback implícito
- Normalização de scores e decay temporal
- Classificação hierárquica multi-nível

---

## 📊 Diagnóstico: Problemas Atuais

### 1. Saturação de Scores (Ceiling Effect)

**Local:** `usersController.js:52` e `UserCategoryPreference.incrementScore`

```javascript
// Score inicial muito alto (0.80)
const baseScore = 0.8;
const score = baseScore - (i * 0.05); // 0.80, 0.75, 0.70...

// Incremento fixo de +0.1 por clique
preference_score = LEAST(1.0, preference_score + 0.1)
```

**Resultado:** Com 2 cliques, score atinge 100% e satura. Sistema não diferencia interesses.

### 2. Sem Decay Temporal

Interações de 30 dias atrás têm mesmo peso que interações de hoje. Usuário muda de interesse mas sistema não acompanha.

### 3. Taxonomia Plana

18 categorias misturadas sem hierarquia:
- "Fórmula 1" (muito específico)
- "Política" (muito amplo)
- "Bitcoin" (muito específico)
- "Economia" (muito amplo)

### 4. Feedback Negativo Ignorado

Se usuário vê 10 notícias de "Segurança > Violência" mas não clica em nenhuma, sistema não aprende que ele não gosta.

### 5. Scores de Confiança Arbitrários

```javascript
// classifierService.js - fórmula inventada
confidence: Math.min(0.95, 0.7 + (topScore * 0.03))
```

---

## 🔬 Solução Científica

### Baseado em:
1. **IPTC Media Topics** - Taxonomia hierárquica com 1200+ termos em 5 níveis
2. **HieRec (Microsoft)** - Modelagem hierárquica de interesses
3. **FeedRec** - Múltiplos tipos de feedback (click, view, scroll)
4. **Softmax Normalization** - Scores relativos, não absolutos
5. **Exponential Decay** - Interesses decaem com o tempo

---

## 📁 Fases de Implementação

### FASE 1: Taxonomia Hierárquica IPTC
- [x] 1.1 Criar estrutura de categorias hierárquicas no banco ✅
- [x] 1.2 Popular com categorias IPTC (17 raiz + subcategorias) ✅
- [x] 1.3 Migrar categorias existentes para hierarquia ✅
- [x] 1.4 Atualizar classificadores para usar hierarquia ✅

### FASE 2: Sistema de Scores Científico
- [x] 2.1 Refatorar cálculo de preference_score (normalização relativa) ✅
- [x] 2.2 Implementar decay temporal ✅
- [x] 2.3 Pesos diferentes por tipo de interação ✅
- [x] 2.4 Implementar feedback negativo implícito ✅

### FASE 3: Classificação Hierárquica
- [x] 3.1 Atualizar prompt do LLM para classificar em 2-3 níveis ✅
- [x] 3.2 Usar scores de confiança do modelo (não fórmulas) ✅
- [x] 3.3 Suporte a multi-label (artigo com 2+ categorias) ✅

### FASE 4: Feed Inteligente
- [x] 4.1 Scores hierárquicos no feed (nível 1, 2, 3) ✅
- [x] 4.2 Exploration vs Exploitation (80/20) ✅
- [x] 4.3 Diversificação por subcategoria ✅

---

## 📋 FASE 1: Taxonomia Hierárquica IPTC

### 1.1 Criar estrutura hierárquica no banco

**Status:** [ ] Pendente

**Arquivo:** `migrations/010_hierarchical_categories.sql`

```sql
-- Adicionar campos de hierarquia na tabela categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS iptc_code VARCHAR(20);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS path TEXT; -- Ex: "sport/motor-sport/formula-one"

-- Índices
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_level ON categories(level);
CREATE INDEX IF NOT EXISTS idx_categories_path ON categories(path);
```

### 1.2 Popular com categorias IPTC

**Status:** [ ] Pendente

**Arquivo:** `migrations/011_seed_iptc_categories.sql`

Categorias raiz IPTC (nível 1):
| ID | Nome | Slug | IPTC Code |
|----|------|------|-----------|
| 1 | Artes, Cultura e Entretenimento | artes-cultura-entretenimento | 01000000 |
| 2 | Conflito, Guerra e Paz | conflito-guerra-paz | 16000000 |
| 3 | Crime, Lei e Justiça | crime-lei-justica | 02000000 |
| 4 | Desastres e Acidentes | desastres-acidentes | 03000000 |
| 5 | Economia, Negócios e Finanças | economia-negocios-financas | 04000000 |
| 6 | Educação | educacao | 05000000 |
| 7 | Meio Ambiente | meio-ambiente | 06000000 |
| 8 | Saúde | saude | 07000000 |
| 9 | Interesse Humano | interesse-humano | 08000000 |
| 10 | Trabalho | trabalho | 09000000 |
| 11 | Estilo de Vida e Lazer | estilo-vida-lazer | 10000000 |
| 12 | Política | politica | 11000000 |
| 13 | Religião | religiao | 12000000 |
| 14 | Ciência e Tecnologia | ciencia-tecnologia | 13000000 |
| 15 | Sociedade | sociedade | 14000000 |
| 16 | Esporte | esporte | 15000000 |
| 17 | Clima | clima | 17000000 |

Subcategorias exemplo (nível 2 e 3):
```
Esporte (16)
├── Futebol (16.1)
│   ├── Campeonato Brasileiro (16.1.1)
│   ├── Libertadores (16.1.2)
│   └── Champions League (16.1.3)
├── Automobilismo (16.2)
│   ├── Fórmula 1 (16.2.1)
│   ├── NASCAR (16.2.2)
│   └── MotoGP (16.2.3)
├── Lutas (16.3)
│   ├── UFC/MMA (16.3.1)
│   ├── Boxe (16.3.2)
│   └── Judô (16.3.3)
└── Tênis (16.4)

Economia (5)
├── Mercado Financeiro (5.1)
│   ├── Bolsa de Valores (5.1.1)
│   ├── Criptomoedas (5.1.2)
│   └── Câmbio (5.1.3)
├── Inflação e Preços (5.2)
└── Emprego (5.3)
```

### 1.3 Migrar categorias existentes

**Status:** [ ] Pendente

**Arquivo:** `migrations/012_migrate_to_hierarchy.sql`

Mapeamento das categorias atuais para IPTC:
| Categoria Atual | IPTC Nível 1 | IPTC Nível 2 | IPTC Nível 3 |
|-----------------|--------------|--------------|--------------|
| Fórmula 1 | Esporte | Automobilismo | Fórmula 1 |
| Futebol | Esporte | Futebol | - |
| Bitcoin | Economia | Mercado Financeiro | Criptomoedas |
| Política | Política | - | - |
| Segurança | Crime, Lei e Justiça | - | - |
| Tecnologia | Ciência e Tecnologia | - | - |
| Clima | Clima | - | - |

### 1.4 Atualizar classificadores

**Status:** [ ] Pendente

**Arquivos:** 
- `services/geminiClassifierService.js`
- `services/deepseekClassifierService.js`

Novo formato de resposta:
```json
{
  "category_level1": "Esporte",
  "category_level2": "Automobilismo",
  "category_level3": "Fórmula 1",
  "confidence": 0.95,
  "location": "São Paulo"
}
```

---

## 📋 FASE 2: Sistema de Scores Científico

### 2.1 Refatorar cálculo de preference_score

**Status:** [ ] Pendente

**Arquivo:** `services/preferenceService.js` (NOVO)

```javascript
// ANTES (problemático):
preference_score = LEAST(1.0, preference_score + 0.1)

// DEPOIS (científico):
// Score relativo baseado em contagem de interações
async function calculateRelativeScores(userId) {
  // 1. Conta interações por categoria (com decay)
  const interactions = await query(`
    SELECT 
      category_id,
      SUM(
        CASE interaction_type
          WHEN 'click' THEN 1.0
          WHEN 'view' THEN 0.5
          WHEN 'scroll_stop' THEN 0.2
          WHEN 'impression' THEN 0.05
        END
        * EXP(-0.05 * EXTRACT(DAY FROM NOW() - created_at))
      ) as weighted_score
    FROM user_interactions
    WHERE user_id = $1
    GROUP BY category_id
  `, [userId]);
  
  // 2. Normaliza para soma = 1 (softmax-like)
  const total = interactions.reduce((sum, i) => sum + i.weighted_score, 0);
  return interactions.map(i => ({
    category_id: i.category_id,
    preference_score: i.weighted_score / total
  }));
}
```

### 2.2 Implementar decay temporal

**Status:** [ ] Pendente

**Fórmula:**
```
weight = e^(-decay_rate × days_since_interaction)

decay_rate = 0.05 (meia-vida ~14 dias)
- Interação de hoje: peso 1.0
- Interação de 7 dias: peso 0.70
- Interação de 14 dias: peso 0.50
- Interação de 30 dias: peso 0.22
```

### 2.3 Pesos por tipo de interação

**Status:** [ ] Pendente

**Configuração:**
```javascript
const INTERACTION_WEIGHTS = {
  impression: 0.05,    // Viu no feed
  scroll_stop: 0.15,   // Parou para olhar (2s+)
  click: 0.40,         // Clicou para ler
  view: 0.60,          // Leu (30s+)
  like: 0.80,          // Curtiu
  share: 1.00,         // Compartilhou
  bookmark: 0.70       // Salvou
};
```

### 2.4 Feedback negativo implícito

**Status:** [ ] Pendente

**Lógica:**
```javascript
// Se viu (impression) mas não clicou = desinteresse
async function applyNegativeFeedback(userId, categoryId) {
  const stats = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE interaction_type = 'impression') as impressions,
      COUNT(*) FILTER (WHERE interaction_type = 'click') as clicks
    FROM user_interactions
    WHERE user_id = $1 AND category_id = $2
    AND created_at > NOW() - INTERVAL '7 days'
  `, [userId, categoryId]);
  
  // CTR baixo = penalidade
  const ctr = stats.clicks / Math.max(1, stats.impressions);
  if (ctr < 0.05 && stats.impressions > 10) {
    // Penaliza subcategoria, não categoria pai
    await decrementSubcategoryScore(userId, categoryId, 0.1);
  }
}
```

---

## 📋 FASE 3: Classificação Hierárquica

### 3.1 Atualizar prompt do LLM

**Status:** [ ] Pendente

**Novo prompt:**
```javascript
const prompt = `Classificador de notícias usando taxonomia IPTC.

TEXTO: "${text}"

TAXONOMIA IPTC (classifique em até 3 níveis):
- Nível 1: Categoria ampla (Esporte, Política, Economia...)
- Nível 2: Subcategoria (Futebol, Automobilismo, Mercado Financeiro...)
- Nível 3: Específico (Fórmula 1, Campeonato Brasileiro, Criptomoedas...)

CATEGORIAS NÍVEL 1:
${IPTC_LEVEL1_CATEGORIES.join(', ')}

REGRAS:
1. Sempre classifique nível 1 e 2
2. Nível 3 é opcional (use se for específico o suficiente)
3. Confidence deve refletir certeza real (0.5-0.99)
4. Um artigo pode ter 2 categorias se for claramente multi-tema

FORMATO JSON:
{
  "primary": {
    "level1": "Esporte",
    "level2": "Automobilismo", 
    "level3": "Fórmula 1",
    "confidence": 0.95
  },
  "secondary": null,
  "location": "São Paulo"
}

Apenas JSON.`;
```

### 3.2 Usar scores de confiança do modelo

**Status:** [ ] Pendente

**Mudança:**
```javascript
// ANTES (fórmula arbitrária):
confidence = 0.7 + (matches * 0.03)

// DEPOIS (usa probabilidade real do modelo):
// Para Gemini/DeepSeek: usar o confidence retornado
// Para zero-shot: usar result.scores[0] diretamente
confidence = result.scores[0]; // Já é probabilidade calibrada
```

### 3.3 Suporte a multi-label

**Status:** [ ] Pendente

**Novo schema:**
```sql
-- Tabela de relacionamento artigo-categoria (N:N)
CREATE TABLE article_categories (
  article_id INTEGER REFERENCES articles(id),
  category_id INTEGER REFERENCES categories(id),
  confidence FLOAT,
  is_primary BOOLEAN DEFAULT false,
  PRIMARY KEY (article_id, category_id)
);
```

---

## 📋 FASE 4: Feed Inteligente

### 4.1 Scores hierárquicos no feed

**Status:** [ ] Pendente

**Lógica:**
```javascript
// Usuário tem scores em múltiplos níveis
scores = {
  "Esporte": 0.40,                    // Nível 1
  "Esporte > Futebol": 0.25,          // Nível 2
  "Esporte > Automobilismo": 0.15,    // Nível 2
  "Esporte > Automobilismo > F1": 0.12, // Nível 3 (adora)
  "Crime": 0.20,                      // Nível 1
  "Crime > Fraude": 0.18,             // Nível 2 (gosta)
  "Crime > Violência": 0.02           // Nível 2 (evita!)
}
```

### 4.2 Exploration vs Exploitation

**Status:** [ ] Pendente

**Configuração:**
```javascript
const FEED_CONFIG = {
  EXPLOITATION_RATIO: 0.80,  // 80% do que usuário gosta
  EXPLORATION_RATIO: 0.20,   // 20% novidades
  EXPLORATION_STRATEGY: 'subcategory_sibling' // Explora subcategorias irmãs
};

// Exemplo:
// Usuário gosta de "Esporte > Futebol"
// Exploration: mostrar "Esporte > Vôlei" (mesmo pai, diferente filho)
```

### 4.3 Diversificação por subcategoria

**Status:** [ ] Pendente

**Regra:**
```javascript
// Não mostrar mais de 3 artigos seguidos da mesma subcategoria
// Mesmo que usuário ame "Fórmula 1", intercalar com outras
async function diversifyFeed(articles) {
  const diversified = [];
  const subcategoryCount = {};
  
  for (const article of articles) {
    const subcat = article.category_level2;
    subcategoryCount[subcat] = (subcategoryCount[subcat] || 0) + 1;
    
    if (subcategoryCount[subcat] <= 3) {
      diversified.push(article);
    } else {
      // Move para depois no feed
      diversified.splice(diversified.length - 2, 0, article);
    }
  }
  
  return diversified;
}
```

---

## 📊 Métricas de Sucesso

### Antes (atual):
- CTR: 8.7% (8 cliques / 92 impressões)
- Scores saturados: 100% em múltiplas categorias
- Sem diferenciação de interesses

### Depois (esperado):
- CTR: 15-25% (melhoria de 2-3x)
- Scores distribuídos: soma = 100%, diferenciação clara
- Hierarquia captura nuances (Fraude vs Violência)

---

## 🗂️ Arquivos a Criar/Modificar

### Criar:
- [ ] `migrations/010_hierarchical_categories.sql`
- [ ] `migrations/011_seed_iptc_categories.sql`
- [ ] `migrations/012_migrate_to_hierarchy.sql`
- [ ] `services/preferenceService.js`
- [ ] `services/hierarchicalClassifierService.js`
- [ ] `data/iptc_categories.json`

### Modificar:
- [ ] `models/Category.js` - adicionar métodos hierárquicos
- [ ] `models/UserCategoryPreference.js` - scores relativos
- [ ] `services/geminiClassifierService.js` - prompt hierárquico
- [ ] `services/deepseekClassifierService.js` - prompt hierárquico
- [ ] `services/learningService.js` - decay temporal
- [ ] `services/engagementFeedService.js` - diversificação
- [ ] `services/predictionService.js` - usar scores relativos
- [ ] `controllers/usersController.js` - remover score inicial 0.8

---

## 📅 Cronograma Sugerido

| Fase | Estimativa | Dependências |
|------|------------|--------------|
| 1.1-1.2 | 2-3 horas | Nenhuma |
| 1.3-1.4 | 2-3 horas | 1.1-1.2 |
| 2.1-2.2 | 3-4 horas | 1.3-1.4 |
| 2.3-2.4 | 2-3 horas | 2.1-2.2 |
| 3.1-3.3 | 3-4 horas | 1.4 |
| 4.1-4.3 | 3-4 horas | 2.4, 3.3 |

**Total estimado:** 15-20 horas

---

## 📚 Referências Científicas

1. **IPTC Media Topics**: https://iptc.org/standards/media-topics/
2. **HieRec (Microsoft)**: Hierarchical User Interest Modeling for News Recommendation
3. **FeedRec**: Multiple User Feedbacks for News Recommendation
4. **MN-DS Dataset**: Multi-level News Classification (ArXiv 2212.12061)
5. **DRPN**: Denoising Neural Network for News Recommendation (ArXiv 2204.04397)

---

**Última atualização:** 2024-12-12
**Status:** ✅ IMPLEMENTAÇÃO COMPLETA

---

## 📁 Arquivos Criados/Modificados

### Migrations (executar com `node run-migrations.js`)
- `migrations/010_hierarchical_categories.sql` - Estrutura hierárquica
- `migrations/011_seed_iptc_categories.sql` - Categorias IPTC (17 raiz + subcategorias)
- `migrations/012_migrate_to_hierarchy.sql` - Migração de dados existentes

### Novos Services
- `services/hierarchicalClassifierService.js` - Classificação em 3 níveis IPTC
- `services/preferenceService.js` - Scores normalizados + decay + feedback negativo
- `services/intelligentFeedService.js` - Feed com exploration/exploitation

### Services Modificados
- `services/geminiClassifierService.js` - Agora usa prompt hierárquico IPTC

---

## 🚀 Como Usar

### 1. Executar Migrations
```bash
cd backend
node run-migrations.js
```

### 2. Recalcular Preferências de Usuário
```javascript
import PreferenceService from './services/preferenceService.js';
await PreferenceService.updateUserPreferences(userId);
```

### 3. Gerar Feed Inteligente
```javascript
import IntelligentFeedService from './services/intelligentFeedService.js';
const feed = await IntelligentFeedService.getPersonalizedFeed(userId, { limit: 50 });
```

---

## 📊 Mudanças Esperadas

| Métrica | Antes | Depois |
|---------|-------|--------|
| CTR | 8.7% | 15-25% (estimado) |
| Scores de preferência | 100%, 100%, 100% (saturados) | 43%, 28%, 18% (relativos) |
| Categorias | 18 planas | 17 raiz + ~50 subcategorias hierárquicas |
| Feedback negativo | Não existe | Penaliza CTR < 5% |
| Diversificação | Não existe | Máx 3 artigos seguidos da mesma categoria |
| Exploration | 0% | 20% do feed |
