/**
 * Cleanup Worker
 * Remove artigos com mais de 3 dias (preserva bookmarked)
 */

import Article from '../models/Article.js';
import ScrapingLog from '../models/ScrapingLog.js';

const CleanupWorker = {
  /**
   * Executa limpeza de artigos antigos
   */
  async run() {
    console.log('\n🗑️ Iniciando limpeza de artigos antigos...');

    try {
      const RETENTION_DAYS = 3;

      // 1. Deleta artigos > 3 dias (exceto bookmarked)
      const deletedArticles = await Article.deleteOlderThan(RETENTION_DAYS);

      if (deletedArticles > 0) {
        console.log(`   ✅ Removidos ${deletedArticles} artigos antigos (>${RETENTION_DAYS} dias)`);
      } else {
        console.log(`   ℹ️ Nenhum artigo antigo para remover`);
      }

      // 2. Deleta logs de scraping > 3 dias
      const deletedLogs = await ScrapingLog.deleteOlderThan(RETENTION_DAYS);

      if (deletedLogs > 0) {
        console.log(`   ✅ Removidos ${deletedLogs} logs de scraping antigos (>${RETENTION_DAYS} dias)`);
      } else {
        console.log(`   ℹ️ Nenhum log antigo para remover`);
      }

      // Estatísticas
      const stats = await Article.getStats();
      console.log(`   📊 Artigos restantes: ${stats.total_articles}`);

      const bookmarked = await Article.findBookmarked(999999);
      console.log(`   🔖 Artigos salvos (preservados): ${bookmarked.length}`);

      return {
        deletedArticles,
        deletedLogs,
        remaining: parseInt(stats.total_articles),
        bookmarked: bookmarked.length
      };

    } catch (error) {
      console.error('   ❌ Erro na limpeza:', error.message);
      throw error;
    }
  }
};

export default CleanupWorker;
