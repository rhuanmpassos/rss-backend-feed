/**
 * Corrige artigos com categoria "null" (string literal)
 * 1. Seta category_id = NULL para reclassificação
 * 2. Remove a categoria "null" do banco
 */
import pool from './src/config/database.js';

async function fixNullCategory() {
  try {
    console.log('🔧 Corrigindo artigos com categoria "null"...\n');

    // 1. Encontra a categoria "null" (string)
    const nullCat = await pool.query(
      "SELECT id FROM categories WHERE name = 'null' OR slug = 'null'"
    );

    if (nullCat.rows.length === 0) {
      console.log('✅ Categoria "null" não existe - nada a corrigir');
      process.exit(0);
    }

    const nullCatId = nullCat.rows[0].id;
    console.log(`📍 Encontrada categoria "null" com id: ${nullCatId}`);

    // 2. Conta artigos afetados
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM articles WHERE category_id = $1',
      [nullCatId]
    );
    const count = parseInt(countResult.rows[0].count);
    console.log(`📊 Artigos afetados: ${count}`);

    if (count > 0) {
      // 3. Seta category_id = NULL para reclassificação
      const updateResult = await pool.query(
        'UPDATE articles SET category_id = NULL, category_confidence = NULL WHERE category_id = $1 RETURNING id, title',
        [nullCatId]
      );

      console.log('\n📝 Artigos marcados para reclassificação:');
      updateResult.rows.forEach(a => {
        console.log(`   - [${a.id}] ${a.title}`);
      });
    }

    // 4. Remove a categoria "null"
    await pool.query('DELETE FROM categories WHERE id = $1', [nullCatId]);
    console.log(`\n🗑️ Categoria "null" (id=${nullCatId}) removida`);

    console.log('\n✅ Correção concluída!');
    console.log('   Os artigos serão reclassificados automaticamente pelo worker.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

fixNullCategory();

