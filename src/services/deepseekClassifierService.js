/**
 * DeepSeek Classifier Service - Classificação via DeepSeek R1 no Vertex AI
 * Usa DeepSeek R1 (600 RPM) para classificação de artigos
 * Categorias são criadas automaticamente no banco via categoryService
 */

import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';
import Article from '../models/Article.js';
import CategoryService from './categoryService.js';
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

// Configuração do DeepSeek no Vertex AI
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1'; // Região com 600 RPM
const PUBLISHER = 'deepseek-ai'; // Publisher correto!
const MODEL_ID = 'deepseek-r1-0528-maas';

// Endpoint do Vertex AI para DeepSeek
const getEndpoint = () => {
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL_ID}:generateContent`;
};

// Delay entre requests - DeepSeek tem 600 RPM, então 100ms é seguro
const REQUEST_DELAY = 150; // 150ms = ~400 RPM (conservador)
const RATE_LIMIT_DELAY = 5000; // 5 segundos se rate limited

// Auth client (singleton)
let authClient = null;

const DeepSeekClassifierService = {
  /**
   * Obtém token de acesso do Google Cloud
   */
  async getAccessToken() {
    if (!authClient) {
      authClient = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
    }
    const client = await authClient.getClient();
    const token = await client.getAccessToken();
    return token.token;
  },

  /**
   * Classifica um artigo usando DeepSeek R1 via Vertex AI
   */
  async classifyArticle(title, summary = '') {
    if (!PROJECT_ID) {
      console.warn('⚠️ GOOGLE_CLOUD_PROJECT não configurado!');
      console.warn('   Configure: GOOGLE_CLOUD_PROJECT=seu-project-id no .env');
      return null;
    }

    const text = summary ? `${title}. ${summary}` : title;

    // Prompt otimizado para DeepSeek R1
    const prompt = `Você é um classificador de notícias brasileiras especializado.
Classifique este artigo de forma ESPECÍFICA e precisa.

TEXTO: "${text}"

REGRAS DE CLASSIFICAÇÃO:
1. Seja ESPECÍFICO - Use categorias precisas ao invés de genéricas:
   - "Fórmula 1" ao invés de "Esportes"
   - "Badminton" ao invés de "Esportes"
   - "Bitcoin" ao invés de "Economia"
   - "Inteligência Artificial" ao invés de "Tecnologia"
   
2. Use nomes claros e diretos em português

3. TIMES DE FUTEBOL NÃO SÃO LOCALIZAÇÃO:
   - "Bahia", "Fortaleza", "São Paulo", "Goiás", etc. em contexto de futebol → location: null
   
4. LOCATION só é preenchido se menciona um LUGAR GEOGRÁFICO explicitamente
   Estados válidos: ${BRAZILIAN_STATES.join(', ')}

FORMATO DE RESPOSTA (APENAS JSON):
{"category":"NOME_ESPECÍFICO","confidence":0.95,"location":"ESTADO_OU_null"}

EXEMPLOS:
- "Hamilton vence GP de Mônaco" → {"category":"Fórmula 1","confidence":0.98,"location":null}
- "Bahia contrata atacante do Flamengo" → {"category":"Futebol","confidence":0.95,"location":null}
- "Bitcoin atinge novo recorde histórico" → {"category":"Bitcoin","confidence":0.95,"location":null}
- "Chuvas fortes causam alagamentos na Bahia" → {"category":"Clima","confidence":0.90,"location":"Bahia"}
- "OpenAI lança nova versão do ChatGPT" → {"category":"Inteligência Artificial","confidence":0.95,"location":null}

Retorne APENAS o JSON, sem explicações ou texto adicional.`;

    try {
      const accessToken = await this.getAccessToken();
      const endpoint = getEndpoint();

      console.log(`   🔄 Chamando DeepSeek R1 em ${LOCATION}...`);

      const response = await axios.post(
        endpoint,
        {
          contents: [{
            role: 'user',
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048, // Aumentado para dar espaço ao "thinking" do DeepSeek R1
            topP: 0.8
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      // Extrai texto da resposta
      let responseText = '';
      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = response.data.candidates[0].content.parts[0].text;
      } else if (response.data && Array.isArray(response.data)) {
        // Formato streaming
        for (const chunk of response.data) {
          if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
            responseText += chunk.candidates[0].content.parts[0].text;
          }
        }
      }

      // DeepSeek R1 inclui <think>...</think> antes da resposta final
      // Procura o JSON após as tags de pensamento
      
      // Primeiro tenta encontrar JSON após </think>
      const afterThink = responseText.split('</think>').pop() || responseText;
      
      // Remove qualquer tag <think> restante
      const cleanText = afterThink.replace(/<\/?think>/gi, '').trim();
      
      // Extrai JSON da resposta
      const jsonMatch = cleanText.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        // Tenta no texto original completo como fallback
        const fullMatch = responseText.match(/\{[\s\S]*?"category"[\s\S]*?\}/);
        if (!fullMatch) {
          console.warn('   ⚠️ DeepSeek não retornou JSON válido');
          console.warn('   Resposta:', responseText.slice(0, 200));
          return null;
        }
        // Usa o match do texto completo
        const parsed = JSON.parse(fullMatch[0]);
        if (parsed.category) {
          console.log('   ✅ DeepSeek classificou com sucesso! (extraído do thinking)');
          await new Promise(r => setTimeout(r, REQUEST_DELAY));
          return {
            category: parsed.category.trim(),
            confidence: Math.min(0.99, Math.max(0.5, parsed.confidence || 0.9)),
            location: parsed.location === 'null' || !parsed.location ? null : parsed.location,
            method: 'deepseek-r1'
          };
        }
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Valida categoria
      if (!parsed.category || typeof parsed.category !== 'string') {
        console.warn('   ⚠️ Categoria inválida retornada pelo DeepSeek');
        return null;
      }

      console.log('   ✅ DeepSeek classificou com sucesso!');

      // Delay para evitar rate limit
      await new Promise(r => setTimeout(r, REQUEST_DELAY));

      return {
        category: parsed.category.trim(),
        confidence: Math.min(0.99, Math.max(0.5, parsed.confidence || 0.9)),
        location: parsed.location === 'null' || !parsed.location ? null : parsed.location,
        method: 'deepseek-r1'
      };

    } catch (error) {
      if (error.response?.status === 429) {
        console.warn('   ⏳ Rate limit DeepSeek - aguardando...');
        await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        console.error('   ❌ Erro de autenticação. Verifique:');
        console.error('      1. GOOGLE_CLOUD_PROJECT está configurado');
        console.error('      2. Credenciais do gcloud (gcloud auth application-default login)');
        console.error('      Erro:', error.response?.data?.error?.message || error.message);
      } else {
        console.error('   ❌ Erro DeepSeek:', error.response?.data?.error?.message || error.message);
      }
      return null;
    }
  },

  /**
   * Processa artigos não categorizados
   */
  async processUncategorized(batchSize = 30) {
    console.log('\n🧠 Processando fila de classificação DeepSeek R1...');

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
        const classification = await this.classifyArticle(article.title, article.summary);

        if (classification) {
          // Normaliza e obtém/cria categoria no banco
          const category = await CategoryService.normalizeAndGetCategory(classification.category);
          
          // Atualiza artigo com category_id
          const updatedArticle = await Article.updateCategory(
            article.id,
            category.id,
            classification.confidence
          );
          
          // Gera embedding do artigo
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
            console.warn(`   ⚠️ Embedding não gerado: ${embeddingError.message}`);
          }
          
          processed++;
          console.log(`   ✅ ${article.title.slice(0, 40)}... → ${category.name}`);

          // Broadcast SSE
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

export default DeepSeekClassifierService;

