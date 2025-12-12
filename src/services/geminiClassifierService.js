/**
 * Gemini Classifier Service - Classificação Hierárquica IPTC
 * Usa taxonomia IPTC Media Topics para classificação em até 3 níveis
 * Suporta multi-label (artigo pode pertencer a múltiplas categorias)
 * 
 * ATUALIZADO: Agora usa HierarchicalClassifierService para classificação científica
 */

import axios from 'axios';
import Article from '../models/Article.js';
import CategoryService from './categoryService.js';
import HierarchicalClassifierService from './hierarchicalClassifierService.js';
import EmbeddingService from './embeddingService.js';
import sseManager from './sseManager.js';
import dotenv from 'dotenv';

dotenv.config();

// Estados brasileiros (para contexto de localização)
const BRAZILIAN_STATES = [
  'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal',
  'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul',
  'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí',
  'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia',
  'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'
];

const VERTEX_URL = 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash-lite:streamGenerateContent';

// Flag para usar classificação hierárquica (pode ser desabilitado para fallback)
const USE_HIERARCHICAL = true;

// Delay entre requests (em ms) - ajuste conforme tier
const REQUEST_DELAY = 1000; // 1 segundo entre requests
const RATE_LIMIT_DELAY = 60000; // 1 minuto se rate limited

const GeminiClassifierService = {
  /**
   * Classifica um artigo usando Gemini via Vertex AI
   * NOVO: Usa classificação hierárquica IPTC com 3 níveis
   * Retorna null se não conseguir (rate limit) - artigo fica sem categoria para tentar depois
   */
  async classifyArticle(title, summary = '') {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY não configurada!');
      return null;
    }

    const text = summary ? `${title}. ${summary}` : title;

    // Usa prompt hierárquico IPTC se habilitado
    const prompt = USE_HIERARCHICAL 
      ? HierarchicalClassifierService.generatePrompt(text)
      : this.getLegacyPrompt(text);

    try {
      const response = await axios.post(
        `${VERTEX_URL}?key=${apiKey}`,
        {
          contents: [{
            role: 'user',
            parts: [{ text: prompt }]
          }]
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );

      // Extrai texto da resposta streaming
      let responseText = '';
      if (response.data && Array.isArray(response.data)) {
        for (const chunk of response.data) {
          if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
            responseText += chunk.candidates[0].content.parts[0].text;
          }
        }
      } else if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = response.data.candidates[0].content.parts[0].text;
      }

      // Extrai JSON da resposta (pode ser objeto aninhado para hierárquico)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('   ⚠️ Gemini não retornou JSON válido');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Delay para evitar rate limit
      await new Promise(r => setTimeout(r, REQUEST_DELAY));

      // NOVO: Processa resposta hierárquica se habilitado
      if (USE_HIERARCHICAL && parsed.primary) {
        console.log('   ✅ Gemini classificou (hierárquico)!');
        
        // Processa classificação hierárquica
        const hierarchicalResult = await HierarchicalClassifierService.processClassification(parsed);
        
        if (hierarchicalResult.primary) {
          return {
            // Compatibilidade com formato antigo
            category: hierarchicalResult.primary.category_name,
            confidence: hierarchicalResult.primary.confidence,
            location: parsed.location === 'null' || !parsed.location ? null : parsed.location,
            method: 'gemini-hierarchical',
            // Novos campos hierárquicos
            hierarchical: hierarchicalResult,
            category_id: hierarchicalResult.primary.category_id,
            category_path: hierarchicalResult.primary.category_path,
            category_level: hierarchicalResult.primary.level,
            categories: hierarchicalResult.categories
          };
        }
      }

      // Fallback: formato legado (categoria única)
      if (!parsed.category && !parsed.primary) {
        console.warn('   ⚠️ Categoria inválida retornada pelo Gemini');
        return null;
      }

      const categoryName = parsed.category || parsed.primary?.level2 || parsed.primary?.level1;
      
      console.log('   ✅ Gemini classificou com sucesso!');

      return {
        category: categoryName.trim(),
        confidence: Math.min(0.99, Math.max(0.5, parsed.confidence || parsed.primary?.confidence || 0.9)),
        location: parsed.location === 'null' || !parsed.location ? null : parsed.location,
        method: 'gemini'
      };

    } catch (error) {
      // Se for 429 (rate limit), espera mais tempo
      if (error.response?.status === 429) {
        console.warn('   ⏳ Rate limit Gemini - artigo será classificado depois');
        await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY)); // Espera 1 minuto
      } else {
        console.error('   ❌ Erro Gemini:', error.response?.data?.error?.message || error.message);
      }
      return null; // Retorna null, artigo fica na fila para tentar depois
    }
  },

  /**
   * Processa artigos não categorizados (fila de classificação)
   * Integra com categoryService para criar categorias dinamicamente
   */
  async processUncategorized(batchSize = 20) {
    console.log('\n🧠 Processando fila de classificação Gemini...');

    const uncategorized = await Article.findUncategorized(batchSize);

    if (uncategorized.length === 0) {
      console.log('   ✅ Nenhum artigo na fila');
      return { processed: 0, pending: 0 };
    }

    console.log(`   📋 Fila: ${uncategorized.length} artigos`);

    let processed = 0;
    let pending = 0;
    const startTime = Date.now();

    for (const article of uncategorized) {
      try {
        // Classifica com Gemini (classificação livre)
        const classification = await this.classifyArticle(article.title, article.summary);

        if (classification) {
          // Normaliza e obtém/cria categoria no banco
          const category = await CategoryService.normalizeAndGetCategory(classification.category);
          
          // Atualiza artigo com category_id
          const updatedArticle = await Article.updateCategory(
            article.id,
            category.id,  // Usa ID da categoria
            classification.confidence
          );
          
          // Gera embedding do artigo (título + snippet)
          try {
            const embedding = await EmbeddingService.generateArticleEmbedding({
              title: article.title,
              summary: article.summary
            });
            
            if (embedding && embedding.length > 0) {
              await Article.updateEmbedding(article.id, embedding);
              console.log(`   🧠 Embedding gerado (${embedding.length} dims)`);
            }
          } catch (embeddingError) {
            // Não bloqueia se embedding falhar
            console.warn(`   ⚠️ Embedding não gerado: ${embeddingError.message}`);
          }
          
          processed++;
          console.log(`   ✅ ${article.title.slice(0, 40)}... → ${category.name} (id: ${category.id})`);

          // Broadcast SSE filtrado para clientes interessados
          // Inclui created_at, site_name e objeto category completo
          sseManager.broadcastFiltered('new_article', {
            id: updatedArticle.id,
            title: updatedArticle.title,
            url: updatedArticle.url,
            summary: updatedArticle.summary,
            image_url: updatedArticle.image_url,
            category_id: category.id,
            category: {
              id: category.id,
              name: category.name,
              slug: category.slug
            },
            category_confidence: updatedArticle.category_confidence,
            published_at: updatedArticle.published_at,
            created_at: updatedArticle.created_at,
            site_id: updatedArticle.site_id,
            site_name: updatedArticle.site_name || article.site_name
          });
        } else {
          pending++;
          console.log(`   ⏳ ${article.title.slice(0, 40)}... (pendente)`);
        }

      } catch (error) {
        console.error(`   ❌ Erro ao classificar artigo ${article.id}:`, error.message);
        pending++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n   📊 Resultado: ${processed} classificados, ${pending} pendentes (${duration}s)`);

    return { processed, pending, duration: parseFloat(duration) };
  },

  /**
   * Prompt legado (para fallback se hierárquico desabilitado)
   * @param {string} text
   */
  getLegacyPrompt(text) {
    return `Você é um classificador de notícias brasileiras especializado.
Classifique este artigo analisando o CONTEXTO e pensando em INTERESSES REAIS.

TEXTO: "${text}"

REGRA DE OURO - ANALISE O CONTEXTO:
O mesmo assunto pode ter categorias diferentes dependendo do contexto:

ENERGIA ELÉTRICA:
- "Conta de luz sobe 5%" → Economia (é sobre preço/custo)
- "SP sem luz após ventania" → Clima (consequência climática)
- "Hackers atacam rede elétrica" → Tecnologia (ataque cibernético)

CATEGORIAS ESPECÍFICAS (interesses reais):
- Esportes: Futebol, Fórmula 1, MMA/UFC, Tênis, Basquete
- Tech: Inteligência Artificial, Games, Apple, Android
- Finanças: Bitcoin, Criptomoedas, Bolsa de Valores
- Entretenimento: Cinema, Séries, K-Pop, Música

CATEGORIAS AMPLAS (baseado no CONTEXTO):
- Política: governo, votações, eleições, STF, Congresso
- Economia: preços, inflação, PIB, mercado
- Tecnologia: inovações, apps, hacks
- Segurança: crimes, acidentes, prisões
- Saúde: doenças, vacinas, hospitais
- Clima: tempestades, consequências climáticas
- Meio Ambiente: desmatamento, poluição

REGRAS:
1. ANALISE O CONTEXTO - não classifique por palavras-chave
2. Estados válidos: ${BRAZILIAN_STATES.join(', ')}

FORMATO JSON:
{"category":"CATEGORIA","confidence":0.95,"location":"ESTADO_OU_null"}

Retorne APENAS o JSON.`;
  }
};

export default GeminiClassifierService;
