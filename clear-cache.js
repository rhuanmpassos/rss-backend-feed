import axios from 'axios';

console.log('🧹 Limpando cache do Redis...\n');

axios.post('http://localhost:3000/api/admin/clear-cache')
  .then(res => {
    console.log('✅', res.data.message);
    console.log(`   ${res.data.cleared} chaves removidas`);
    console.log('\n🎯 Cache limpo! Tente scraping novamente.');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
