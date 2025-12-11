/**
 * Verifica artigos com categoria "null" (string)
 */
import pool from './src/config/database.js';

async function check() {
  // Artigos com categoria "null" (id 24)
  const articles = await pool.query(`
    SELECT a.id, a.title, a.summary, s.name as site
    FROM articles a
    LEFT JOIN sites s ON a.site_id = s.id
    WHERE a.category_id = 24
  `);
  
  console.log('ARTIGOS COM CATEGORIA "null" (id=24):\n');
  articles.rows.forEach(a => {
    console.log('---');
    console.log('ID:', a.id);
    console.log('Título:', a.title);
    console.log('Resumo:', a.summary?.slice(0, 200) || 'N/A');
    console.log('Site:', a.site);
  });
  
  console.log('\n\nTotal:', articles.rows.length, 'artigos');
  
  process.exit(0);
}

check();

