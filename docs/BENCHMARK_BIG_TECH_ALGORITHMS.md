# 🔬 Benchmark: Nosso Algoritmo vs Big Tech

**Data:** 2024-12-12
**Objetivo:** Comparar nosso sistema com TikTok, Facebook, YouTube, Instagram e identificar melhorias

---

## 📊 Comparação de Sinais de Engajamento

### O que cada plataforma usa:

| Sinal | TikTok | Facebook | YouTube | Instagram | **Nós** |
|-------|--------|----------|---------|-----------|---------|
| Click | ✅ | ✅ | ✅ | ✅ | ✅ 0.50 |
| View/Dwell Time | ✅ | ✅ | ✅ | ✅ | ✅ 0.30 |
| **Completion Rate** | ⭐ Principal | ✅ | ⭐ Principal | ✅ | ❌ **NÃO TEMOS** |
| **Replay/Revisit** | ⭐ Muito forte | ✅ | ✅ | ✅ | ❌ **NÃO TEMOS** |
| Like | ✅ | ✅ | ✅ | ✅ | ✅ 0.80 |
| Share | ⭐ Mais forte | ✅ | ✅ | ✅ | ✅ 1.00 |
| Comment | ✅ Forte | ✅ | ✅ | ✅ | ❌ N/A (externo) |
| Bookmark/Save | ✅ | ✅ | ✅ Watch Later | ✅ Save | ✅ 0.70 |
| Impression | ✅ | ✅ | ✅ | ✅ | ✅ 0.05 |
| Scroll Stop | ✅ | ✅ | ❌ | ✅ | ✅ 0.15 |
| **Speed of Engagement** | ✅ | ✅ | ❌ | ✅ | ❌ **NÃO TEMOS** |
| **Negative Feedback** | ✅ "Não interessado" | ⭐ -74x a -369x | ✅ | ✅ | ⚠️ Implícito apenas |
| **Session Duration** | ⭐ Principal | ✅ | ⭐ Principal | ✅ | ❌ **NÃO TEMOS** |

---

## 🎯 O QUE AS BIG TECHS FAZEM QUE NÓS NÃO FAZEMOS

### 1. 📈 COMPLETION RATE (TikTok/YouTube - PRINCIPAL SINAL!)

**Como funciona:**
- TikTok: Vídeos com >80% de completion viralizam
- YouTube: Watch time é o proxy de satisfação (#1 fator)
- Fórmula: `completion_rate = tempo_lendo / tempo_esperado_leitura`

**Por que é importante:**
- Click alto + completion baixo = **CLICKBAIT** (penalizar!)
- Click baixo + completion alto = conteúdo de nicho valioso
- Mede SATISFAÇÃO real, não apenas curiosidade

**Como implementar para notícias:**
```javascript
// Estimar tempo de leitura baseado no tamanho do artigo
const wordsPerMinute = 200; // Média de leitura
const estimatedReadTime = (article.wordCount / wordsPerMinute) * 60 * 1000; // ms

// Calcular completion rate
const completionRate = Math.min(1.0, viewDuration / estimatedReadTime);

// Anti-clickbait: penalizar alto CTR com baixo completion
const qualityScore = clickWeight * completionRate;
```

**Impacto esperado:** Evita saturação de categorias com títulos chamativos mas conteúdo ruim.

---

### 2. 🔄 REPLAY/REVISIT SIGNALS (TikTok - MUITO FORTE)

**Como funciona:**
- TikTok: Replay = "isso é tão bom que quero ver de novo"
- Peso muito maior que um único view
- Indica conteúdo de alta qualidade

**Como implementar:**
```javascript
// Detectar se usuário voltou ao mesmo artigo
const revisitWeight = {
  first_view: 0.30,
  revisit_same_day: 0.60,    // Voltou no mesmo dia
  revisit_next_day: 0.80,    // Voltou no dia seguinte (lembrou!)
  shared_after_revisit: 1.20  // Revisitou E compartilhou
};
```

**Impacto esperado:** Identificar artigos "memoráveis" que o usuário gostou de verdade.

---

### 3. ⚡ SPEED OF ENGAGEMENT (Instagram/Facebook)

**Como funciona:**
- Instagram: Quão rápido o usuário engaja após ver = interesse genuíno
- Clique rápido (<3s) = título muito atrativo
- Clique demorado (>10s) = precisou pensar, talvez forçado

**Como implementar:**
```javascript
// Tempo entre impression e click
const timeToClick = clickTimestamp - impressionTimestamp;

// Pesos por velocidade
const speedWeight = 
  timeToClick < 2000 ? 1.2 :   // <2s = muito interessado
  timeToClick < 5000 ? 1.0 :   // 2-5s = normal
  timeToClick < 15000 ? 0.9 :  // 5-15s = hesitou
  0.7;                          // >15s = clicou por falta de opção
```

**Impacto esperado:** Diferenciar interesse genuíno de "cliquei porque não tinha outra coisa".

---

### 4. 👎 NEGATIVE FEEDBACK EXPLÍCITO (Facebook/Twitter - PESADÍSSIMO)

**Como funciona (Twitter/X):**
| Ação | Peso |
|------|------|
| Report | -369x |
| Block | -74x |
| Mute | -74x |
| "Not Interested" | -20x |

**Nosso sistema atual:**
- Apenas feedback negativo IMPLÍCITO (CTR baixo)
- Penalidade máxima de -0.25 (muito fraco comparado!)

**Como implementar:**
```javascript
// Adicionar botão "Não tenho interesse" no app
const EXPLICIT_NEGATIVE_WEIGHTS = {
  not_interested: -5.0,        // "Não tenho interesse nesse assunto"
  not_this_source: -3.0,       // "Não gosto dessa fonte"
  already_read: -0.5,          // "Já li isso em outro lugar"
  clickbait: -10.0,            // "Título enganoso" (penaliza fonte)
  offensive: -20.0             // "Conteúdo ofensivo" (reportar)
};
```

**Impacto esperado:** Aprendizado MUITO mais rápido sobre desinteresses.

---

### 5. ⏱️ SESSION DURATION (YouTube - PRINCIPAL MÉTRICA)

**Como funciona:**
- YouTube otimiza para tempo TOTAL na plataforma
- Não apenas engajamento individual, mas "ele ficou mais tempo?"
- Recompensa conteúdo que leva a mais conteúdo

**Como implementar:**
```javascript
// Ao iniciar sessão
const sessionStart = Date.now();

// Ao final da sessão, calcular contribuição de cada artigo
for (const article of sessionArticles) {
  // Artigos que mantiveram usuário na plataforma ganham bonus
  const sessionContribution = article.viewDuration / totalSessionDuration;
  article.sessionBonus = sessionContribution > 0.1 ? 1.2 : 1.0;
}
```

**Impacto esperado:** Otimizar para retenção, não apenas cliques individuais.

---

### 6. 🎲 SERENDIPITY CONTROLADA (Pesquisa acadêmica)

**Como funciona:**
- Não é só exploration (20%)
- É conteúdo **inesperado mas relevante**
- Quebra filter bubbles sem alienar usuário

**Nosso sistema atual:**
- Exploration: 20% de categorias irmãs
- Problema: Ainda é previsível (mesmo pai = similar)

**Como melhorar:**
```javascript
// Serendipity: conteúdo DIFERENTE mas com CONEXÃO
const serendipityStrategies = [
  // 1. Trending em categoria nova (popularidade como proxy de qualidade)
  'trending_new_category',
  
  // 2. Mesmo autor/fonte de artigo que gostou, categoria diferente
  'same_source_different_topic',
  
  // 3. Artigo relacionado por embedding, categoria diferente
  'semantic_bridge',
  
  // 4. "Pessoas como você também leram" (collaborative filtering)
  'similar_users_different_taste'
];

// Forçar 5% de serendipity REAL (não apenas exploration)
const feedComposition = {
  exploitation: 0.75,    // 75% baseado em preferências
  exploration: 0.15,     // 15% categorias irmãs
  serendipity: 0.10      // 10% conteúdo inesperado mas relevante
};
```

**Impacto esperado:** Usuário descobre novos interesses sem ficar preso em bolha.

---

## 🏆 RANKING DE PRIORIDADE DE IMPLEMENTAÇÃO

| # | Melhoria | Dificuldade | Impacto | Prioridade |
|---|----------|-------------|---------|------------|
| 1 | **Completion Rate** | Média | ⭐⭐⭐⭐⭐ | 🔴 URGENTE |
| 2 | **Negative Feedback Explícito** | Baixa | ⭐⭐⭐⭐⭐ | 🔴 URGENTE |
| 3 | **Replay/Revisit** | Baixa | ⭐⭐⭐⭐ | 🟠 ALTA |
| 4 | **Session Duration** | Média | ⭐⭐⭐⭐ | 🟠 ALTA |
| 5 | **Speed of Engagement** | Baixa | ⭐⭐⭐ | 🟡 MÉDIA |
| 6 | **Anti-Clickbait Score** | Média | ⭐⭐⭐⭐ | 🟡 MÉDIA |
| 7 | **Serendipity Real** | Alta | ⭐⭐⭐ | 🟢 BAIXA |

---

## 📋 MUDANÇAS NO BANCO DE DADOS NECESSÁRIAS

```sql
-- 1. Adicionar completion_rate na tabela de interações
ALTER TABLE user_interactions ADD COLUMN completion_rate FLOAT;
ALTER TABLE user_interactions ADD COLUMN estimated_read_time INTEGER; -- ms
ALTER TABLE user_interactions ADD COLUMN time_to_click INTEGER; -- ms desde impression

-- 2. Tabela de feedback negativo explícito
CREATE TABLE user_negative_feedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  article_id INTEGER REFERENCES articles(id),
  feedback_type VARCHAR(50), -- 'not_interested', 'clickbait', 'offensive', etc
  category_id INTEGER REFERENCES categories(id), -- Para penalizar categoria
  source_id INTEGER REFERENCES sites(id), -- Para penalizar fonte
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Adicionar word_count nos artigos (para calcular completion rate)
ALTER TABLE articles ADD COLUMN word_count INTEGER;

-- 4. Tabela de sessões para medir session duration
-- (já existe user_sessions, mas adicionar métricas)
ALTER TABLE user_sessions ADD COLUMN articles_viewed INTEGER DEFAULT 0;
ALTER TABLE user_sessions ADD COLUMN total_read_time INTEGER DEFAULT 0;
```

---

## 🎯 CONFIGURAÇÃO PROPOSTA (Baseado em Big Tech)

```javascript
// INTERACTION_WEIGHTS atualizado com insights de Big Tech
const INTERACTION_WEIGHTS_V2 = {
  // Básicos (mantidos)
  impression: 0.05,
  scroll_stop: 0.15,
  
  // Click agora considera completion
  click: {
    base: 0.40,
    // Multiplicador por completion rate
    withCompletion: (completionRate) => 0.40 + (completionRate * 0.30)
    // Click + 100% completion = 0.70
    // Click + 50% completion = 0.55
    // Click + 0% completion = 0.40 (clickbait penalty implícito)
  },
  
  view: 0.30,
  
  // NOVO: Revisit
  revisit: {
    same_session: 0.20,
    same_day: 0.40,
    next_day: 0.60,
    after_share: 0.80
  },
  
  bookmark: 0.70,
  like: 0.80,
  share: 1.00,
  
  // NOVO: Negative feedback (aplicado na categoria/fonte)
  negative: {
    not_interested: -5.0,
    clickbait: -10.0,
    offensive: -20.0
  }
};

// Decay atualizado com session awareness
const DECAY_CONFIG_V2 = {
  rateByLevel: {
    1: 0.015,   // ~46 dias
    2: 0.03,    // ~23 dias  
    3: 0.05     // ~14 dias
  },
  // NOVO: Boost para interações em sessões longas
  sessionBonus: {
    shortSession: 1.0,      // <5min
    mediumSession: 1.1,     // 5-15min
    longSession: 1.2        // >15min
  }
};
```

---

## 📚 Referências

1. **TikTok Algorithm Analysis** - Chen & Shi, 2024
2. **YouTube Deep Neural Networks for Recommendations** - Google Research
3. **Facebook EdgeRank Evolution** - Social Media Today
4. **Instagram Explore Ranking** - Hootsuite Blog, 2024
5. **Cold Start Problem Best Practices** - FreeCodeCamp
6. **Filter Bubble Mitigation** - arXiv:2402.03801
7. **Twitter/X Algorithm Weights** - StealWhatWorks

---

## ✅ PRÓXIMOS PASSOS

1. [ ] Implementar tracking de completion rate no app
2. [ ] Adicionar botão "Não tenho interesse" no app
3. [ ] Detectar revisits no backend
4. [ ] Implementar session duration tracking
5. [ ] Criar anti-clickbait score
6. [ ] Adicionar serendipity real ao feed


