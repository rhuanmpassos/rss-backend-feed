/**
 * Embedding Service
 * Gera embeddings de texto usando sentence-transformers
 * 
 * Modelo: paraphrase-multilingual-MiniLM-L12-v2 (384 dimensões)
 * - Multilíngue (suporta português)
 * - Otimizado para textos curtos (título + snippet)
 * 
 * ⚠️ FASE 3: Este serviço será usado quando implementarmos Content-Based Filtering
 * Por enquanto, é apenas a estrutura básica.
 */

// NOTA: Para usar embeddings, instalar:
// npm install @xenova/transformers

let pipeline = null;
let extractor = null;

const EmbeddingService = {
  /**
   * Status do serviço
   */
  isReady: false,
  modelName: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  dimensions: 384,

  /**
   * Inicializa o modelo de embeddings
   * Chamado uma vez no startup (lazy loading)
   */
  async initialize() {
    if (this.isReady) return;

    try {
      console.log('🧠 Carregando modelo de embeddings...');
      
      // Importa dinamicamente (lazy load)
      const transformers = await import('@xenova/transformers');
      pipeline = transformers.pipeline;
      
      // Carrega modelo multilíngue
      extractor = await pipeline('feature-extraction', this.modelName, {
        quantized: true // Usa versão quantizada (menor, mais rápida)
      });
      
      this.isReady = true;
      console.log('✅ Modelo de embeddings carregado!');
      
    } catch (error) {
      console.warn('⚠️ Embeddings não disponíveis:', error.message);
      console.warn('   Para habilitar: npm install @xenova/transformers');
      this.isReady = false;
    }
  },

  /**
   * Gera embedding de um texto
   * @param {string} text - Texto para gerar embedding
   * @returns {Promise<number[]>} - Vetor de 384 dimensões
   */
  async generateEmbedding(text) {
    if (!this.isReady) {
      await this.initialize();
    }

    if (!extractor) {
      throw new Error('Modelo de embeddings não está disponível');
    }

    // Limita tamanho do texto (modelo tem limite)
    const truncatedText = text.substring(0, 512);

    // Gera embedding com pooling 'mean' e normalização
    const output = await extractor(truncatedText, { 
      pooling: 'mean', 
      normalize: true 
    });

    // Converte para array
    return Array.from(output.data);
  },

  /**
   * Gera embedding de um artigo (título + snippet)
   * @param {Object} article - { title, summary }
   * @returns {Promise<number[]>}
   */
  async generateArticleEmbedding(article) {
    // Combina título + snippet
    const text = `${article.title}. ${article.summary || ''}`.trim();
    return await this.generateEmbedding(text);
  },

  /**
   * Gera embeddings em batch (mais eficiente)
   * @param {Array<Object>} articles - Array de { title, summary }
   * @returns {Promise<Array<number[]>>}
   */
  async generateBatchEmbeddings(articles) {
    const embeddings = [];
    
    for (const article of articles) {
      try {
        const embedding = await this.generateArticleEmbedding(article);
        embeddings.push(embedding);
      } catch (error) {
        console.error(`Erro ao gerar embedding: ${error.message}`);
        embeddings.push(null);
      }
    }
    
    return embeddings;
  },

  /**
   * Calcula similaridade de cosseno entre dois vetores
   * @param {number[]} vecA
   * @param {number[]} vecB
   * @returns {number} - Similaridade de -1 a 1
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  },

  /**
   * Calcula média de múltiplos embeddings (para perfil do usuário)
   * @param {Array<number[]>} embeddings
   * @returns {number[]}
   */
  averageEmbeddings(embeddings) {
    if (!embeddings || embeddings.length === 0) {
      return new Array(this.dimensions).fill(0);
    }

    // Filtra embeddings válidos
    const validEmbeddings = embeddings.filter(e => e && e.length === this.dimensions);
    
    if (validEmbeddings.length === 0) {
      return new Array(this.dimensions).fill(0);
    }

    // Calcula média
    const sum = new Array(this.dimensions).fill(0);
    
    for (const embedding of validEmbeddings) {
      for (let i = 0; i < this.dimensions; i++) {
        sum[i] += embedding[i];
      }
    }

    return sum.map(val => val / validEmbeddings.length);
  },

  /**
   * Encontra artigos mais similares a um embedding
   * @param {number[]} embedding - Embedding de referência
   * @param {Array<{id: number, embedding: number[]}>} articles - Artigos com embeddings
   * @param {number} limit - Número de resultados
   * @returns {Array<{id: number, similarity: number}>}
   */
  findMostSimilar(embedding, articles, limit = 10) {
    const similarities = articles
      .filter(a => a.embedding)
      .map(article => ({
        id: article.id,
        similarity: this.cosineSimilarity(embedding, article.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return similarities;
  }
};

export default EmbeddingService;

