/**
 * Script para executar migrações do banco de dados
 * Executa as migrações necessárias, incluindo sistema de aprendizado
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Verifica se uma tabela já existe
 */
async function tableExists(tableName) {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [tableName]);
    return result.rows[0].exists;
  } catch (error) {
    return false;
  }
}

async function runMigration(migrationFile, skipIfExists = null) {
  console.log(`\n🔄 Executando migração: ${migrationFile}`);
  
  // Verifica se deve pular se tabela já existe
  if (skipIfExists) {
    const exists = await tableExists(skipIfExists);
    if (exists) {
      console.log(`⏭️  Tabela ${skipIfExists} já existe. Pulando migração.`);
      return true;
    }
  }
  
  try {
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    const sql = await fs.readFile(migrationPath, 'utf-8');
    
    await pool.query(sql);
    console.log(`✅ Migração ${migrationFile} executada com sucesso!`);
    return true;
  } catch (error) {
    // Se erro é "already exists", considera sucesso
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      console.log(`⚠️  Migração ${migrationFile} já foi executada (objetos já existem)`);
      return true;
    }
    console.error(`❌ Erro na migração ${migrationFile}:`, error.message);
    return false;
  }
}

async function showStats() {
  console.log('\n📊 Estado do banco de dados:');
  
  try {
    const stats = await pool.query(`
      SELECT 'Sites' as tabela, COUNT(*) as total FROM sites
      UNION ALL
      SELECT 'Articles' as tabela, COUNT(*) as total FROM articles
      UNION ALL
      SELECT 'Categories' as tabela, COUNT(*) as total FROM categories
      UNION ALL
      SELECT 'Articles com category_id' as tabela, COUNT(*) as total FROM articles WHERE category_id IS NOT NULL
      UNION ALL
      SELECT 'Articles sem category_id' as tabela, COUNT(*) as total FROM articles WHERE category_id IS NULL
    `);
    
    console.table(stats.rows);
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error.message);
  }
}

async function checkUsersTable() {
  try {
    const result = await pool.query(`
      SELECT 'Users' as tabela, COUNT(*) as total FROM users
      UNION ALL
      SELECT 'User Preferences' as tabela, COUNT(*) as total FROM user_category_preferences
      UNION ALL
      SELECT 'User Interactions' as tabela, COUNT(*) as total FROM user_interactions
    `);
    console.log('\n👤 Tabelas de usuários:');
    console.table(result.rows);
  } catch (error) {
    // Tabelas ainda não existem
    console.log('\n👤 Tabelas de usuários ainda não existem');
  }
}

async function checkLearningTables() {
  try {
    const result = await pool.query(`
      SELECT 'User Profiles' as tabela, COUNT(*) as total FROM user_profiles
      UNION ALL
      SELECT 'User Sessions' as tabela, COUNT(*) as total FROM user_sessions
      UNION ALL
      SELECT 'Keyword Affinity' as tabela, COUNT(*) as total FROM user_keyword_affinity
      UNION ALL
      SELECT 'Clicked Titles' as tabela, COUNT(*) as total FROM clicked_titles_analysis
    `);
    console.log('\n🧠 Tabelas de aprendizado:');
    console.table(result.rows);
  } catch (error) {
    // Tabelas ainda não existem
    console.log('\n🧠 Tabelas de aprendizado ainda não existem');
  }
}

async function main() {
  console.log('🚀 Iniciando migrações do banco de dados...\n');
  
  // Mostra estado antes
  await showStats();
  
  // Executa migração 003 (category_id) - pode falhar por permissão, mas não é crítico
  console.log('\n📝 Migrações básicas:');
  await runMigration('003_add_category_id.sql');
  
  // Executa migração 004 (users)
  await runMigration('004_create_users_tables.sql', 'users');
  
  // Executa migração 005 (embeddings) se necessário
  const hasEmbeddings = await tableExists('articles');
  if (hasEmbeddings) {
    try {
      const checkEmbedding = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'articles' AND column_name = 'embedding'
      `);
      if (checkEmbedding.rows.length === 0) {
        await runMigration('005_add_embeddings.sql');
      } else {
        console.log('⏭️  Coluna embedding já existe. Pulando migração 005.');
      }
    } catch (error) {
      console.log('⚠️  Não foi possível verificar embeddings:', error.message);
    }
  }
  
  // Executa migração 008 (sistema de aprendizado) - IMPORTANTE!
  console.log('\n🧠 Sistema de aprendizado:');
  await runMigration('008_learning_system.sql', 'user_profiles');
  
  // Mostra estado depois
  await showStats();
  await checkUsersTable();
  await checkLearningTables();
  
  console.log('\n✅ Migrações concluídas!');
  console.log('\n📋 Próximos passos:');
  console.log('   1. Verifique se as tabelas de aprendizado foram criadas');
  console.log('   2. O sistema de engajamento está pronto para uso');
  console.log('   3. Teste os endpoints: /feeds/addictive, /api/interactions');
  
  process.exit(0);
}

main().catch(error => {
  console.error('Erro fatal:', error);
  process.exit(1);
});

