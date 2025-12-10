/**
 * Classifier Worker - DeepSeek R1 (Vertex AI)
 * Processa fila de artigos não categorizados via DeepSeek R1
 * DeepSeek tem 600 RPM vs 1 RPM do Gemini no Vertex AI
 */

import DeepSeekClassifierService from '../services/deepseekClassifierService.js';
import Article from '../models/Article.js';

const ClassifierWorker = {
  /**
   * Executa classificação da fila via DeepSeek R1
   */
  async run() {
    console.log('\n🧠 Worker de Classificação DeepSeek R1 iniciado...');

    try {
      // Verifica quantos artigos precisam ser classificados
      const uncategorized = await Article.findUncategorized(1);

      if (uncategorized.length === 0) {
        console.log('   ✅ Fila vazia - nenhum artigo pendente');
        return { processed: 0, pending: 0 };
      }

      // DeepSeek tem 600 RPM, então podemos processar mais por batch
      const BATCH_SIZE = 30;
      const result = await DeepSeekClassifierService.processUncategorized(BATCH_SIZE);

      console.log(`   📊 ${result.processed} classificados, ${result.pending} ainda pendentes`);

      return result;

    } catch (error) {
      console.error('   ❌ Erro no worker:', error.message);
      throw error;
    }
  }
};

export default ClassifierWorker;
