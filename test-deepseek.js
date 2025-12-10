/**
 * Teste do DeepSeek R1 Classifier via Vertex AI
 */

import DeepSeekClassifier from './src/services/deepseekClassifierService.js';
import dotenv from 'dotenv';

dotenv.config();

const testTitles = [
  'Hamilton vence GP de Mônaco em corrida emocionante',
  'Flamengo goleia Vasco por 4 a 0 no Maracanã',
  'Bitcoin atinge novo recorde histórico de US$ 100.000',
  'OpenAI lança GPT-5 com capacidades revolucionárias',
  'Chuvas fortes causam alagamentos em São Paulo',
  'Bahia contrata atacante do Palmeiras para temporada 2025'
];

async function testDeepSeek() {
  console.log('🧪 Testando DeepSeek R1 via Vertex AI...\n');

  // Verifica configuração
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
  
  if (!projectId) {
    console.error('❌ GOOGLE_CLOUD_PROJECT não configurado no .env');
    console.error('\nAdicione ao seu .env:');
    console.error('GOOGLE_CLOUD_PROJECT=seu-project-id');
    console.error('\nVocê pode encontrar o Project ID no Google Cloud Console');
    console.error('Ou use: gcloud config get-value project');
    process.exit(1);
  }

  console.log(`✅ Projeto: ${projectId}`);
  console.log(`✅ Região: us-central1 (600 RPM)\n`);

  // Testa classificação
  for (const title of testTitles) {
    console.log(`📝 "${title}"`);
    
    try {
      const result = await DeepSeekClassifier.classifyArticle(title);
      
      if (result) {
        console.log(`   → Categoria: ${result.category}`);
        console.log(`   → Confiança: ${(result.confidence * 100).toFixed(0)}%`);
        console.log(`   → Método: ${result.method}`);
        if (result.location) console.log(`   → Local: ${result.location}`);
      } else {
        console.log(`   → ❌ Falhou ao classificar`);
      }
      console.log('');
      
    } catch (error) {
      console.error(`   → ❌ Erro: ${error.message}\n`);
    }
  }

  console.log('✅ Teste concluído!');
}

testDeepSeek().catch(console.error);

