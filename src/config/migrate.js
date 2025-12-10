/**
 * Database Migration Script
 * Executa migration SQL no PostgreSQL
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('🔄 Executando migration...\n');

  try {
    // Lê arquivo SQL
    const migrationPath = path.join(__dirname, '../../migrations/001_initial_schema.sql');
    const sql = await fs.readFile(migrationPath, 'utf-8');

    // Executa migration
    await pool.query(sql);

    console.log('✅ Migration executada com sucesso!\n');

    // Mostra estatísticas
    const stats = await pool.query(`
      SELECT 
        'Sites' as tabela, COUNT(*) as total FROM sites
      UNION ALL
      SELECT 
        'Articles' as tabela, COUNT(*) as total FROM articles
      UNION ALL
      SELECT 
        'Categories' as tabela, COUNT(*) as total FROM categories
      UNION ALL
      SELECT 
        'Scraping Logs' as tabela, COUNT(*) as total FROM scraping_logs
    `);

    console.log('📊 Estado do banco de dados:');
    console.table(stats.rows);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro na migration:', error);
    process.exit(1);
  }
}

runMigration();
