/**
 * Script para corrigir migração de categorias
 * Verifica e migra artigos que têm category (string) mas não têm category_id
 */

import pool from './src/config/database.js';

async function main() {
  console.log('🔍 Verificando dados para migração...\n');

  try {
    // 1. Verificar categorias existentes na tabela categories
    console.log('📦 Categorias existentes no banco:');
    const categories = await pool.query('SELECT id, name, slug FROM categories ORDER BY name');
    console.table(categories.rows);

    // 2. Verificar valores únicos de category (string) nos artigos
    console.log('\n📰 Valores de category (string) nos artigos:');
    const articleCategories = await pool.query(`
      SELECT DISTINCT category, COUNT(*) as count 
      FROM articles 
      WHERE category IS NOT NULL 
      GROUP BY category 
      ORDER BY count DESC
    `);
    console.table(articleCategories.rows);

    // 3. Verificar artigos que têm category mas não têm category_id
    console.log('\n⚠️  Artigos com category mas sem category_id:');
    const pendingArticles = await pool.query(`
      SELECT id, title, category, category_id 
      FROM articles 
      WHERE category IS NOT NULL AND category_id IS NULL
      LIMIT 10
    `);
    console.table(pendingArticles.rows.map(a => ({
      id: a.id,
      title: a.title?.substring(0, 50) + '...',
      category: a.category,
      category_id: a.category_id
    })));

    // 4. Criar categorias que faltam e migrar dados
    console.log('\n🔄 Migrando dados...');
    
    for (const row of articleCategories.rows) {
      const categoryName = row.category;
      if (!categoryName) continue;

      // Normaliza slug
      const slug = categoryName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      // Verifica se categoria existe
      let category = await pool.query(
        'SELECT id, name, slug FROM categories WHERE slug = $1 OR name = $2',
        [slug, categoryName]
      );

      if (category.rows.length === 0) {
        // Cria categoria
        console.log(`   📦 Criando categoria: "${categoryName}" (${slug})`);
        category = await pool.query(
          'INSERT INTO categories (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = $1 RETURNING *',
          [categoryName, slug]
        );
      }

      const categoryId = category.rows[0].id;

      // Atualiza artigos
      const updated = await pool.query(
        'UPDATE articles SET category_id = $1 WHERE category = $2 AND category_id IS NULL RETURNING id',
        [categoryId, categoryName]
      );

      if (updated.rowCount > 0) {
        console.log(`   ✅ ${updated.rowCount} artigos migrados para "${categoryName}" (id: ${categoryId})`);
      }
    }

    // 5. Verificar resultado
    console.log('\n📊 Resultado da migração:');
    const result = await pool.query(`
      SELECT 
        'Total de artigos' as status, COUNT(*) as total FROM articles
      UNION ALL
      SELECT 
        'Com category_id' as status, COUNT(*) as total FROM articles WHERE category_id IS NOT NULL
      UNION ALL
      SELECT 
        'Sem category_id' as status, COUNT(*) as total FROM articles WHERE category_id IS NULL
    `);
    console.table(result.rows);

    console.log('\n✅ Migração concluída!');
    
    // Se todos artigos foram migrados, mostrar instrução para remover coluna
    const remaining = await pool.query('SELECT COUNT(*) as count FROM articles WHERE category IS NOT NULL AND category_id IS NULL');
    if (parseInt(remaining.rows[0].count) === 0) {
      console.log('\n🎉 Todos os artigos foram migrados!');
      console.log('   Você pode agora remover a coluna category antiga:');
      console.log('   ALTER TABLE articles DROP COLUMN category;');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }

  process.exit(0);
}

main();

