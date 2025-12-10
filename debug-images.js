/**
 * Debug de extração de imagem do Coluna do Fla
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugImageExtraction() {
  console.log('🔍 Debug de extração de imagens...\n');

  try {
    const response = await axios.get('https://colunadofla.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);

    // Busca artigos
    const articles = $('article').slice(0, 3);

    articles.each((i, el) => {
      console.log(`\n=== ARTIGO ${i + 1} ===`);

      const $el = $(el);

      // Título
      const title = $el.find('h2, h3, h4, .entry-title').first().text().trim();
      console.log('Título:', title?.slice(0, 50) || 'N/A');

      // Link
      const link = $el.find('a').first().attr('href');
      console.log('Link:', link?.slice(0, 60) || 'N/A');

      // Imagens
      console.log('\n📷 IMAGENS ENCONTRADAS:');

      // 1. img.wp-post-image
      const $wpImg = $el.find('img.wp-post-image');
      if ($wpImg.length) {
        console.log('  [wp-post-image]', $wpImg.attr('src')?.slice(0, 60));
      }

      // 2. img.featured-img
      const $featImg = $el.find('img.featured-img');
      if ($featImg.length) {
        console.log('  [featured-img]', $featImg.attr('src')?.slice(0, 60));
      }

      // 3. Qualquer img
      const $allImgs = $el.find('img');
      console.log(`  [total imgs]: ${$allImgs.length}`);
      $allImgs.each((j, img) => {
        const src = $(img).attr('src');
        const dataSrc = $(img).attr('data-src');
        const classes = $(img).attr('class');
        console.log(`    ${j}. src="${src?.slice(0, 50) || 'N/A'}" data-src="${dataSrc?.slice(0, 50) || 'N/A'}" class="${classes || 'N/A'}"`);
      });
    });

    // Testa links diretos
    console.log('\n\n=== LINKS DIRETOS (/2025/) ===');
    $('a[href*="/2025/"]').slice(0, 3).each((i, el) => {
      const $a = $(el);
      const href = $a.attr('href');
      const text = $a.text().trim().slice(0, 40);

      // Busca imagem dentro ou antes do link
      const $img = $a.find('img').first();
      const imgSrc = $img.attr('src') || $img.attr('data-src');

      // Busca imagem no parent
      const $parentImg = $a.parent().find('img').first();
      const parentImgSrc = $parentImg.attr('src') || $parentImg.attr('data-src');

      console.log(`Link ${i + 1}: ${text || 'sem texto'}`);
      console.log(`  img dentro: ${imgSrc?.slice(0, 50) || 'N/A'}`);
      console.log(`  img parent: ${parentImgSrc?.slice(0, 50) || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

debugImageExtraction();
