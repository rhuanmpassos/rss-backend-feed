/**
 * Script para configurar embeddings (pgvector)
 * 1. Verifica se pgvector está disponível
 * 2. Executa migração
 * 3. Instala dependências
 */

import pool from './src/config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkPgvector() {
  console.log('🔍 Verificando se pgvector está disponível...\n');
  
  try {
    // Tenta criar extensão
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    
    // Verifica se foi criada
    const result = await pool.query(`
      SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as installed
    `);
    
    if (result.rows[0].installed) {
      console.log('✅ pgvector está instalado e disponível!\n');
      return true;
    } else {
      console.log('❌ pgvector NÃO está disponível neste banco.\n');
      return false;
    }
  } catch (error) {
    console.log('❌ Erro ao verificar pgvector:', error.message);
    console.log('\n⚠️  Seu serviço de banco pode não suportar pgvector.');
    console.log('   Serviços que suportam: Supabase, Neon, Render (versões recentes)\n');
    return false;
  }
}

async function runMigration() {
  console.log('🔄 Executando migração de embeddings...\n');
  
  try {
    const migrationPath = path.join(__dirname, 'migrations', '005_add_embeddings.sql');
    const sql = await fs.readFile(migrationPath, 'utf-8');
    
    await pool.query(sql);
    console.log('✅ Migração executada com sucesso!\n');
    return true;
  } catch (error) {
    console.error('❌ Erro na migração:', error.message);
    return false;
  }
}

async function checkColumn() {
  console.log('🔍 Verificando coluna embedding...\n');
  
  const result = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'articles' AND column_name = 'embedding'
  `);
  
  if (result.rows.length > 0) {
    console.log('✅ Coluna embedding existe!');
    console.log(`   Tipo: ${result.rows[0].data_type}\n`);
    return true;
  } else {
    console.log('❌ Coluna embedding NÃO existe\n');
    return false;
  }
}

async function installNpmPackage() {
  console.log('📦 Verificando @xenova/transformers...\n');
  
  try {
    // Tenta importar
    await import('@xenova/transformers');
    console.log('✅ @xenova/transformers já está instalado!\n');
    return true;
  } catch (error) {
    console.log('⚠️  @xenova/transformers não está instalado.');
    console.log('   Instalando... (pode demorar ~1 minuto)\n');
    
    try {
      execSync('npm install @xenova/transformers', { 
        stdio: 'inherit',
        cwd: __dirname
      });
      console.log('\n✅ @xenova/transformers instalado com sucesso!\n');
      return true;
    } catch (installError) {
      console.error('❌ Erro ao instalar:', installError.message);
      return false;
    }
  }
}

async function main() {
  console.log('🚀 Configurando suporte a embeddings...\n');
  console.log('='.repeat(50) + '\n');
  
  // 1. Verifica pgvector
  const hasPgvector = await checkPgvector();
  
  if (!hasPgvector) {
    console.log('⚠️  Sem pgvector, embeddings não funcionarão no banco.');
    console.log('   O sistema ainda funciona com recomendação por categorias.\n');
    console.log('   Para habilitar pgvector:');
    console.log('   - Supabase: já vem instalado');
    console.log('   - Neon: já vem instalado');
    console.log('   - Render: upgrade para versão com extensões');
    console.log('   - Local: apt install postgresql-16-pgvector\n');
  } else {
    // 2. Executa migração
    await runMigration();
    
    // 3. Verifica coluna
    await checkColumn();
  }
  
  // 4. Instala pacote npm
  await installNpmPackage();
  
  console.log('='.repeat(50));
  console.log('\n📊 Resumo:');
  console.log(`   pgvector: ${hasPgvector ? '✅' : '❌'}`);
  console.log(`   Coluna embedding: ${hasPgvector ? '✅' : '❌'}`);
  console.log(`   @xenova/transformers: Verificar acima\n`);
  
  if (hasPgvector) {
    console.log('🎉 Tudo pronto para usar embeddings!');
  } else {
    console.log('ℹ️  Sistema funcionará com recomendação por categorias.');
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error('Erro fatal:', error);
  process.exit(1);
});

