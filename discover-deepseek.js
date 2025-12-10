/**
 * Descobre o endpoint correto do DeepSeek no Vertex AI
 */

import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';

const PROJECT_ID = 'noted-sled-480801-e7';
const LOCATION = 'us-central1';

// Possíveis publishers
const publishers = ['deepseek', 'deepseek-ai', 'third-party', 'google'];

// Possíveis nomes de modelo
const models = [
  'deepseek-r1-0528-maas',
  'deepseek-r1-0528',
  'deepseek-r1',
  'deepseek-chat',
  'deepseek-coder'
];

async function getAccessToken() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function testEndpoint(publisher, model) {
  const token = await getAccessToken();
  
  // Formato 1: generateContent (Gemini-style)
  const url1 = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${publisher}/models/${model}:generateContent`;
  
  // Formato 2: predict
  const url2 = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${publisher}/models/${model}:predict`;
  
  // Formato 3: rawPredict (para modelos third-party)
  const url3 = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${publisher}/models/${model}:rawPredict`;

  const testPayload = {
    contents: [{
      role: 'user',
      parts: [{ text: 'Olá, teste' }]
    }]
  };

  for (const url of [url1, url2, url3]) {
    try {
      const response = await axios.post(url, testPayload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      console.log(`✅ SUCESSO: ${publisher}/${model}`);
      console.log(`   URL: ${url}`);
      console.log(`   Response:`, JSON.stringify(response.data).slice(0, 200));
      return { publisher, model, url, success: true };
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.error?.message || error.message;
      
      // Se o erro NÃO for "not found", pode significar que o endpoint existe
      if (status !== 404 && status !== 400) {
        console.log(`⚠️ ${publisher}/${model} - Status ${status}: ${message.slice(0, 100)}`);
      }
    }
  }
  return null;
}

async function main() {
  console.log('🔍 Descobrindo endpoint do DeepSeek no Vertex AI...\n');
  console.log(`Projeto: ${PROJECT_ID}`);
  console.log(`Região: ${LOCATION}\n`);

  // Primeiro, vamos testar o endpoint que aparece na quota
  console.log('📋 Testando modelo da quota: deepseek-r1-0528-maas\n');
  
  for (const publisher of publishers) {
    for (const model of models) {
      const result = await testEndpoint(publisher, model);
      if (result) {
        console.log('\n🎉 Encontrado endpoint funcional!');
        process.exit(0);
      }
    }
  }

  console.log('\n❌ Nenhum endpoint encontrado. O DeepSeek pode precisar ser habilitado no Model Garden.');
  console.log('\nAcesse: https://console.cloud.google.com/vertex-ai/model-garden?project=' + PROJECT_ID);
  console.log('Procure por "DeepSeek" e clique em "Enable" ou "Deploy"');
}

main().catch(console.error);

