/**
 * Simple API Test
 */

const BASE = 'http://localhost:3000';

console.log('🧪 Testando API...\n');

// Test 1: Health
fetch(`${BASE}/health`)
  .then(r => r.json())
  .then(d => console.log('✅ Health:', d))
  .catch(e => console.error('❌ Health:', e.message));

// Test 2: Categories
fetch(`${BASE}/api/categories`)
  .then(r => r.json())
  .then(d => console.log(`✅ Categorias: ${d.data.length} encontradas`))
  .catch(e => console.error('❌ Categorias:', e.message));

// Test 3: Sites
fetch(`${BASE}/api/sites`)
  .then(r => r.json())
  .then(d => console.log(`✅ Sites: ${d.data.length} cadastrados`))
  .catch(e => console.error('❌ Sites:', e.message));

setTimeout(() => {
  console.log('\n✅ Testes básicos completados!');
}, 2000);
