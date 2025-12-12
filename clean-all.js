/**
 * Script para limpar TUDO - Banco de dados + Redis
 * Remove todos os dados para teste do zero
 * 
 * Uso: node clean-all.js
 */

import pool from './src/config/database.js';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

async function cleanAll() {
  console.log('🧹 LIMPEZA TOTAL - Banco de dados + Redis\n');
  console.log('=' .repeat(50));
  
  // ============== LIMPAR REDIS ==============
  console.log('\n📦 REDIS:');
  
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redis = createClient({ url: redisUrl });
    
    redis.on('error', (err) => console.error('Redis Error:', err.message));
    
    await redis.connect();
    console.log('   ✅ Conectado ao Redis');
    
    // Lista todas as chaves
    const allKeys = await redis.keys('*');
    console.log(`   📊 Total de chaves: ${allKeys.length}`);
    
    if (allKeys.length > 0) {
      // Agrupa por tipo
      const keyTypes = {};
      for (const key of allKeys) {
        const prefix = key.split(':')[0];
        keyTypes[prefix] = (keyTypes[prefix] || 0) + 1;
      }
      
      console.log('   📋 Por tipo:');
      for (const [type, count] of Object.entries(keyTypes)) {
        console.log(`      - ${type}: ${count}`);
      }
      
      // Deleta tudo
      await redis.flushDb();
      console.log('   ✅ Todas as chaves removidas (FLUSHDB)');
    } else {
      console.log('   ℹ️  Redis já está vazio');
    }
    
    await redis.disconnect();
  } catch (error) {
    console.log(`   ⚠️  Redis não disponível: ${error.message}`);
  }
  
  // ============== LIMPAR BANCO ==============
  console.log('\n🗄️  BANCO DE DADOS:');
  
  try {
    // Ordem importante por causa das Foreign Keys
    
    // 1. Tabelas de Learning System
    try {
      const clickedTitles = await pool.query('DELETE FROM clicked_titles_analysis RETURNING id');
      console.log(`   ✅ clicked_titles_analysis: ${clickedTitles.rowCount} removidos`);
    } catch (e) { console.log(`   ⚠️  clicked_titles_analysis: ${e.message}`); }
    
    try {
      const keywords = await pool.query('DELETE FROM user_keyword_affinity RETURNING id');
      console.log(`   ✅ user_keyword_affinity: ${keywords.rowCount} removidos`);
    } catch (e) { console.log(`   ⚠️  user_keyword_affinity: ${e.message}`); }
    
    try {
      const sessions = await pool.query('DELETE FROM user_sessions RETURNING id');
      console.log(`   ✅ user_sessions: ${sessions.rowCount} removidos`);
    } catch (e) { console.log(`   ⚠️  user_sessions: ${e.message}`); }
    
    try {
      const profiles = await pool.query('DELETE FROM user_profiles RETURNING user_id');
      console.log(`   ✅ user_profiles: ${profiles.rowCount} removidos`);
    } catch (e) { console.log(`   ⚠️  user_profiles: ${e.message}`); }
    
    // 2. Tabelas de interações
    try {
      const interactions = await pool.query('DELETE FROM user_interactions RETURNING id');
      console.log(`   ✅ user_interactions: ${interactions.rowCount} removidos`);
    } catch (e) { console.log(`   ⚠️  user_interactions: ${e.message}`); }
    
    try {
      const prefs = await pool.query('DELETE FROM user_category_preferences RETURNING id');
      console.log(`   ✅ user_category_preferences: ${prefs.rowCount} removidos`);
    } catch (e) { console.log(`   ⚠️  user_category_preferences: ${e.message}`); }
    
    // 3. Bookmarks
    try {
      const bookmarks = await pool.query('DELETE FROM bookmarks RETURNING id');
      console.log(`   ✅ bookmarks: ${bookmarks.rowCount} removidos`);
    } catch (e) { /* tabela pode não existir */ }
    
    try {
      const userBookmarks = await pool.query('DELETE FROM user_bookmarks RETURNING id');
      console.log(`   ✅ user_bookmarks: ${userBookmarks.rowCount} removidos`);
    } catch (e) { /* tabela pode não existir */ }
    
    // 4. Usuários
    try {
      const users = await pool.query('DELETE FROM users RETURNING id');
      console.log(`   ✅ users: ${users.rowCount} removidos`);
    } catch (e) { console.log(`   ⚠️  users: ${e.message}`); }
    
    // 5. Similaridades
    try {
      const similarities = await pool.query('DELETE FROM article_similarities RETURNING id');
      console.log(`   ✅ article_similarities: ${similarities.rowCount} removidos`);
    } catch (e) { /* tabela pode não existir */ }
    
    // 6. Logs de scraping
    try {
      const logs = await pool.query('DELETE FROM scraping_logs RETURNING id');
      console.log(`   ✅ scraping_logs: ${logs.rowCount} removidos`);
    } catch (e) { console.log(`   ⚠️  scraping_logs: ${e.message}`); }
    
    // 7. Artigos
    try {
      const articles = await pool.query('DELETE FROM articles RETURNING id');
      console.log(`   ✅ articles: ${articles.rowCount} removidos`);
    } catch (e) { console.log(`   ⚠️  articles: ${e.message}`); }
    
    // 8. Sites
    try {
      const sites = await pool.query('DELETE FROM sites RETURNING id');
      console.log(`   ✅ sites: ${sites.rowCount} removidos`);
    } catch (e) { console.log(`   ⚠️  sites: ${e.message}`); }
    
    // 9. NÃO deletar categorias - são necessárias para o sistema
    // Apenas mostra quantas existem
    const categories = await pool.query('SELECT COUNT(*) as count FROM categories');
    console.log(`   ℹ️  categories: ${categories.rows[0].count} mantidas (necessárias)`);
    
    // 10. NÃO deletar engagement_config - são configs do sistema
    try {
      const config = await pool.query('SELECT COUNT(*) as count FROM engagement_config');
      console.log(`   ℹ️  engagement_config: ${config.rows[0].count} mantidas (configuração)`);
    } catch (e) { /* tabela pode não existir */ }
    
    // Reset sequences (IDs voltam para 1)
    console.log('\n🔄 RESETANDO SEQUÊNCIAS:');
    
    const sequences = [
      'users_id_seq',
      'articles_id_seq', 
      'sites_id_seq',
      'user_interactions_id_seq',
      'scraping_logs_id_seq',
      'user_category_preferences_id_seq'
    ];
    
    for (const seq of sequences) {
      try {
        await pool.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
        console.log(`   ✅ ${seq} resetada`);
      } catch (e) {
        // Sequência pode não existir
      }
    }
    
    // Mostra estado final
    console.log('\n📊 ESTADO FINAL:');
    const stats = await pool.query(`
      SELECT 'sites' as tabela, COUNT(*) as total FROM sites
      UNION ALL SELECT 'articles', COUNT(*) FROM articles
      UNION ALL SELECT 'users', COUNT(*) FROM users
      UNION ALL SELECT 'categories', COUNT(*) FROM categories
      UNION ALL SELECT 'user_interactions', COUNT(*) FROM user_interactions
    `);
    console.table(stats.rows);
    
  } catch (error) {
    console.error('   ❌ Erro no banco:', error.message);
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ LIMPEZA COMPLETA! Sistema pronto para teste do zero.');
  console.log('=' .repeat(50) + '\n');
  
  process.exit(0);
}

cleanAll();
