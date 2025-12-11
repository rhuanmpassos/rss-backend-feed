/**
 * Verifica artigos com category_id NULL
 */
import pool from './src/config/database.js';

async function checkNullCategories() {
  try {
    console.log('📊 VERIFICANDO ARTIGOS COM CATEGORIA NULL...\n');

    // Resumo geral
    const summary = await pool.query(`
      SELECT 
        COUNT(*) as total_articles,
        COUNT(*) FILTER (WHERE category_id IS NOT NULL) as with_category,
        COUNT(*) FILTER (WHERE category_id IS NULL) as without_category
      FROM articles
    `);
    
    console.log('=== RESUMO GERAL ===');
    console.log('Total artigos:', summary.rows[0].total_articles);
    console.log('Com categoria:', summary.rows[0].with_category);
    console.log('SEM categoria (NULL):', summary.rows[0].without_category);
    
    // Exemplos de artigos sem categoria
    console.log('\n=== EXEMPLOS DE ARTIGOS SEM CATEGORIA ===');
    const examples = await pool.query(`
      SELECT a.id, LEFT(a.title, 70) as title, s.name as site, a.created_at
      FROM articles a
      LEFT JOIN sites s ON a.site_id = s.id
      WHERE a.category_id IS NULL
      ORDER BY a.created_at DESC
      LIMIT 15
    `);
    console.table(examples.rows);

    // Verifica categorias existentes
    console.log('\n=== CATEGORIAS EXISTENTES ===');
    const cats = await pool.query('SELECT id, name, slug FROM categories ORDER BY name');
    console.table(cats.rows);

    // Artigos por categoria
    console.log('\n=== CONTAGEM POR CATEGORIA ===');
    const stats = await pool.query(`
      SELECT 
        COALESCE(c.name, '*** SEM CATEGORIA ***') as categoria,
        COUNT(*) as quantidade
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      GROUP BY c.name
      ORDER BY quantidade DESC
    `);
    console.table(stats.rows);

    // Verifica se há artigos recentes sem categoria
    console.log('\n=== ARTIGOS SEM CATEGORIA NAS ÚLTIMAS 24H ===');
    const recent = await pool.query(`
      SELECT COUNT(*) as count
      FROM articles
      WHERE category_id IS NULL 
        AND created_at >= NOW() - INTERVAL '24 hours'
    `);
    console.log('Artigos recentes sem categoria:', recent.rows[0].count);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

checkNullCategories();

