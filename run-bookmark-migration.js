/**
 * Run Bookmark Migration
 */

import pool from './src/config/database.js';
import fs from 'fs/promises';

console.log('🔄 Executando migration de bookmarks...\n');

async function runMigration() {
  try {
    // Lê e executa migration
    const sql = await fs.readFile('./migrations/002_add_bookmarks.sql', 'utf-8');
    await pool.query(sql);

    console.log('✅ Migration de bookmarks concluída!\n');

    // Verifica estrutura da tabela
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'articles' AND column_name = 'bookmarked'
    `);

    console.log('📋 Coluna bookmarked:');
    console.table(result.rows);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

runMigration();
