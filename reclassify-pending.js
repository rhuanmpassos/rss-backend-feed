/**
 * Reclassifica artigos pendentes (sem categoria)
 */
import DeepSeekClassifierService from './src/services/deepseekClassifierService.js';

async function reclassify() {
  console.log('🔄 Reclassificando artigos pendentes...\n');
  
  const result = await DeepSeekClassifierService.processUncategorized(10);
  
  console.log('\n📊 Resultado final:');
  console.log(result);
  
  process.exit(0);
}

reclassify().catch(console.error);

