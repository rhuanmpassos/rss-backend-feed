# 📔 Diário de Correções do Algoritmo de Recomendação

**Data de início:** 2024-12-12
**Objetivo:** Corrigir 8 problemas identificados na análise científica

---

## 📋 CHECKLIST DE PROBLEMAS

| # | Prioridade | Problema | Arquivo | Status |
|---|------------|----------|---------|--------|
| 1 | 🔴 CRÍTICO | Sistema dual de preferências | `predictionService.js` | ✅ CONCLUÍDO |
| 2 | 🔴 CRÍTICO | incrementScore() causa saturação | `UserCategoryPreference.js` | ✅ CONCLUÍDO |
| 3 | 🟠 ALTO | Cold start não normalizado | `usersController.js` | ✅ CONCLUÍDO |
| 4 | 🟠 ALTO | Exploration ignora feedback negativo | `engagementFeedService.js` | ✅ CONCLUÍDO |
| 5 | 🟡 MÉDIO | Propagação para pais invertida | `preferenceService.js` | ✅ CONCLUÍDO |
| 6 | 🟡 MÉDIO | Pesos click vs view | `preferenceService.js` | ✅ CONCLUÍDO |
| 7 | 🟡 MÉDIO | Feedback negativo fraco | `preferenceService.js` | ✅ CONCLUÍDO |
| 8 | 🟢 BAIXO | Decay único para tudo | `preferenceService.js` | ✅ CONCLUÍDO |

---

## 🎯 REGRAS DO DIÁRIO

1. **Antes de cada correção:** Verificar qual problema estou resolvendo
2. **Durante:** Não adicionar funcionalidades extras - apenas corrigir o problema específico
3. **Depois:** Marcar como concluído e documentar o que foi feito
4. **Sempre:** Manter consistência com o sistema existente

---

## 📝 LOG DE IMPLEMENTAÇÃO

### [PROBLEMA 1] Sistema dual de preferências
**Status:** ✅ CONCLUÍDO
**Arquivo:** `src/services/predictionService.js`
**Objetivo:** Mudar de `user_category_preferences` para `user_hierarchical_preferences`
**O que foi feito:** Linha 141-144 alterada para usar `user_hierarchical_preferences`
**Resultado:** predictionService agora usa os mesmos dados que preferenceService

---

### [PROBLEMA 2] incrementScore() causa saturação
**Status:** ✅ CONCLUÍDO
**Arquivo:** `src/models/UserCategoryPreference.js`
**Objetivo:** Deprecar método incrementScore() que usa LEAST(1.0, score + 0.1)
**O que foi feito:** 
- incrementScore() marcado como @deprecated com console.warn
- decrementScore() também marcado como @deprecated
- Ambos mantêm funcionamento para retrocompatibilidade, mas alertam para usar PreferenceService

---

### [PROBLEMA 3] Cold start não normalizado
**Status:** ✅ CONCLUÍDO
**Arquivo:** `src/controllers/usersController.js`
**Objetivo:** Normalizar scores iniciais para somar 1.0 (atualmente soma 4.05)
**O que foi feito:**
- Método `create`: Scores agora usam pesos relativos normalizados
- Método `updatePreferences`: Mesma correção aplicada
- Exemplo com 4 categorias: 0.40, 0.30, 0.20, 0.10 (soma=1.0) ✅

---

### [PROBLEMA 4] Exploration ignora feedback negativo
**Status:** ✅ CONCLUÍDO
**Arquivo:** `src/services/engagementFeedService.js`
**Objetivo:** Filtrar categorias com CTR baixo na exploration
**O que foi feito:**
- Adicionado CTE `negative_feedback_categories` que identifica categorias com CTR < 5%
- Filtro adicionado para excluir essas categorias dos resultados de exploration
- Agora usuário não verá mais categorias que ele consistentemente ignora

---

### [PROBLEMA 5] Propagação para pais invertida
**Status:** ✅ CONCLUÍDO
**Arquivo:** `src/services/preferenceService.js`
**Objetivo:** Corrigir fórmula que faz pai ter score maior que filhos
**O que foi feito:**
- Antes: `avgScore * 1.2` (multiplicador!) limitado a 0.3
- Agora: `min(avgScore * 0.5, maxChild * 0.8)` (fração!)
- Pai agora é sempre MENOR que filhos ✅

---

### [PROBLEMA 6] Pesos click vs view
**Status:** ✅ CONCLUÍDO
**Arquivo:** `src/services/preferenceService.js`
**Objetivo:** Ajustar pesos - click (0.40) está menor que view (0.60)
**O que foi feito:**
- Antes: click=0.40, view=0.60 (invertido!)
- Agora: click=0.50, view=0.30 (click é ação explícita, mais importante)
- Click indica DECISÃO, view indica TEMPO de engajamento

---

### [PROBLEMA 7] Feedback negativo fraco
**Status:** ✅ CONCLUÍDO
**Arquivo:** `src/services/preferenceService.js`
**Objetivo:** Fortalecer penalidade de CTR baixo (atualmente 0.1 fixo)
**O que foi feito:**
- Configuração: basePenalty=0.10, maxPenalty=0.25, minScore=0.005
- Penalidade agora é PROPORCIONAL: severityRatio = 1 - (ctr / threshold)
- Exemplo: CTR 0% → penalidade 0.25, CTR 4% → penalidade 0.13
- minScore de 0.005 permite quase zerar categorias muito rejeitadas

---

### [PROBLEMA 8] Decay único para tudo
**Status:** ✅ CONCLUÍDO
**Arquivo:** `src/services/preferenceService.js`
**Objetivo:** Implementar decay diferenciado por nível de categoria
**O que foi feito:**
- Configuração: rateByLevel com rates diferentes por nível
- Nível 1 (Esporte, Política): rate=0.015 (~46 dias half-life) - estável
- Nível 2 (Futebol, Automobilismo): rate=0.03 (~23 dias half-life) - médio
- Nível 3 (F1, Brasileirão): rate=0.05 (~14 dias half-life) - flutuante
- Query atualizada com CASE para aplicar rate correto

---

## ✅ IMPLEMENTAÇÃO COMPLETA

**Data de conclusão:** 2024-12-12
**Todos os 8 problemas foram corrigidos com sucesso!**

### Resumo das Mudanças:
1. ✅ predictionService agora usa user_hierarchical_preferences
2. ✅ incrementScore/decrementScore marcados como @deprecated
3. ✅ Cold start com scores normalizados (soma = 1.0)
4. ✅ Exploration filtra categorias com CTR baixo
5. ✅ Propagação para pais: pai < filhos sempre
6. ✅ Pesos ajustados: click=0.50 > view=0.30
7. ✅ Feedback negativo proporcional: 0.10 a 0.25
8. ✅ Decay diferenciado: nível 1 lento, nível 3 rápido


