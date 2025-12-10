/**
 * Setup de dados de teste
 * Adiciona site RSS e usuário para testar o sistema
 */

import pool from './src/config/database.js';
import Site from './src/models/Site.js';
import User from './src/models/User.js';
import UserCategoryPreference from './src/models/UserCategoryPreference.js';
import Category from './src/models/Category.js';

async function setupTestData() {
  console.log('🚀 Configurando dados de teste...\n');

  try {
    // 1. Adicionar site Coluna do Fla
    console.log('📰 Adicionando site RSS...');
    
    const existingSite = await Site.findByUrl('https://colunadofla.com/feed/');
    
    let site;
    if (existingSite) {
      console.log('   Site já existe:', existingSite.name);
      site = existingSite;
    } else {
      site = await Site.create({
        name: 'Coluna do Fla',
        url: 'https://colunadofla.com/feed/',
        category: 'Futebol',
        scrapingInterval: 1800 // 30 minutos
      });
      console.log('   ✅ Site criado:', site.name);
    }

    // 2. Criar usuário de teste
    console.log('\n👤 Criando usuário de teste...');
    
    const user = await User.create({
      email: 'teste@teste.com',
      name: 'Usuário Teste'
    });
    console.log('   ✅ Usuário criado/atualizado:', user.name, `(ID: ${user.id})`);

    // 3. Verificar/criar categorias para preferências
    console.log('\n🏷️ Verificando categorias...');
    
    const categories = await pool.query('SELECT * FROM categories ORDER BY name');
    console.log(`   Categorias existentes: ${categories.rows.length}`);
    categories.rows.forEach(c => console.log(`   • ${c.name} (ID: ${c.id})`));

    // 4. Adicionar preferências de categoria (se houver categorias)
    if (categories.rows.length > 0) {
      console.log('\n⭐ Adicionando preferências do usuário...');
      
      for (const cat of categories.rows) {
        try {
          await UserCategoryPreference.upsert({
            userId: user.id,
            categoryId: cat.id,
            preferenceScore: 0.8
          });
          console.log(`   ✅ Preferência adicionada: ${cat.name} (score: 0.8)`);
        } catch (e) {
          console.log(`   ⚠️ Erro ao adicionar preferência para ${cat.name}:`, e.message);
        }
      }
    }

    // 5. Mostrar resumo
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMO DA CONFIGURAÇÃO');
    console.log('='.repeat(50));
    
    const sitesCount = await pool.query('SELECT COUNT(*) FROM sites');
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const prefsCount = await pool.query('SELECT COUNT(*) FROM user_category_preferences');
    
    console.log(`Sites: ${sitesCount.rows[0].count}`);
    console.log(`Usuários: ${usersCount.rows[0].count}`);
    console.log(`Preferências: ${prefsCount.rows[0].count}`);
    
    console.log('\n✅ Setup concluído!');
    console.log('\n📝 Próximos passos:');
    console.log('   1. Rodar o servidor: npm run dev');
    console.log('   2. O scraper vai buscar artigos automaticamente');
    console.log('   3. Gemini vai classificar os artigos');
    console.log('   4. Novas categorias serão criadas dinamicamente');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

setupTestData();

