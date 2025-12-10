/**
 * Teste de extração de imagens do Coluna do Fla
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import ScraperService from './src/services/scraperService.js';

async function testImageExtraction() {
  console.log('🖼️ Testando extração de imagens do Coluna do Fla...\n');

  try {
    const response = await axios.get('https://colunadofla.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    console.log('✅ Página carregada!\n');

    // Testa diferentes seletores
    const selectors = [
      'article',
      'a[href*="/2025"]',
      'a[href*="/2024"]',
      '[class*="post"]'
    ];

    let articlesFound = 0;
    let imagesFound = 0;

    for (const selector of selectors) {
      $(selector).slice(0, 3).each((_, el) => {
        const article = ScraperService.extractArticleData($, el, 'https://colunadofla.com/');

        if (article && article.title && article.title.length > 20) {
          articlesFound++;
          console.log(`📰 ${article.title.slice(0, 60)}...`);

          if (article.imageUrl) {
            imagesFound++;
            console.log(`   🖼️ ${article.imageUrl.slice(0, 80)}...`);
          } else {
            console.log('   ❌ Sem imagem');
          }
          console.log('');
        }
      });

      if (articlesFound >= 5) break;
    }

    console.log(`\n📊 Resultado: ${imagesFound}/${articlesFound} artigos com imagem`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

testImageExtraction();
