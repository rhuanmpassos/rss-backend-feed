/**
 * Script para executar migrações do banco de dados
 * Executa as migrações 003 e 004 para implementar categorias dinâmicas
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(migrationFile) {
  console.log(`\n🔄 Executando migração: ${migrationFile}`);
  
  try {
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    const sql = await fs.readFile(migrationPath, 'utf-8');
    
    await pool.query(sql);
    console.log(`✅ Migração ${migrationFile} executada com sucesso!`);
    return true;
  } catch (error) {
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

async function main() {
  console.log('🚀 Iniciando migrações para categorias dinâmicas...\n');
  
  // Mostra estado antes
  await showStats();
  
  // Executa migração 003 (category_id)
  const migration003 = await runMigration('003_add_category_id.sql');
  
  if (migration003) {
    // Executa migração 004 (users)
    await runMigration('004_create_users_tables.sql');
  }
  
  // Mostra estado depois
  await showStats();
  await checkUsersTable();
  
  console.log('\n✅ Migrações concluídas!');
  console.log('\n⚠️  IMPORTANTE: Verifique se todos os artigos com categoria foram migrados.');
  console.log('   Se "Articles sem category_id" > 0 e "Articles com category_id" correto,');
  console.log('   você pode descomentar o DROP COLUMN no arquivo 003_add_category_id.sql');
  
  process.exit(0);
}

main().catch(error => {
  console.error('Erro fatal:', error);
  process.exit(1);
});

