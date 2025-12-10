/**
 * Test Services - Scraper, Classifier e Feed Generator
 */

import ScraperService from './src/services/scraperService.js';
import ClassifierService from './src/services/classifierService.js';
import FeedGeneratorService from './src/services/feedGeneratorService.js';
import Site from './src/models/Site.js';
import Article from './src/models/Article.js';

console.log('🧪 Testando Services...\n');

async function testServices() {
  try {
    // Teste 1: Scraper Service - Test Scrape
    console.log('1️⃣ Testando ScraperService.testScrape...');
    const testResult = await ScraperService.testScrape('https://g1.globo.com');
    console.log(`   ✅ Encontrados: ${testResult.articlesFound} artigos`);
    console.log(`   Preview:`, testResult.preview?.slice(0, 2));

    // Teste 2: Cria um site de teste
    console.log('\n2️⃣ Criando site de teste...');
    let testSite;
    try {
      testSite = await Site.create({
        name: 'G1 Test',
        url: 'https://g1.globo.com',
        category: 'Notícias',
        scrapingInterval: 3600
      });
      console.log(`   ✅ Site criado: ${testSite.name} (ID: ${testSite.id})`);
    } catch (error) {
      // Se já existe, pega o existente
      testSite = await Site.findByUrl('https://g1.globo.com');
      console.log(`   ℹ️ Site já existe (ID: ${testSite.id})`);
    }

    // Teste 3: Scraper Service - Scraping Real
    console.log('\n3️⃣ Testando ScraperService.scrapeSite...');
    const scrapeResult = await ScraperService.scrapeSite(testSite.id);
    console.log(`   ✅ Total encontrado: ${scrapeResult.totalFound}`);
    console.log(`   Salvos: ${scrapeResult.saved}`);
    console.log(`   Duplicados: ${scrapeResult.skipped}`);
    console.log(`   Duração: ${scrapeResult.duration}ms`);

    // Teste 4: Classifier Service
    console.log('\n4️⃣ Testando ClassifierService...');
    const classifyResult = await ClassifierService.processUncategorized(10);
    console.log(`   ✅ Artigos classificados: ${classifyResult.processed}`);
    console.log(`   Duração: ${classifyResult.duration}s`);

    // Teste 5: Feed Generator - Site Feed
    console.log('\n5️⃣ Testando FeedGeneratorService (Site Feed)...');
    const siteFeedRSS = await FeedGeneratorService.generateSiteFeed(testSite.id, 'rss');
    console.log(`   ✅ RSS Feed gerado: ${siteFeedRSS.length} bytes`);

    const siteFeedJSON = await FeedGeneratorService.generateSiteFeed(testSite.id, 'json');
    const jsonData = JSON.parse(siteFeedJSON);
    console.log(`   ✅ JSON Feed gerado: ${jsonData.items?.length || 0} itens`);

    // Teste 6: Feed Generator - Category Feed
    console.log('\n6️⃣ Testando FeedGeneratorService (Category Feed)...');
    try {
      const categoryFeed = await FeedGeneratorService.generateCategoryFeed('tecnologia', 'json');
      const catData = JSON.parse(categoryFeed);
      console.log(`   ✅ Feed Tecnologia: ${catData.items?.length || 0} itens`);
    } catch (error) {
      console.log(`   ⚠️ Categoria pode não ter artigos ainda: ${error.message}`);
    }

    // Teste 7: Feed Generator - Combined Feed
    console.log('\n7️⃣ Testando FeedGeneratorService (Combined Feed)...');
    const combinedFeed = await FeedGeneratorService.generateCombinedFeed('json', 50);
    const allData = JSON.parse(combinedFeed);
    console.log(`   ✅ Feed Combinado: ${allData.items?.length || 0} itens`);

    // Estatísticas finais
    console.log('\n📊 Estatísticas Finais:');
    const stats = await Article.getStats();
    console.log(`   Total de artigos: ${stats.total_articles}`);
    console.log(`   Categorizados: ${stats.categorized}`);
    console.log(`   Hoje: ${stats.articles_today}`);

    console.log('\n✅ Todos os testes de services passaram!\n');

  } catch (error) {
    console.error('\n❌ Erro nos testes:', error);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

testServices();
