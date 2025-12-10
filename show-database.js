/**
 * Mostra o que está no banco de dados
 */

import pool from './src/config/database.js';

console.log('📊 Consultando banco de dados...\n');

async function showDatabase() {
  try {
    // 1. Sites
    console.log('📌 SITES');
    const sites = await pool.query('SELECT * FROM sites ORDER BY id');
    console.table(sites.rows);

    // 2. Artigos (mostra alguns campos principais)
    console.log('\n📰 ARTIGOS (primeiros 5)');
    const articles = await pool.query(`
      SELECT 
        id,
        site_id,
        LEFT(title, 60) as title,
        LEFT(url, 50) as url,
        category,
        category_confidence,
        image_url IS NOT NULL as has_image,
        published_at,
        created_at
      FROM articles 
      ORDER BY id 
      LIMIT 5
    `);
    console.table(articles.rows);

    // 3. Categorias
    console.log('\n🏷️ CATEGORIAS');
    const categories = await pool.query('SELECT * FROM categories ORDER BY name');
    console.log(`Total: ${categories.rows.length} categorias`);
    categories.rows.forEach(cat => {
      console.log(`  • ${cat.name} (${cat.slug})`);
    });

    // 4. Logs de scraping
    console.log('\n📋 LOGS DE SCRAPING');
    const logs = await pool.query(`
      SELECT 
        sl.id,
        s.name as site_name,
        sl.status,
        sl.articles_found,
        sl.scraping_duration,
        sl.created_at
      FROM scraping_logs sl
      JOIN sites s ON sl.site_id = s.id
      ORDER BY sl.id DESC
      LIMIT 5
    `);
    console.table(logs.rows);

    // 5. Estatísticas
    console.log('\n📊 ESTATÍSTICAS');
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM sites) as total_sites,
        (SELECT COUNT(*) FROM articles) as total_articles,
        (SELECT COUNT(*) FROM articles WHERE category IS NOT NULL) as categorized_articles,
        (SELECT COUNT(DISTINCT category) FROM articles WHERE category IS NOT NULL) as categories_used
    `);
    console.table(stats.rows);

    // 6. Artigos por categoria
    console.log('\n📈 ARTIGOS POR CATEGORIA');
    const byCategory = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM articles
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `);
    console.table(byCategory.rows);

    console.log('\n✅ Consulta concluída!\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

showDatabase();
