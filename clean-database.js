/**
 * Script para limpar banco de dados COMPLETAMENTE
 * Remove TUDO - sites, artigos, categorias, usuários, etc.
 */

import pool from './src/config/database.js';

async function cleanDB() {
  console.log('🧹 Limpando banco de dados COMPLETAMENTE...\n');
  
  try {
    // Ordem importante: tabelas com FK primeiro
    
    // Limpa interações de usuário
    const interactions = await pool.query('DELETE FROM user_interactions RETURNING id');
    console.log('✅ User interactions removidos:', interactions.rowCount);
    
    // Limpa preferências de usuário
    const prefs = await pool.query('DELETE FROM user_category_preferences RETURNING id');
    console.log('✅ User preferences removidos:', prefs.rowCount);
    
    // Limpa usuários
    const users = await pool.query('DELETE FROM users RETURNING id');
    console.log('✅ Users removidos:', users.rowCount);
    
    // Limpa logs de scraping
    const logs = await pool.query('DELETE FROM scraping_logs RETURNING id');
    console.log('✅ Logs de scraping removidos:', logs.rowCount);
    
    // Limpa artigos
    const articles = await pool.query('DELETE FROM articles RETURNING id');
    console.log('✅ Artigos removidos:', articles.rowCount);
    
    // Limpa sites
    const sites = await pool.query('DELETE FROM sites RETURNING id');
    console.log('✅ Sites removidos:', sites.rowCount);
    
    // Limpa categorias
    const categories = await pool.query('DELETE FROM categories RETURNING id');
    console.log('✅ Categorias removidas:', categories.rowCount);
    
    // Mostra estado final
    console.log('\n📊 Estado final (tudo zerado):');
    const stats = await pool.query(`
      SELECT 'Sites' as tabela, COUNT(*) as total FROM sites
      UNION ALL SELECT 'Articles', COUNT(*) FROM articles
      UNION ALL SELECT 'Categories', COUNT(*) FROM categories
      UNION ALL SELECT 'Users', COUNT(*) FROM users
    `);
    console.table(stats.rows);
    
    console.log('\n✅ Banco ZERADO! Pronto para receber tudo novamente.');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
  
  process.exit(0);
}

cleanDB();

