/**
 * Category Service
 * Gerencia normalização e criação dinâmica de categorias
 * Inclui detecção de categorias similares para evitar duplicatas
 */

import Category from '../models/Category.js';
import EmbeddingService from './embeddingService.js';

// Aliases conhecidos - mapeamento de variações para categoria canônica
const CATEGORY_ALIASES = {
  // Esportes
  'f1': 'Fórmula 1',
  'formula 1': 'Fórmula 1',
  'formula um': 'Fórmula 1',
  'fórmula um': 'Fórmula 1',
  'corrida de f1': 'Fórmula 1',
  'gp de f1': 'Fórmula 1',
  'grande prêmio': 'Fórmula 1',
  
  'futebol brasileiro': 'Futebol',
  'brasileirão': 'Futebol',
  'campeonato brasileiro': 'Futebol',
  'copa do brasil': 'Futebol',
  'libertadores': 'Futebol',
  'série a': 'Futebol',
  
  'basquete': 'Basquete',
  'nba': 'Basquete',
  'basketball': 'Basquete',
  
  'tênis': 'Tênis',
  'tenis': 'Tênis',
  'wimbledon': 'Tênis',
  'us open': 'Tênis',
  'roland garros': 'Tênis',
  
  'mma': 'MMA',
  'ufc': 'MMA',
  'luta': 'MMA',
  
  // Tecnologia
  'ia': 'Inteligência Artificial',
  'ai': 'Inteligência Artificial',
  'machine learning': 'Inteligência Artificial',
  'chatgpt': 'Inteligência Artificial',
  'gpt': 'Inteligência Artificial',
  
  'crypto': 'Criptomoedas',
  'criptomoeda': 'Criptomoedas',
  'ethereum': 'Criptomoedas',
  'eth': 'Criptomoedas',
  'btc': 'Bitcoin',
  
  // Política
  'congresso': 'Política',
  'câmara dos deputados': 'Política',
  'senado': 'Política',
  'governo federal': 'Política',
  'planalto': 'Política',
  
  // Economia
  'mercado financeiro': 'Economia',
  'bolsa de valores': 'Economia',
  'ibovespa': 'Economia',
  'dólar': 'Economia',
  'taxa de juros': 'Economia',
  
  // Clima
  'tempo': 'Clima',
  'previsão do tempo': 'Clima',
  'chuva': 'Clima',
  'tempestade': 'Clima',
  'enchente': 'Clima',
  'alagamento': 'Clima',
};

// Cache de embeddings de categorias existentes
let categoryEmbeddingsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Normaliza nome para slug
 */
function normalizeSlug(name) {
  if (!name) return '';
  
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

/**
 * Verifica se há um alias conhecido para o nome da categoria
 */
function checkAlias(name) {
  const normalized = name.toLowerCase().trim();
  return CATEGORY_ALIASES[normalized] || null;
}

/**
 * Calcula similaridade de string simples (Levenshtein-like)
 */
function stringSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Jaccard similarity com palavras
  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  
  return intersection / union;
}

/**
 * Encontra categoria similar usando embeddings
 */
async function findSimilarCategory(categoryName, existingCategories, threshold = 0.85) {
  try {
    // Primeiro tenta similaridade de string (mais rápido)
    for (const cat of existingCategories) {
      const similarity = stringSimilarity(categoryName, cat.name);
      if (similarity >= 0.8) {
        console.log(`   🔄 Categoria "${categoryName}" similar a "${cat.name}" (string: ${(similarity * 100).toFixed(0)}%)`);
        return cat;
      }
    }
    
    // Se embedding service disponível, usa similaridade semântica
    if (EmbeddingService.isReady || await initEmbeddingsSafe()) {
      const newEmbedding = await EmbeddingService.generateEmbedding(categoryName);
      
      // Atualiza cache se necessário
      if (!categoryEmbeddingsCache || Date.now() - cacheTimestamp > CACHE_TTL) {
        categoryEmbeddingsCache = await buildCategoryEmbeddingsCache(existingCategories);
        cacheTimestamp = Date.now();
      }
      
      // Encontra mais similar
      let bestMatch = null;
      let bestSimilarity = 0;
      
      for (const [catId, catData] of Object.entries(categoryEmbeddingsCache)) {
        const similarity = EmbeddingService.cosineSimilarity(newEmbedding, catData.embedding);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = catData;
        }
      }
      
      if (bestMatch && bestSimilarity >= threshold) {
        console.log(`   🔄 Categoria "${categoryName}" similar a "${bestMatch.name}" (semântica: ${(bestSimilarity * 100).toFixed(0)}%)`);
        return existingCategories.find(c => c.id === bestMatch.id);
      }
    }
    
    return null;
  } catch (error) {
    // Se falhar, retorna null e cria nova categoria
    console.warn(`   ⚠️ Erro ao buscar categoria similar: ${error.message}`);
    return null;
  }
}

/**
 * Inicializa embeddings de forma segura
 */
async function initEmbeddingsSafe() {
  try {
    await EmbeddingService.initialize();
    return EmbeddingService.isReady;
  } catch {
    return false;
  }
}

/**
 * Constrói cache de embeddings das categorias
 */
async function buildCategoryEmbeddingsCache(categories) {
  const cache = {};
  
  for (const cat of categories) {
    try {
      const embedding = await EmbeddingService.generateEmbedding(cat.name);
      cache[cat.id] = { id: cat.id, name: cat.name, embedding };
    } catch {
      // Ignora categorias que não conseguir gerar embedding
    }
  }
  
  return cache;
}

/**
 * Normaliza nome da categoria e busca/cria no banco
 * Verifica aliases e similaridade semântica antes de criar nova
 * @param {string} categoryName - Nome da categoria retornado pelo modelo
 * @returns {Promise<{id: number, name: string, slug: string}>} - Categoria do banco
 */
async function normalizeAndGetCategory(categoryName) {
  if (!categoryName || typeof categoryName !== 'string') {
    throw new Error('Nome da categoria é obrigatório');
  }

  // 1. Verifica se há alias conhecido
  const aliasMatch = checkAlias(categoryName);
  const normalizedName = aliasMatch || categoryName.trim();
  
  if (aliasMatch) {
    console.log(`   🏷️ Alias encontrado: "${categoryName}" → "${aliasMatch}"`);
  }
  
  // 2. Gera slug
  const slug = normalizeSlug(normalizedName);
  
  if (!slug) {
    throw new Error(`Não foi possível gerar slug para: ${categoryName}`);
  }

  // 3. Busca categoria existente por slug exato
  let category = await Category.findBySlug(slug);
  
  if (category) {
    return category;
  }

  // 4. Se não encontrou por slug, busca todas e verifica similaridade
  const existingCategories = await Category.findAll();
  
  if (existingCategories.length > 0) {
    const similarCategory = await findSimilarCategory(normalizedName, existingCategories);
    
    if (similarCategory) {
      return similarCategory;
    }
  }
  
  // 5. Não encontrou similar - cria nova categoria
  console.log(`   📦 Nova categoria criada: "${normalizedName}" (${slug})`);
  category = await Category.create({
    name: normalizedName,
    slug: slug
  });
  
  // Invalida cache
  categoryEmbeddingsCache = null;
  
  return category;
}

/**
 * Busca categoria por ID
 * @param {number} categoryId - ID da categoria
 * @returns {Promise<{id: number, name: string, slug: string}|null>}
 */
async function getCategoryById(categoryId) {
  return await Category.findById(categoryId);
}

/**
 * Lista todas as categorias
 * @returns {Promise<Array>}
 */
async function getAllCategories() {
  return await Category.findAll();
}

const CategoryService = {
  normalizeSlug,
  normalizeAndGetCategory,
  getCategoryById,
  getAllCategories
};

export default CategoryService;
export { normalizeSlug, normalizeAndGetCategory, getCategoryById, getAllCategories };

