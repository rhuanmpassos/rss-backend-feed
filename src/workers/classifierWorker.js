/**
 * Classifier Worker - Sistema de Fallback Gemini + DeepSeek R1
 * 
 * Estratégia:
 * 1. Gemini como principal (1 RPM - processa 1 por ciclo)
 * 2. DeepSeek R1 como fallback (600 RPM - processa o restante)
 * 3. Gemini volta a tentar após 2 minutos de cooldown
 */

import GeminiClassifierService from '../services/geminiClassifierService.js';
import DeepSeekClassifierService from '../services/deepseekClassifierService.js';
import Article from '../models/Article.js';

// Controle de rate limit do Gemini
let geminiCooldownUntil = 0;
const GEMINI_COOLDOWN = 2 * 60 * 1000; // 2 minutos

const ClassifierWorker = {
  /**
   * Verifica se Gemini está disponível (não está em cooldown)
   */
  isGeminiAvailable() {
    return Date.now() >= geminiCooldownUntil;
  },

  /**
   * Coloca Gemini em cooldown
   */
  setGeminiCooldown() {
    geminiCooldownUntil = Date.now() + GEMINI_COOLDOWN;
    const cooldownEnd = new Date(geminiCooldownUntil).toLocaleTimeString('pt-BR');
    console.log(`   ⏰ Gemini em cooldown até ${cooldownEnd}`);
  },

  /**
   * Classifica um artigo com fallback
   * Tenta Gemini primeiro, se falhar usa DeepSeek
   */
  async classifyWithFallback(article) {
    // Tenta Gemini se disponível
    if (this.isGeminiAvailable()) {
      console.log(`   🔷 Tentando Gemini para: ${article.title.slice(0, 40)}...`);
      
      const geminiResult = await GeminiClassifierService.classifyArticle(
        article.title, 
        article.summary
      );
      
      if (geminiResult) {
        console.log(`   ✅ Gemini classificou: ${geminiResult.category}`);
        return geminiResult;
      } else {
        // Gemini falhou (provavelmente rate limit)
        this.setGeminiCooldown();
        console.log(`   ⚠️ Gemini falhou, usando DeepSeek como fallback`);
      }
    } else {
      const remainingCooldown = Math.ceil((geminiCooldownUntil - Date.now()) / 1000);
      console.log(`   ⏳ Gemini em cooldown (${remainingCooldown}s restantes)`);
    }

    // Fallback para DeepSeek
    console.log(`   🔶 Usando DeepSeek R1 para: ${article.title.slice(0, 40)}...`);
    const deepseekResult = await DeepSeekClassifierService.classifyArticle(
      article.title, 
      article.summary
    );
    
    if (deepseekResult) {
      console.log(`   ✅ DeepSeek classificou: ${deepseekResult.category}`);
      return deepseekResult;
    }

    return null;
  },

  /**
   * Executa classificação da fila
   */
  async run() {
    console.log('\n🧠 Worker de Classificação (Gemini + DeepSeek) iniciado...');

    try {
      // Verifica quantos artigos precisam ser classificados
      const uncategorized = await Article.findUncategorized(1);

      if (uncategorized.length === 0) {
        console.log('   ✅ Fila vazia - nenhum artigo pendente');
        return { processed: 0, pending: 0, gemini: 0, deepseek: 0 };
      }

      // Busca batch maior para processar
      const BATCH_SIZE = 30;
      const articles = await Article.findUncategorized(BATCH_SIZE);
      
      console.log(`   📋 Fila: ${articles.length} artigos pendentes`);
      console.log(`   🔷 Gemini: ${this.isGeminiAvailable() ? 'Disponível' : 'Em cooldown'}`);
      console.log(`   🔶 DeepSeek: Disponível (600 RPM)`);

      let processed = 0;
      let pending = 0;
      let geminiCount = 0;
      let deepseekCount = 0;
      const startTime = Date.now();

      // Importa serviços necessários para salvar
      const CategoryService = (await import('../services/categoryService.js')).default;
      const EmbeddingService = (await import('../services/embeddingService.js')).default;
      const sseManager = (await import('../services/sseManager.js')).default;

      for (const article of articles) {
        try {
          // Classifica com fallback
          const classification = await this.classifyWithFallback(article);

          if (classification) {
            // Normaliza e obtém/cria categoria no banco
            let category;
            try {
              category = await CategoryService.normalizeAndGetCategory(classification.category);
            } catch (categoryError) {
              // Se a categoria for inválida (ex: "null"), usa "Diversos" como fallback
              console.warn(`   ⚠️ ${categoryError.message} - usando "Diversos" como fallback`);
              category = await CategoryService.normalizeAndGetCategory('Diversos');
              classification.confidence = 0.5; // Reduz confiança para indicar fallback
            }
            
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
              }
            } catch (embeddingError) {
              // Não bloqueia se embedding falhar
            }
            
            processed++;
            
            // Conta qual modelo classificou
            if (classification.method === 'gemini') {
              geminiCount++;
            } else {
              deepseekCount++;
            }

            console.log(`   ✅ [${classification.method}] ${article.title.slice(0, 35)}... → ${category.name}`);

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
            // Se não conseguiu classificar, usa "Diversos" como fallback
            console.warn(`   ⚠️ Não foi possível classificar - usando "Diversos" como fallback`);
            try {
              const fallbackCategory = await CategoryService.normalizeAndGetCategory('Diversos');
              await Article.updateCategory(article.id, fallbackCategory.id, 0.3);
              processed++;
              console.log(`   📦 ${article.title.slice(0, 40)}... → Diversos (fallback)`);
            } catch (fallbackError) {
              pending++;
              console.log(`   ⏳ ${article.title.slice(0, 40)}... (pendente)`);
            }
          }

        } catch (error) {
          console.error(`   ❌ Erro ao classificar artigo ${article.id}:`, error.message);
          pending++;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      console.log(`\n   📊 Resultado:`);
      console.log(`      • Total: ${processed} classificados, ${pending} pendentes`);
      console.log(`      • Gemini: ${geminiCount} artigos`);
      console.log(`      • DeepSeek: ${deepseekCount} artigos`);
      console.log(`      • Tempo: ${duration}s`);

      return { 
        processed, 
        pending, 
        gemini: geminiCount, 
        deepseek: deepseekCount,
        duration: parseFloat(duration) 
      };

    } catch (error) {
      console.error('   ❌ Erro no worker:', error.message);
      throw error;
    }
  }
};

export default ClassifierWorker;
