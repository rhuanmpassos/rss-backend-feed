/**
 * Script para gerar embeddings de artigos existentes
 * Processa artigos que têm categoria mas não têm embedding
 */

import Article from './src/models/Article.js';
import EmbeddingService from './src/services/embeddingService.js';

async function generateEmbeddings(batchSize = 20) {
  console.log('🧠 Gerando embeddings para artigos existentes...\n');

  // Verifica status
  const stats = await Article.countWithEmbedding();
  console.log('📊 Status atual:');
  console.log(`   Total de artigos (categorizados): ${stats.total}`);
  console.log(`   Com embedding: ${stats.with_embedding}`);
  console.log(`   Sem embedding: ${stats.without_embedding}\n`);

  if (parseInt(stats.without_embedding) === 0) {
    console.log('✅ Todos os artigos já têm embeddings!');
    return { processed: 0, total: parseInt(stats.total) };
  }

  // Inicializa modelo de embeddings
  console.log('📦 Carregando modelo de embeddings...');
  console.log('   Modelo: paraphrase-multilingual-MiniLM-L12-v2');
  console.log('   (Primeira execução pode demorar para baixar ~500MB)\n');
  
  try {
    await EmbeddingService.initialize();
  } catch (error) {
    console.error('❌ Erro ao carregar modelo:', error.message);
    console.log('\n⚠️  Verifique se @xenova/transformers está instalado:');
    console.log('   npm install @xenova/transformers');
    process.exit(1);
  }

  // Processa em batches
  let totalProcessed = 0;
  let hasMore = true;
  const startTime = Date.now();

  while (hasMore) {
    // Busca artigos sem embedding
    const articles = await Article.findWithoutEmbedding(batchSize);
    
    if (articles.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`\n📋 Processando batch de ${articles.length} artigos...`);

    for (const article of articles) {
      try {
        // Gera embedding
        const embedding = await EmbeddingService.generateArticleEmbedding({
          title: article.title,
          summary: article.summary
        });

        if (embedding && embedding.length > 0) {
          // Salva no banco
          await Article.updateEmbedding(article.id, embedding);
          totalProcessed++;
          console.log(`   ✅ [${totalProcessed}] ${article.title.slice(0, 50)}...`);
        }
      } catch (error) {
        console.error(`   ❌ Erro artigo ${article.id}: ${error.message}`);
      }
    }

    // Pausa entre batches
    await new Promise(r => setTimeout(r, 100));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Resultado final:');
  console.log(`   Embeddings gerados: ${totalProcessed}`);
  console.log(`   Tempo total: ${duration}s`);
  
  // Verifica status final
  const finalStats = await Article.countWithEmbedding();
  console.log(`\n   Total: ${finalStats.total}`);
  console.log(`   Com embedding: ${finalStats.with_embedding}`);
  console.log(`   Sem embedding: ${finalStats.without_embedding}`);
  
  console.log('\n✅ Concluído!');
  
  return { processed: totalProcessed, total: parseInt(finalStats.total) };
}

// Executa
generateEmbeddings()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });

