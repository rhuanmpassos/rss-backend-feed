/**
 * Test Script - API Testing
 * Testa endpoints da API REST
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3000';
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function test() {
  log('\n🧪 Testando API REST\n', 'cyan');

  try {
    // Test 1: Health Check
    log('1️⃣ Health Check...', 'yellow');
    const health = await axios.get(`${API_BASE}/health`);
    log(`   ✅ ${health.data.status} - ${health.data.timestamp}`, 'green');

    // Test 2: Listar Categorias
    log('\n2️⃣ Listando categorias...', 'yellow');
    const categories = await axios.get(`${API_BASE}/api/categories`);
    log(`   ✅ ${categories.data.data.length} categorias encontradas`, 'green');
    categories.data.data.slice(0, 3).forEach(cat => {
      log(`      • ${cat.name} (${cat.slug})`, 'cyan');
    });

    // Test 3: Listar Sites (vazio)
    log('\n3️⃣ Listando sites...', 'yellow');
    const sites = await axios.get(`${API_BASE}/api/sites`);
    log(`   ✅ ${sites.data.data.length} sites cadastrados`, 'green');

    // Test 4: Criar Novo Site
    log('\n4️⃣ Criando site de teste...', 'yellow');
    const timestamp = Date.now();
    const newSite = await axios.post(`${API_BASE}/api/sites`, {
      name: `TechCrunch Test ${timestamp}`,
      url: `https://techcrunch.com/test-${timestamp}`,
      category: 'Tecnologia',
      scrapingInterval: 3600
    });
    log(`   ✅ Site criado: ${newSite.data.data.name} (ID: ${newSite.data.data.id})`, 'green');
    const siteId = newSite.data.data.id;

    // Test 5: Obter Site por ID
    log('\n5️⃣ Buscando site criado...', 'yellow');
    const site = await axios.get(`${API_BASE}/api/sites/${siteId}`);
    log(`   ✅ ${site.data.data.name} - ${site.data.data.url}`, 'green');

    // Test 6: Atualizar Site
    log('\n6️⃣ Atualizando site...', 'yellow');
    const updated = await axios.put(`${API_BASE}/api/sites/${siteId}`, {
      scrapingInterval: 1800
    });
    log(`   ✅ Intervalo atualizado para ${updated.data.data.scraping_interval}s`, 'green');

    // Test 7: Estatísticas do Site
    log('\n7️⃣ Estatísticas do site...', 'yellow');
    const stats = await axios.get(`${API_BASE}/api/sites/${siteId}/stats`);
    log(`   ✅ Artigos: ${stats.data.data.total_articles}`, 'green');

    // Test 8: Listar Artigos
    log('\n8️⃣ Listando artigos...', 'yellow');
    const articles = await axios.get(`${API_BASE}/api/articles?limit=10`);
    log(`   ✅ ${articles.data.count} artigos encontrados`, 'green');

    // Test 9: Estatísticas Gerais
    log('\n9️⃣ Estatísticas gerais...', 'yellow');
    const generalStats = await axios.get(`${API_BASE}/api/articles/stats`);
    log(`   ✅ Total: ${generalStats.data.data.total_articles} artigos`, 'green');
    log(`      Categorizados: ${generalStats.data.data.categorized}`, 'cyan');
    log(`      Hoje: ${generalStats.data.data.articles_today}`, 'cyan');

    // Test 10: Deletar Site
    log('\n🔟 Deletando site de teste...', 'yellow');
    await axios.delete(`${API_BASE}/api/sites/${siteId}`);
    log(`   ✅ Site removido com sucesso`, 'green');

    log('\n✅ Todos os testes passaram!\n', 'green');

  } catch (error) {
    log(`\n❌ Erro: ${error.message}`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Dados: ${JSON.stringify(error.response.data)}`, 'red');
    }
    process.exit(1);
  }
}

test();
