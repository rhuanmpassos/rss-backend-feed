/**
 * Gemini Classifier Service - Classificação Livre (categorias dinâmicas)
 * Gemini classifica livremente, sem lista fixa de categorias
 * Categorias são criadas automaticamente no banco via categoryService
 * Embeddings são gerados para cada artigo classificado
 */

import axios from 'axios';
import Article from '../models/Article.js';
import CategoryService from './categoryService.js';
import EmbeddingService from './embeddingService.js';
import sseManager from './sseManager.js';
import dotenv from 'dotenv';

dotenv.config();

// Estados brasileiros (para contexto de localização, não para categoria)
const BRAZILIAN_STATES = [
  'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal',
  'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul',
  'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí',
  'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia',
  'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'
];

const VERTEX_URL = 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash-lite:streamGenerateContent';

// Delay entre requests (em ms) - ajuste conforme tier
const REQUEST_DELAY = 1000; // 1 segundo entre requests
const RATE_LIMIT_DELAY = 60000; // 1 minuto se rate limited

const GeminiClassifierService = {
  /**
   * Classifica um artigo usando Gemini via Vertex AI
   * Classificação LIVRE - Gemini escolhe a categoria mais específica
   * Retorna null se não conseguir (rate limit) - artigo fica sem categoria para tentar depois
   */
  async classifyArticle(title, summary = '') {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY não configurada!');
      return null; // Retorna null, artigo será classificado depois
    }

    const text = summary ? `${title}. ${summary}` : title;

    // Prompt para classificação baseada em INTERESSES REAIS
    const prompt = `Você é um classificador de notícias brasileiras especializado.
Classifique este artigo pensando em INTERESSES REAIS que pessoas seguem.

TEXTO: "${text}"

PRINCÍPIO FUNDAMENTAL:
Pense assim: "Que tipo de pessoa se interessaria por essa notícia? O que ela SEGUE?"
- Alguém segue "Política", não "Votação no Congresso"
- Alguém segue "Tecnologia", não "Vazamento de Dados Sigilosos"
- Alguém segue "Economia", não "Energia Elétrica"
- MAS alguém segue "Futebol" especificamente, não só "Esportes"
- MAS alguém segue "Fórmula 1" especificamente, não só "Automobilismo"
- MAS alguém segue "Bitcoin" especificamente, não só "Economia"

CATEGORIAS ESPECÍFICAS (pessoas realmente seguem isso):
- Esportes: Futebol, Fórmula 1, MMA/UFC, Tênis, Basquete, Vôlei, etc.
- Tech: Inteligência Artificial, Games, Apple, Android, etc.
- Finanças: Bitcoin, Criptomoedas, Bolsa de Valores, etc.
- Entretenimento: Cinema, Séries, K-Pop, Música, etc.

CATEGORIAS AMPLAS (eventos específicos vão aqui):
- Política: votações, escândalos, eleições, STF, Congresso
- Economia: inflação, PIB, energia, combustíveis, preços
- Tecnologia: vazamentos, hacks, lançamentos genéricos
- Segurança: crimes, prisões, operações policiais
- Saúde: doenças, vacinas, hospitais
- Educação: escolas, universidades, vestibular
- Meio Ambiente: desmatamento, clima, queimadas

REGRAS:
1. Se é um INTERESSE REAL específico → use categoria específica
2. Se é um EVENTO/SITUAÇÃO → use categoria ampla do tema
3. TIMES DE FUTEBOL NÃO SÃO LOCALIZAÇÃO (Bahia, Fortaleza, São Paulo FC → location: null)
4. LOCATION só para lugares geográficos explícitos
   Estados válidos: ${BRAZILIAN_STATES.join(', ')}

FORMATO (APENAS JSON):
{"category":"CATEGORIA","confidence":0.95,"location":"ESTADO_OU_null"}

EXEMPLOS:
- "Câmara vota cassação de deputado" → {"category":"Política","confidence":0.98,"location":null}
- "Dados sigilosos vazam de empresa" → {"category":"Tecnologia","confidence":0.92,"location":null}
- "Conta de luz vai subir 5%" → {"category":"Economia","confidence":0.95,"location":null}
- "Hamilton vence GP de Mônaco" → {"category":"Fórmula 1","confidence":0.98,"location":null}
- "Flamengo contrata atacante" → {"category":"Futebol","confidence":0.98,"location":null}
- "Bitcoin atinge recorde" → {"category":"Bitcoin","confidence":0.95,"location":null}
- "ChatGPT ganha nova função" → {"category":"Inteligência Artificial","confidence":0.95,"location":null}
- "Operação prende traficantes no RJ" → {"category":"Segurança","confidence":0.90,"location":"Rio de Janeiro"}

Retorne APENAS o JSON, sem explicações.`;

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

      // Extrai JSON da resposta
      const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        console.warn('   ⚠️ Gemini não retornou JSON válido');
        return null; // Tenta novamente depois
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Valida que temos uma categoria
      if (!parsed.category || typeof parsed.category !== 'string') {
        console.warn('   ⚠️ Categoria inválida retornada pelo Gemini');
        return null;
      }

      console.log('   ✅ Gemini classificou com sucesso!');

      // Delay para evitar rate limit
      await new Promise(r => setTimeout(r, REQUEST_DELAY));

      return {
        category: parsed.category.trim(),
        confidence: Math.min(0.99, Math.max(0.5, parsed.confidence || 0.9)),
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
  }
};

export default GeminiClassifierService;
