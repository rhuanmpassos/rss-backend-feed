/**
 * Teste do Gemini Classifier com Coluna do Fla
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import GeminiClassifier from './src/services/geminiClassifierService.js';

async function testGeminiWithColunaFla() {
  console.log('🧪 Testando Gemini Flash com Coluna do Fla...\n');

  try {
    // 1. Busca a página
    console.log('📥 Buscando https://colunadofla.com/...');
    const response = await axios.get('https://colunadofla.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    console.log('✅ Página carregada!\n');

    // 2. Extrai alguns títulos
    const titles = [];

    $('article h2, .post-title, .entry-title, a[href*="/2024"], a[href*="/2025"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && !titles.includes(text)) {
        titles.push(text);
      }
    });

    console.log(`📰 Encontrados ${titles.length} títulos:\n`);

    // 3. Classifica cada título com Gemini
    for (const title of titles.slice(0, 5)) {
      console.log(`📝 "${title.slice(0, 60)}..."`);

      const result = await GeminiClassifier.classifyArticle(title);

      console.log(`   → Categoria: ${result.category}`);
      console.log(`   → Confiança: ${(result.confidence * 100).toFixed(0)}%`);
      console.log(`   → Método: ${result.method}`);
      if (result.location) console.log(`   → Local: ${result.location}`);
      console.log('');
    }

    console.log('✅ Teste concluído!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

testGeminiWithColunaFla();
