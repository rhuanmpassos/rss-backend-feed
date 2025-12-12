/**
 * Hierarchical Classifier Service
 * Classificação hierárquica usando taxonomia IPTC
 * 
 * Responsabilidades:
 * - Classificar artigos em até 3 níveis hierárquicos
 * - Resolver categorias para IDs do banco
 * - Suportar multi-label (artigo com múltiplas categorias)
 * - Usar scores de confiança calibrados
 */

import { query } from '../config/database.js';
import CategoryService from './categoryService.js';

// Categorias IPTC Nível 1 (para o prompt)
const IPTC_LEVEL1_CATEGORIES = [
  'Artes, Cultura e Entretenimento',
  'Crime, Lei e Justiça',
  'Desastres e Acidentes',
  'Economia, Negócios e Finanças',
  'Educação',
  'Meio Ambiente',
  'Saúde',
  'Interesse Humano',
  'Trabalho',
  'Estilo de Vida e Lazer',
  'Política',
  'Religião',
  'Ciência e Tecnologia',
  'Sociedade',
  'Esporte',
  'Conflito, Guerra e Paz',
  'Clima'
];

// Subcategorias populares por nível 1 (para ajudar o LLM)
const IPTC_LEVEL2_HINTS = {
  'Esporte': ['Futebol', 'Automobilismo', 'Lutas', 'Tênis', 'Basquete', 'Vôlei', 'Olimpíadas'],
  'Economia, Negócios e Finanças': ['Mercado Financeiro', 'Criptomoedas', 'Inflação e Preços', 'Empresas', 'Câmbio'],
  'Política': ['Governo Federal', 'Congresso', 'STF e Judiciário', 'Eleições', 'Política Internacional'],
  'Ciência e Tecnologia': ['Inteligência Artificial', 'Smartphones', 'Espaço', 'Internet', 'Cibersegurança'],
  'Crime, Lei e Justiça': ['Crimes Violentos', 'Corrupção e Fraude', 'Tráfico de Drogas', 'Justiça', 'Polícia'],
  'Artes, Cultura e Entretenimento': ['Cinema', 'Música', 'Televisão', 'Games', 'Celebridades', 'K-Pop'],
  'Saúde': ['Medicina', 'Epidemias', 'Saúde Mental', 'Nutrição']
};

// Subcategorias nível 3 (mais específicas)
const IPTC_LEVEL3_HINTS = {
  'Futebol': ['Campeonato Brasileiro', 'Libertadores', 'Champions League', 'Copa do Brasil', 'Seleção Brasileira'],
  'Automobilismo': ['Fórmula 1', 'MotoGP', 'Stock Car', 'NASCAR'],
  'Lutas': ['UFC/MMA', 'Boxe'],
  'Criptomoedas': ['Bitcoin', 'Ethereum', 'Altcoins'],
  'Smartphones': ['Apple/iPhone', 'Android']
};

// Cache de categorias do banco
let categoriesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const HierarchicalClassifierService = {
  /**
   * Gera o prompt para classificação hierárquica
   * @param {string} text - Texto do artigo (título + summary)
   * @returns {string} Prompt formatado
   */
  generatePrompt(text) {
    return `Classificador de notícias usando taxonomia IPTC hierárquica.

TEXTO: "${text}"

TAXONOMIA (classifique em até 3 níveis):
- Nível 1 (obrigatório): Categoria ampla
- Nível 2 (obrigatório se aplicável): Subcategoria  
- Nível 3 (opcional): Específico

CATEGORIAS NÍVEL 1:
${IPTC_LEVEL1_CATEGORIES.join(', ')}

SUBCATEGORIAS COMUNS (Nível 2):
${Object.entries(IPTC_LEVEL2_HINTS).map(([k, v]) => `- ${k}: ${v.join(', ')}`).join('\n')}

ESPECÍFICAS (Nível 3):
${Object.entries(IPTC_LEVEL3_HINTS).map(([k, v]) => `- ${k}: ${v.join(', ')}`).join('\n')}

REGRAS:
1. SEMPRE classifique nível 1
2. Classifique nível 2 se o artigo for sobre um tema específico
3. Classifique nível 3 apenas se for MUITO específico (ex: "Fórmula 1", não apenas "Automobilismo")
4. Confidence deve refletir sua certeza REAL (0.5 = incerto, 0.95 = muito certo)
5. Se artigo claramente pertence a 2 categorias diferentes, use "secondary"

FORMATO JSON (APENAS JSON, nada mais):
{
  "primary": {
    "level1": "Esporte",
    "level2": "Futebol",
    "level3": null,
    "confidence": 0.92
  },
  "secondary": null,
  "location": null
}

EXEMPLOS:
- "Hamilton vence GP de Mônaco" → level1: "Esporte", level2: "Automobilismo", level3: "Fórmula 1"
- "Bitcoin bate recorde de preço" → level1: "Economia, Negócios e Finanças", level2: "Criptomoedas", level3: "Bitcoin"
- "Flamengo contrata novo atacante" → level1: "Esporte", level2: "Futebol", level3: null
- "Governo anuncia novo programa de energia solar" → primary: "Política", secondary: "Meio Ambiente"

Retorne APENAS o JSON.`;
  },

  /**
   * Carrega cache de categorias do banco
   */
  async loadCategoriesCache() {
    if (categoriesCache && Date.now() - cacheTimestamp < CACHE_TTL) {
      return categoriesCache;
    }

    const result = await query(`
      SELECT id, name, slug, level, parent_id, path
      FROM categories
      ORDER BY level, name
    `);

    categoriesCache = {
      byId: {},
      bySlug: {},
      byName: {},
      byPath: {}
    };

    for (const cat of result.rows) {
      categoriesCache.byId[cat.id] = cat;
      categoriesCache.bySlug[cat.slug] = cat;
      categoriesCache.byName[cat.name.toLowerCase()] = cat;
      if (cat.path) {
        categoriesCache.byPath[cat.path] = cat;
      }
    }

    cacheTimestamp = Date.now();
    return categoriesCache;
  },

  /**
   * Resolve nome de categoria para ID do banco
   * @param {string} categoryName - Nome da categoria
   * @param {number} expectedLevel - Nível esperado (1, 2 ou 3)
   * @returns {Object|null} Categoria encontrada ou null
   */
  async resolveCategory(categoryName, expectedLevel = null) {
    if (!categoryName) return null;

    const cache = await this.loadCategoriesCache();
    const normalized = categoryName.toLowerCase().trim();

    // Tenta encontrar por nome exato
    let category = cache.byName[normalized];
    
    if (!category) {
      // Tenta encontrar por slug
      const slug = CategoryService.normalizeSlug(categoryName);
      category = cache.bySlug[slug];
    }

    if (!category) {
      // Tenta encontrar parcial (contém)
      for (const [name, cat] of Object.entries(cache.byName)) {
        if (name.includes(normalized) || normalized.includes(name)) {
          category = cat;
          break;
        }
      }
    }

    // Verifica nível se especificado
    if (category && expectedLevel && category.level !== expectedLevel) {
      // Busca categoria no nível correto com nome similar
      for (const cat of Object.values(cache.byId)) {
        if (cat.level === expectedLevel && cat.name.toLowerCase().includes(normalized)) {
          return cat;
        }
      }
    }

    return category;
  },

  /**
   * Processa resultado da classificação do LLM
   * @param {Object} llmResult - Resultado parseado do JSON do LLM
   * @returns {Object} Categorias resolvidas com IDs
   */
  async processClassification(llmResult) {
    const result = {
      primary: null,
      secondary: null,
      categories: [], // Todas as categorias (para multi-label)
      location: llmResult.location
    };

    // Processa categoria primária
    if (llmResult.primary) {
      const primary = llmResult.primary;
      
      // Resolve cada nível
      const level1 = await this.resolveCategory(primary.level1, 1);
      const level2 = primary.level2 ? await this.resolveCategory(primary.level2, 2) : null;
      const level3 = primary.level3 ? await this.resolveCategory(primary.level3, 3) : null;

      // Usa a categoria mais específica disponível
      const mostSpecific = level3 || level2 || level1;
      
      if (mostSpecific) {
        result.primary = {
          category_id: mostSpecific.id,
          category_name: mostSpecific.name,
          category_slug: mostSpecific.slug,
          category_path: mostSpecific.path,
          level: mostSpecific.level,
          confidence: primary.confidence || 0.5,
          hierarchy: {
            level1: level1 ? { id: level1.id, name: level1.name } : null,
            level2: level2 ? { id: level2.id, name: level2.name } : null,
            level3: level3 ? { id: level3.id, name: level3.name } : null
          }
        };

        // Adiciona todas as categorias na hierarquia
        if (level1) result.categories.push({ ...level1, confidence: primary.confidence * 0.8, is_primary: level1.id === mostSpecific.id });
        if (level2) result.categories.push({ ...level2, confidence: primary.confidence * 0.9, is_primary: level2.id === mostSpecific.id });
        if (level3) result.categories.push({ ...level3, confidence: primary.confidence, is_primary: level3.id === mostSpecific.id });
      }
    }

    // Processa categoria secundária (se houver)
    if (llmResult.secondary) {
      const secondary = llmResult.secondary;
      const level1 = await this.resolveCategory(secondary.level1, 1);
      const level2 = secondary.level2 ? await this.resolveCategory(secondary.level2, 2) : null;
      
      const mostSpecific = level2 || level1;
      
      if (mostSpecific) {
        result.secondary = {
          category_id: mostSpecific.id,
          category_name: mostSpecific.name,
          level: mostSpecific.level,
          confidence: (secondary.confidence || 0.5) * 0.8 // Secundária tem confiança menor
        };

        // Adiciona à lista de categorias
        if (level1 && !result.categories.find(c => c.id === level1.id)) {
          result.categories.push({ ...level1, confidence: secondary.confidence * 0.7, is_primary: false });
        }
        if (level2 && !result.categories.find(c => c.id === level2.id)) {
          result.categories.push({ ...level2, confidence: secondary.confidence * 0.8, is_primary: false });
        }
      }
    }

    return result;
  },

  /**
   * Salva classificação hierárquica no banco
   * @param {number} articleId - ID do artigo
   * @param {Object} classification - Resultado de processClassification
   */
  async saveClassification(articleId, classification) {
    if (!classification.primary) {
      console.warn(`⚠️ Sem categoria primária para artigo ${articleId}`);
      return null;
    }

    const primaryCat = classification.primary;

    // 1. Atualiza artigo com categoria principal
    await query(`
      UPDATE articles 
      SET 
        category_id = $1,
        category_confidence = $2,
        category_path = $3,
        category_level1_id = $4,
        category_level2_id = $5
      WHERE id = $6
    `, [
      primaryCat.category_id,
      primaryCat.confidence,
      primaryCat.category_path,
      primaryCat.hierarchy.level1?.id || null,
      primaryCat.hierarchy.level2?.id || null,
      articleId
    ]);

    // 2. Insere todas as categorias na tabela N:N
    for (const cat of classification.categories) {
      await query(`
        INSERT INTO article_categories (article_id, category_id, confidence, is_primary, level)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (article_id, category_id) 
        DO UPDATE SET confidence = $3, is_primary = $4
      `, [articleId, cat.id, cat.confidence, cat.is_primary, cat.level]);
    }

    console.log(`   ✅ Artigo ${articleId} classificado: ${primaryCat.category_path || primaryCat.category_name}`);
    
    return {
      article_id: articleId,
      category_id: primaryCat.category_id,
      category_name: primaryCat.category_name,
      category_path: primaryCat.category_path,
      confidence: primaryCat.confidence,
      total_categories: classification.categories.length
    };
  },

  /**
   * Busca categorias de um artigo (multi-label)
   * @param {number} articleId
   */
  async getArticleCategories(articleId) {
    const result = await query(`
      SELECT 
        ac.*,
        c.name as category_name,
        c.slug as category_slug,
        c.path as category_path,
        c.level
      FROM article_categories ac
      JOIN categories c ON ac.category_id = c.id
      WHERE ac.article_id = $1
      ORDER BY ac.is_primary DESC, ac.confidence DESC
    `, [articleId]);

    return result.rows;
  },

  /**
   * Busca categorias filhas de uma categoria pai
   * @param {number} parentId
   */
  async getChildCategories(parentId) {
    const result = await query(`
      SELECT * FROM categories
      WHERE parent_id = $1
      ORDER BY name
    `, [parentId]);

    return result.rows;
  },

  /**
   * Busca caminho completo de uma categoria (ancestrais)
   * @param {number} categoryId
   */
  async getCategoryPath(categoryId) {
    const result = await query(`
      SELECT * FROM get_ancestors($1)
    `, [categoryId]);

    return result.rows;
  },

  /**
   * Invalida cache (usar após criar novas categorias)
   */
  invalidateCache() {
    categoriesCache = null;
    cacheTimestamp = 0;
  }
};

export default HierarchicalClassifierService;
export { IPTC_LEVEL1_CATEGORIES, IPTC_LEVEL2_HINTS, IPTC_LEVEL3_HINTS };

