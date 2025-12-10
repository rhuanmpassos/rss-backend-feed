/**
 * Testes do IMPLEMENTATION_PLAN.md
 * Verifica se o sistema de categorias dinâmicas está funcionando
 */

import pool from './src/config/database.js';
import Category from './src/models/Category.js';
import Article from './src/models/Article.js';
import User from './src/models/User.js';
import UserCategoryPreference from './src/models/UserCategoryPreference.js';
import categoryService from './src/services/categoryService.js';

const tests = {
  passed: 0,
  failed: 0,
  results: []
};

function test(name, passed, details = '') {
  if (passed) {
    tests.passed++;
    tests.results.push({ name, status: '✅ PASS', details });
    console.log(`✅ PASS: ${name}`);
  } else {
    tests.failed++;
    tests.results.push({ name, status: '❌ FAIL', details });
    console.log(`❌ FAIL: ${name} - ${details}`);
  }
}

async function runTests() {
  console.log('🧪 Executando testes do IMPLEMENTATION_PLAN.md\n');
  console.log('='.repeat(60) + '\n');

  // ============================================
  // TESTE 1: Migrações aplicadas corretamente
  // ============================================
  console.log('📋 TESTE 1: Verificar migrações aplicadas\n');

  // 1.1 Tabela articles tem category_id (não category string)
  try {
    const columns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'articles' AND column_name IN ('category_id', 'category')
    `);
    const hasCategory_id = columns.rows.some(c => c.column_name === 'category_id');
    const hasCategory = columns.rows.some(c => c.column_name === 'category');
    
    test('articles.category_id existe', hasCategory_id);
    test('articles.category (string) foi removida', !hasCategory, 
      hasCategory ? 'Coluna category ainda existe' : '');
  } catch (e) {
    test('Verificar schema articles', false, e.message);
  }

  // 1.2 Tabelas de usuários existem
  try {
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'user_category_preferences', 'user_interactions')
    `);
    test('Tabelas de usuários existem', tables.rows.length === 3,
      `Encontradas: ${tables.rows.map(t => t.table_name).join(', ')}`);
  } catch (e) {
    test('Tabelas de usuários', false, e.message);
  }

  // ============================================
  // TESTE 2: Classificação livre do Gemini
  // ============================================
  console.log('\n📋 TESTE 2: Classificação livre do Gemini\n');

  // 2.1 Artigos foram classificados com category_id (não string)
  try {
    const articles = await pool.query(`
      SELECT id, title, category_id FROM articles WHERE category_id IS NOT NULL LIMIT 5
    `);
    test('Artigos classificados com category_id', articles.rows.length > 0,
      `${articles.rows.length} artigos com category_id`);
    
    // Mostrar exemplos
    if (articles.rows.length > 0) {
      console.log('   Exemplos de artigos classificados:');
      for (const a of articles.rows.slice(0, 3)) {
        console.log(`   - [${a.category_id}] ${a.title.substring(0, 50)}...`);
      }
    }
  } catch (e) {
    test('Artigos classificados', false, e.message);
  }

  // ============================================
  // TESTE 3: Normalização de categorias
  // ============================================
  console.log('\n📋 TESTE 3: Normalização de categorias\n');

  // 3.1 Testar função de normalização
  try {
    const testCases = [
      { input: 'Futebol', expected: 'futebol' },
      { input: 'Fórmula 1', expected: 'formula-1' },
      { input: 'Pré-Jogo de Futebol', expected: 'prejogo-de-futebol' },
      { input: 'POLÍTICA BRASILEIRA', expected: 'politica-brasileira' },
      { input: 'E-Sports', expected: 'esports' },
    ];

    let allPassed = true;
    console.log('   Testando normalização de slugs:');
    for (const tc of testCases) {
      const result = categoryService.normalizeSlug(tc.input);
      const passed = result === tc.expected;
      if (!passed) allPassed = false;
      console.log(`   ${passed ? '✓' : '✗'} "${tc.input}" → "${result}" (esperado: "${tc.expected}")`);
    }
    test('Função normalizeSlug funciona corretamente', allPassed);
  } catch (e) {
    test('normalizeSlug', false, e.message);
  }

  // ============================================
  // TESTE 4: Criação automática de categorias
  // ============================================
  console.log('\n📋 TESTE 4: Criação automática de categorias\n');

  // 4.1 Testar normalizeAndGetCategory com categoria existente
  try {
    const existing = await categoryService.normalizeAndGetCategory('Futebol');
    test('normalizeAndGetCategory retorna categoria existente', 
      existing && existing.slug === 'futebol',
      `Retornou: ${existing ? existing.name : 'null'}`);
  } catch (e) {
    test('Categoria existente', false, e.message);
  }

  // 4.2 Testar criação de nova categoria
  try {
    const newCat = await categoryService.normalizeAndGetCategory('Badminton');
    test('normalizeAndGetCategory cria nova categoria', 
      newCat && newCat.slug === 'badminton',
      `Criou: ${newCat ? newCat.name : 'null'}`);
    
    // Verificar se foi salva no banco
    const saved = await Category.findBySlug('badminton');
    test('Nova categoria foi salva no banco', saved !== null);
  } catch (e) {
    test('Criar nova categoria', false, e.message);
  }

  // 4.3 Testar que categoria duplicada não é criada
  try {
    const before = await pool.query('SELECT COUNT(*) FROM categories WHERE slug = $1', ['badminton']);
    await categoryService.normalizeAndGetCategory('Badminton');
    await categoryService.normalizeAndGetCategory('BADMINTON');
    await categoryService.normalizeAndGetCategory('badminton');
    const after = await pool.query('SELECT COUNT(*) FROM categories WHERE slug = $1', ['badminton']);
    
    test('Não cria categorias duplicadas', 
      before.rows[0].count === after.rows[0].count,
      `Antes: ${before.rows[0].count}, Depois: ${after.rows[0].count}`);
  } catch (e) {
    test('Categorias duplicadas', false, e.message);
  }

  // ============================================
  // TESTE 5: Feeds básicos
  // ============================================
  console.log('\n📋 TESTE 5: Feeds básicos\n');

  // 5.1 Feed Cronológico
  try {
    const articles = await Article.findAll({ limit: 10 });
    test('Feed cronológico funciona', 
      Array.isArray(articles) && articles.length > 0,
      `Retornou ${articles.length} artigos`);
    
    // Verificar se tem category_id e category info
    if (articles.length > 0) {
      const hasCategory = articles[0].category_id !== undefined || articles[0].category !== undefined;
      test('Artigos têm informação de categoria', hasCategory);
    }
  } catch (e) {
    test('Feed cronológico', false, e.message);
  }

  // 5.2 Criar usuário de teste para Feed "For You"
  let testUser;
  try {
    testUser = await User.create({
      email: 'test-foryou@test.com',
      name: 'Teste For You'
    });
    test('Usuário de teste criado', testUser && testUser.id);
    console.log(`   Usuário ID: ${testUser.id}`);
  } catch (e) {
    test('Criar usuário', false, e.message);
  }

  // 5.3 Adicionar preferências de categoria
  if (testUser) {
    try {
      const categories = await Category.findAll();
      if (categories.length > 0) {
        await UserCategoryPreference.upsert({
          userId: testUser.id,
          categoryId: categories[0].id,
          preferenceScore: 0.9
        });
        test('Preferência de categoria adicionada', true);
        console.log(`   Preferência: ${categories[0].name} (score: 0.9)`);
      }
    } catch (e) {
      test('Adicionar preferência', false, e.message);
    }

    // 5.4 Testar busca de preferências
    try {
      const prefs = await UserCategoryPreference.findTopCategories(testUser.id, 4);
      test('Busca top categorias funciona', 
        Array.isArray(prefs),
        `Retornou ${prefs.length} preferências`);
    } catch (e) {
      test('Top categorias', false, e.message);
    }
  }

  // 5.5 Testar busca por categoria
  try {
    const categories = await Category.findAll();
    if (categories.length > 0) {
      const articles = await Article.findByCategoryIds([categories[0].id], 10);
      test('Busca por category_id funciona', 
        Array.isArray(articles),
        `Retornou ${articles.length} artigos da categoria ${categories[0].name}`);
    }
  } catch (e) {
    test('Busca por categoria', false, e.message);
  }

  // ============================================
  // RESUMO
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DOS TESTES');
  console.log('='.repeat(60));
  console.log(`✅ Passou: ${tests.passed}`);
  console.log(`❌ Falhou: ${tests.failed}`);
  console.log(`📝 Total:  ${tests.passed + tests.failed}`);
  
  if (tests.failed === 0) {
    console.log('\n🎉 TODOS OS TESTES PASSARAM!');
  } else {
    console.log('\n⚠️ Alguns testes falharam. Verifique os detalhes acima.');
  }

  // Mostrar categorias criadas
  console.log('\n📂 Categorias no banco:');
  const allCats = await Category.findAll();
  allCats.forEach(c => console.log(`   • ${c.name} (${c.slug})`));

  process.exit(tests.failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Erro fatal:', e);
  process.exit(1);
});

