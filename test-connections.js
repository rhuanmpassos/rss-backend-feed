/**
 * Test Connections - Redis + PostgreSQL
 */

import pool from './src/config/database.js';
import redisConfig from './src/config/redis.js';

console.log('🧪 Testando conexões...\n');

// Test PostgreSQL
console.log('1️⃣ Testando PostgreSQL...');
try {
  const result = await pool.query('SELECT NOW()');
  console.log('✅ PostgreSQL conectado:', result.rows[0].now);
} catch (error) {
  console.error('❌ PostgreSQL erro:', error.message);
}

// Test Redis  
console.log('\n2️⃣ Testando Redis Cloud...');
try {
  const client = await redisConfig.getRedisClient();

  // Test set/get
  await redisConfig.cache.set('test_key', { foo: 'bar' }, 10);
  const value = await redisConfig.cache.get('test_key');

  if (value && value.foo === 'bar') {
    console.log('✅ Redis Cloud conectado e funcionando!');
    console.log('   Teste: set/get passou');
  } else {
    console.log('⚠️ Redis conectado mas teste falhou');
  }
} catch (error) {
  console.error('❌ Redis erro:', error.message);
}

console.log('\n✅ Teste de conexões concluído!\n');
process.exit(0);
