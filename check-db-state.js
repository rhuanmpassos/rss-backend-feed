/**
 * Verifica o estado atual do banco de dados
 */

import pool from './src/config/database.js';

async function checkDatabase() {
  try {
    console.log('📊 Verificando estado do banco de dados...\n');

    // Tabelas existentes
    console.log('=== TABELAS EXISTENTES ===');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    tables.rows.forEach(t => console.log(`  • ${t.table_name}`));

    // Sites
    console.log('\n=== SITES ===');
    const sites = await pool.query('SELECT * FROM sites');
    console.log(`Total: ${sites.rows.length}`);
    if (sites.rows.length > 0) console.table(sites.rows);

    // Articles
    console.log('\n=== ARTICLES ===');
    const articlesCount = await pool.query('SELECT COUNT(*) FROM articles');
    console.log(`Total: ${articlesCount.rows[0].count}`);
    const articles = await pool.query(`
      SELECT id, LEFT(title, 50) as title, category_id, site_id, created_at 
      FROM articles 
      ORDER BY id DESC 
      LIMIT 5
    `);
    if (articles.rows.length > 0) console.table(articles.rows);

    // Categories
    console.log('\n=== CATEGORIES ===');
    const categories = await pool.query('SELECT * FROM categories ORDER BY name');
    console.log(`Total: ${categories.rows.length}`);
    if (categories.rows.length > 0) console.table(categories.rows);

    // Users
    console.log('\n=== USERS ===');
    const users = await pool.query('SELECT * FROM users');
    console.log(`Total: ${users.rows.length}`);
    if (users.rows.length > 0) console.table(users.rows);

    // User Preferences
    console.log('\n=== USER_CATEGORY_PREFERENCES ===');
    const prefs = await pool.query('SELECT * FROM user_category_preferences');
    console.log(`Total: ${prefs.rows.length}`);
    if (prefs.rows.length > 0) console.table(prefs.rows);

    // User Interactions
    console.log('\n=== USER_INTERACTIONS ===');
    const interactions = await pool.query('SELECT * FROM user_interactions');
    console.log(`Total: ${interactions.rows.length}`);
    if (interactions.rows.length > 0) console.table(interactions.rows);

    // Scraping Logs
    console.log('\n=== SCRAPING_LOGS ===');
    const logs = await pool.query('SELECT COUNT(*) FROM scraping_logs');
    console.log(`Total: ${logs.rows[0].count}`);

    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

checkDatabase();

