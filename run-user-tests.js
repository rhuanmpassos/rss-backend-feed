/**
 * Testes do Sistema de Usuários e Interações
 * Verifica se o sistema de recomendação "For You" está funcionando
 */

import pool from './src/config/database.js';
import User from './src/models/User.js';
import UserInteraction from './src/models/UserInteraction.js';
import UserCategoryPreference from './src/models/UserCategoryPreference.js';
import Article from './src/models/Article.js';
import Category from './src/models/Category.js';

const tests = {
  passed: 0,
  failed: 0,
  results: []
};

function test(name, passed, details = '') {
  if (passed) {
    tests.passed++;
    console.log(`✅ PASS: ${name}`);
  } else {
    tests.failed++;
    console.log(`❌ FAIL: ${name} - ${details}`);
  }
}

async function runTests() {
  console.log('🧪 Testes do Sistema de Usuários e Interações\n');
  console.log('='.repeat(60) + '\n');

  // Pegar dados existentes
  const articles = await Article.findAll({ limit: 10 });
  const categories = await Category.findAll();

  if (articles.length === 0) {
    console.log('❌ ERRO: Não há artigos no banco. Rode o scraper primeiro.');
    process.exit(1);
  }

  console.log(`📊 Dados disponíveis: ${articles.length} artigos, ${categories.length} categorias\n`);

  // ============================================
  // TESTE 1: CRUD de Usuários
  // ============================================
  console.log('📋 TESTE 1: CRUD de Usuários\n');

  // 1.1 Criar usuário
  let testUser;
  try {
    testUser = await User.create({
      email: 'interaction-test@test.com',
      name: 'Teste Interações'
    });
    test('Criar usuário', testUser && testUser.id);
    console.log(`   → Usuário criado: ID ${testUser.id}`);
  } catch (e) {
    test('Criar usuário', false, e.message);
  }

  // 1.2 Buscar por ID
  try {
    const found = await User.findById(testUser.id);
    test('Buscar usuário por ID', found && found.id === testUser.id);
  } catch (e) {
    test('Buscar por ID', false, e.message);
  }

  // 1.3 Buscar por email
  try {
    const found = await User.findByEmail('interaction-test@test.com');
    test('Buscar usuário por email', found && found.email === 'interaction-test@test.com');
  } catch (e) {
    test('Buscar por email', false, e.message);
  }

  // 1.4 Atualizar usuário
  try {
    const updated = await User.update(testUser.id, { name: 'Nome Atualizado' });
    test('Atualizar usuário', updated && updated.name === 'Nome Atualizado');
  } catch (e) {
    test('Atualizar usuário', false, e.message);
  }

  // ============================================
  // TESTE 2: Interações
  // ============================================
  console.log('\n📋 TESTE 2: Registrar Interações\n');

  const testArticle = articles[0];
  console.log(`   → Usando artigo: "${testArticle.title.substring(0, 40)}..."`);

  // 2.1 Registrar click
  try {
    const click = await UserInteraction.create({
      userId: testUser.id,
      articleId: testArticle.id,
      interactionType: 'click',
      position: 1
    });
    test('Registrar click', click && click.interaction_type === 'click');
  } catch (e) {
    test('Registrar click', false, e.message);
  }

  // 2.2 Registrar view com duração
  try {
    const view = await UserInteraction.create({
      userId: testUser.id,
      articleId: testArticle.id,
      interactionType: 'view',
      duration: 15000, // 15 segundos
      position: 1
    });
    test('Registrar view com duração', view && view.duration === 15000);
  } catch (e) {
    test('Registrar view', false, e.message);
  }

  // 2.3 Registrar scroll_stop
  try {
    const scrollStop = await UserInteraction.create({
      userId: testUser.id,
      articleId: testArticle.id,
      interactionType: 'scroll_stop',
      position: 1
    });
    test('Registrar scroll_stop', scrollStop && scrollStop.interaction_type === 'scroll_stop');
  } catch (e) {
    test('Registrar scroll_stop', false, e.message);
  }

  // 2.4 Registrar impressions em batch
  if (articles.length >= 3) {
    try {
      const impressions = await UserInteraction.createBatch([
        { userId: testUser.id, articleId: articles[0].id, interactionType: 'impression', position: 1 },
        { userId: testUser.id, articleId: articles[1].id, interactionType: 'impression', position: 2 },
        { userId: testUser.id, articleId: articles[2].id, interactionType: 'impression', position: 3 },
      ]);
      test('Registrar impressions em batch', impressions && impressions.length === 3);
    } catch (e) {
      test('Impressions em batch', false, e.message);
    }
  }

  // ============================================
  // TESTE 3: Consultas de Interações
  // ============================================
  console.log('\n📋 TESTE 3: Consultas de Interações\n');

  // 3.1 Buscar interações do usuário
  try {
    const interactions = await UserInteraction.findByUserId(testUser.id);
    test('Buscar interações do usuário', interactions.length > 0,
      `Encontradas: ${interactions.length}`);
    console.log(`   → Total de interações: ${interactions.length}`);
  } catch (e) {
    test('Buscar interações', false, e.message);
  }

  // 3.2 Buscar interações por tipo
  try {
    const clicks = await UserInteraction.findByUserId(testUser.id, { interactionType: 'click' });
    test('Filtrar interações por tipo (click)', clicks.length > 0);
    console.log(`   → Clicks: ${clicks.length}`);
  } catch (e) {
    test('Filtrar por tipo', false, e.message);
  }

  // 3.3 Contar interações por tipo
  try {
    const counts = await UserInteraction.countByType(testUser.id);
    test('Contar interações por tipo', counts.length > 0);
    console.log('   → Contagem por tipo:');
    counts.forEach(c => console.log(`      • ${c.interaction_type}: ${c.count}`));
  } catch (e) {
    test('Contar por tipo', false, e.message);
  }

  // 3.4 Buscar interações em artigo específico
  try {
    const articleInteractions = await UserInteraction.findByUserAndArticle(testUser.id, testArticle.id);
    test('Buscar interações em artigo específico', articleInteractions.length > 0);
  } catch (e) {
    test('Interações em artigo', false, e.message);
  }

  // ============================================
  // TESTE 4: Preferências de Categoria
  // ============================================
  console.log('\n📋 TESTE 4: Preferências de Categoria\n');

  if (categories.length > 0) {
    // 4.1 Adicionar preferência
    try {
      const pref = await UserCategoryPreference.upsert({
        userId: testUser.id,
        categoryId: categories[0].id,
        preferenceScore: 0.85
      });
      test('Adicionar preferência de categoria', pref && pref.preference_score === 0.85);
      console.log(`   → Preferência: ${categories[0].name} (score: 0.85)`);
    } catch (e) {
      test('Adicionar preferência', false, e.message);
    }

    // 4.2 Atualizar preferência (upsert)
    try {
      const updated = await UserCategoryPreference.upsert({
        userId: testUser.id,
        categoryId: categories[0].id,
        preferenceScore: 0.95
      });
      test('Atualizar preferência (upsert)', updated && updated.preference_score === 0.95);
    } catch (e) {
      test('Atualizar preferência', false, e.message);
    }

    // 4.3 Incrementar score
    try {
      // Reset para 0.5 primeiro
      await UserCategoryPreference.upsert({
        userId: testUser.id,
        categoryId: categories[0].id,
        preferenceScore: 0.5
      });
      const incremented = await UserCategoryPreference.incrementScore(testUser.id, categories[0].id, 0.1);
      test('Incrementar score', incremented && incremented.preference_score === 0.6);
    } catch (e) {
      test('Incrementar score', false, e.message);
    }

    // 4.4 Decrementar score
    try {
      const decremented = await UserCategoryPreference.decrementScore(testUser.id, categories[0].id, 0.1);
      test('Decrementar score', decremented && decremented.preference_score === 0.5);
    } catch (e) {
      test('Decrementar score', false, e.message);
    }

    // 4.5 Buscar top categorias
    try {
      const topCats = await UserCategoryPreference.findTopCategories(testUser.id, 4);
      test('Buscar top 4 categorias', Array.isArray(topCats));
      console.log(`   → Top categorias: ${topCats.length}`);
    } catch (e) {
      test('Top categorias', false, e.message);
    }
  }

  // ============================================
  // TESTE 5: Métricas para Recomendação
  // ============================================
  console.log('\n📋 TESTE 5: Métricas para Recomendação "For You"\n');

  // 5.1 Categorias mais interagidas
  try {
    const mostInteracted = await UserInteraction.getMostInteractedCategories(testUser.id, 30);
    test('Buscar categorias mais interagidas', Array.isArray(mostInteracted));
    if (mostInteracted.length > 0) {
      console.log('   → Categorias mais interagidas:');
      mostInteracted.forEach(c => {
        console.log(`      • ${c.category_name}: ${c.interaction_count} interações (${c.clicks} clicks, ${c.views} views)`);
      });
    }
  } catch (e) {
    test('Categorias mais interagidas', false, e.message);
  }

  // 5.2 Scores de interesse
  try {
    const interestScores = await UserInteraction.getInterestScores(testUser.id, 10);
    test('Calcular scores de interesse', Array.isArray(interestScores));
    if (interestScores.length > 0) {
      console.log('   → Top artigos por interesse:');
      interestScores.slice(0, 3).forEach(a => {
        const score = parseFloat(a.interest_score);
        console.log(`      • Score ${score.toFixed(2)}: ${a.title.substring(0, 40)}...`);
      });
    }
  } catch (e) {
    test('Scores de interesse', false, e.message);
  }

  // ============================================
  // TESTE 6: Feed "For You" (simulação)
  // ============================================
  console.log('\n📋 TESTE 6: Simulação do Feed "For You"\n');

  try {
    // Buscar preferências do usuário
    const preferences = await UserCategoryPreference.findTopCategories(testUser.id, 4);
    
    if (preferences.length > 0) {
      // Buscar artigos das categorias preferidas
      const categoryIds = preferences.map(p => p.category_id);
      const forYouArticles = await Article.findByCategoryIds(categoryIds, 10);
      
      test('Feed "For You" retorna artigos', Array.isArray(forYouArticles));
      console.log(`   → Artigos no feed: ${forYouArticles.length}`);
      
      if (forYouArticles.length > 0) {
        console.log('   → Preview do feed:');
        forYouArticles.slice(0, 3).forEach((a, i) => {
          console.log(`      ${i + 1}. [${a.category_name || 'N/A'}] ${a.title.substring(0, 40)}...`);
        });
      }
    } else {
      // Sem preferências, retorna feed cronológico
      const fallback = await Article.findAll({ limit: 10 });
      test('Feed "For You" fallback (cronológico)', fallback.length > 0);
      console.log(`   → Sem preferências, usando feed cronológico: ${fallback.length} artigos`);
    }
  } catch (e) {
    test('Feed "For You"', false, e.message);
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

  // Mostrar estado final
  console.log('\n📊 Estado final do banco:');
  const finalUsers = await pool.query('SELECT COUNT(*) FROM users');
  const finalInteractions = await pool.query('SELECT COUNT(*) FROM user_interactions');
  const finalPrefs = await pool.query('SELECT COUNT(*) FROM user_category_preferences');
  console.log(`   • Usuários: ${finalUsers.rows[0].count}`);
  console.log(`   • Interações: ${finalInteractions.rows[0].count}`);
  console.log(`   • Preferências: ${finalPrefs.rows[0].count}`);

  process.exit(tests.failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Erro fatal:', e);
  process.exit(1);
});

