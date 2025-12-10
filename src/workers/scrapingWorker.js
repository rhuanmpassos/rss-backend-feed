/**
 * Scraping Worker
 * Busca sites prontos para scraping e processa automaticamente
 */

import Site from '../models/Site.js';
import ScraperService from '../services/scraperService.js';

const ScrapingWorker = {
  /**
   * Executa scraping de sites prontos
   */
  async run() {
    console.log('\n🔍 Worker de Scraping iniciado...');

    try {
      // Busca sites prontos para scraping
      const sites = await Site.findReadyToScrape();

      if (sites.length === 0) {
        console.log('   ℹ️ Nenhum site pronto para scraping');
        return { processed: 0 };
      }

      console.log(`   📋 Sites para processar: ${sites.length}`);

      let totalArticles = 0;
      let processed = 0;

      for (const site of sites) {
        try {
          console.log(`\n   🌐 ${site.name} (ID: ${site.id})`);

          const result = await ScraperService.scrapeSite(site.id);

          totalArticles += result.saved;
          processed++;

          console.log(`   ✅ ${result.saved} novos artigos salvos`);

          // Delay entre sites para respeitar rate limit
          await new Promise(r => setTimeout(r, 2000));

        } catch (error) {
          console.error(`   ❌ Erro no scraping de ${site.name}:`, error.message);
        }
      }

      console.log(`\n   🎉 Scraping concluído: ${totalArticles} artigos de ${processed} sites`);

      return {
        processed,
        totalArticles
      };

    } catch (error) {
      console.error('   ❌ Erro no worker:', error.message);
      throw error;
    }
  }
};

export default ScrapingWorker;
