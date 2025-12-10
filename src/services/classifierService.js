/**
 * Classifier Service - Versão Avançada
 * Classificação de alta precisão com múltiplas técnicas
 */

import { pipeline } from '@huggingface/transformers';
import Article from '../models/Article.js';
import dotenv from 'dotenv';

dotenv.config();

// Categorias com palavras-chave muito específicas
const CATEGORY_CONFIG = {
  'Fórmula 1': {
    keywords: ['fórmula 1', 'f1', 'verstappen', 'hamilton', 'ferrari f1', 'red bull racing',
      'mercedes f1', 'gp de', 'grande prêmio', 'pole position', 'grid de largada',
      'pit stop', 'paddock', 'fia', 'automobilismo'],
    entities: ['verstappen', 'hamilton', 'leclerc', 'norris', 'alonso', 'pérez', 'sainz'],
    label: 'corrida de Fórmula 1 e automobilismo'
  },
  'Futebol': {
    keywords: ['futebol', 'gol', 'campeonato brasileiro', 'libertadores', 'copa do brasil',
      'série a', 'série b', 'premier league', 'la liga', 'champions league',
      'técnico', 'escalação', 'artilheiro', 'zagueiro', 'atacante', 'goleiro',
      'contratação', 'reforço', 'titular', 'reserva', 'banco', 'elenco', 'torcida'],
    entities: ['flamengo', 'palmeiras', 'corinthians', 'são paulo fc', 'santos', 'grêmio',
      'internacional', 'atlético', 'botafogo', 'fluminense', 'vasco', 'cruzeiro',
      'bahia', 'fortaleza', 'ceará sc', 'sport', 'náutico', 'vitória', 'bragantino',
      'cuiabá', 'goiás', 'coritiba', 'athletico', 'juventude', 'américa mg',
      'barcelona', 'real madrid', 'manchester', 'liverpool', 'chelsea', 'arsenal',
      'neymar', 'messi', 'mbappé', 'vini jr', 'vinicius', 'rodrygo', 'endrick',
      'léo ortiz', 'gabigol', 'pedro', 'arrascaeta', 'raphinha', 'paquetá',
      'richarlison', 'casemiro', 'ancelotti', 'felipão', 'abel ferreira'],
    label: 'futebol e campeonatos de futebol'
  },
  'Esportes': {
    keywords: ['basquete', 'vôlei', 'tênis', 'natação', 'atletismo', 'olimpíadas',
      'mma', 'ufc', 'boxe', 'nba', 'surfe', 'skate', 'ciclismo', 'maratona',
      'judô', 'ginástica', 'handball', 'corrida'],
    entities: ['medina', 'djokovic', 'nadal', 'federer', 'lebron', 'jordan'],
    label: 'esportes em geral como basquete, tênis, vôlei'
  },
  'Economia': {
    keywords: ['economia', 'inflação', 'juros', 'selic', 'pib', 'dólar', 'euro',
      'bolsa de valores', 'ibovespa', 'nasdaq', 'criptomoeda', 'bitcoin',
      'banco central', 'copom', 'taxa de juros', 'desemprego', 'recessão'],
    entities: ['campos neto', 'haddad', 'petrobras', 'vale', 'itaú', 'bradesco'],
    label: 'economia, finanças e mercado financeiro'
  },
  'Política': {
    keywords: ['congresso', 'senado', 'câmara', 'deputado', 'senador', 'planalto',
      'stf', 'ministro', 'votação', 'projeto de lei', 'pec', 'reforma',
      'eleição', 'urna', 'tse', 'partido', 'oposição', 'governo federal'],
    entities: ['lula', 'bolsonaro', 'dino', 'pacheco', 'lira', 'moraes', 'barroso',
      'pt', 'psd', 'pl', 'psdb', 'pp', 'mdb', 'união brasil'],
    label: 'política brasileira, governo e congresso'
  },
  'Tecnologia': {
    keywords: ['tecnologia', 'inteligência artificial', 'ia', 'chatgpt', 'robô',
      'programação', 'software', 'aplicativo', 'app', 'startup', 'inovação',
      'internet', '5g', 'processador', 'nvidia', 'semicondutores', 'dados', 'cloud'],
    entities: ['apple', 'google', 'microsoft', 'meta', 'amazon', 'openai', 'nvidia',
      'elon musk', 'tim cook', 'zuckerberg', 'satya nadella', 'samsung', 'tesla'],
    label: 'tecnologia, inovação, software e startups'
  },
  'Entretenimento': {
    keywords: ['filme', 'cinema', 'série', 'streaming', 'netflix', 'disney',
      'música', 'cantor', 'show', 'álbum', 'grammy', 'oscar', 'globo de ouro',
      'novela', 'ator', 'atriz', 'celebridade', 'rock in rio', 'festival'],
    entities: ['taylor swift', 'beyoncé', 'anitta', 'lady gaga', 'di caprio',
      'margot robbie', 'tom cruise', 'oppenheimer', 'barbie'],
    label: 'entretenimento, cinema, música e TV'
  },
  'Negócios': {
    keywords: ['empresa', 'ceo', 'corporação', 'fusão', 'aquisição', 'ipo',
      'ações', 'investimento', 'lucro', 'receita', 'balanço', 'resultados',
      'empreendedorismo', 'startup', 'unicórnio'],
    entities: ['magazine luiza', 'americanas', 'ambev', 'jbs', 'btg', 'nubank'],
    label: 'negócios, empresas e corporações'
  },
  'Mundo': {
    keywords: ['internacional', 'exterior', 'guerra', 'conflito', 'exército',
      'forças armadas', 'otan', 'onu', 'diplomacia', 'embaixada', 'sanções',
      'míssil', 'bombardeio', 'invasão', 'refugiados', 'imigração',
      'porta-aviões', 'caças', 'tropas', 'militar', 'países'],
    entities: ['ucrânia', 'rússia', 'putin', 'zelensky', 'biden', 'trump',
      'china', 'xi jinping', 'israel', 'palestina', 'hamas', 'gaza',
      'venezuela', 'maduro', 'irã', 'coreia do norte', 'união europeia', 'eua'],
    label: 'notícias internacionais, guerras e diplomacia'
  },
  'Saúde': {
    keywords: ['saúde', 'hospital', 'médico', 'doença', 'tratamento', 'vacina',
      'sus', 'anvisa', 'medicamento', 'remédio', 'cirurgia', 'câncer',
      'diabetes', 'covid', 'pandemia', 'epidemia', 'dengue', 'surto',
      'plano de saúde', 'nutrição', 'dieta', 'bem-estar'],
    entities: ['fiocruz', 'butantan', 'oms', 'pfizer', 'moderna', 'drauzio'],
    label: 'saúde, medicina, hospitais e bem-estar'
  },
  'Educação': {
    keywords: ['educação', 'escola', 'universidade', 'faculdade', 'vestibular',
      'enem', 'sisu', 'prouni', 'fies', 'professor', 'aluno', 'ensino',
      'graduação', 'mestrado', 'doutorado', 'mec', 'greve professores'],
    entities: ['usp', 'unicamp', 'ufrj', 'ufmg', 'puc', 'fgv', 'insper'],
    label: 'educação, escolas e universidades'
  },
  'Ciência': {
    keywords: ['ciência', 'pesquisa', 'cientista', 'descoberta', 'estudo',
      'nasa', 'espaço', 'foguete', 'satélite', 'asteroide', 'planeta',
      'física', 'química', 'biologia', 'genética', 'dna', 'experimento',
      'laboratório', 'nobel', 'cnpq', 'capes'],
    entities: ['nasa', 'spacex', 'james webb', 'marte', 'lua', 'einstein'],
    label: 'ciência, pesquisa científica e espaço'
  },
  'Meio Ambiente': {
    keywords: ['meio ambiente', 'clima', 'aquecimento global', 'desmatamento',
      'amazônia', 'floresta', 'poluição', 'sustentabilidade', 'reciclagem',
      'energia renovável', 'solar', 'eólica', 'ibama', 'queimadas', 'incêndio',
      'cop', 'carbono', 'emissões', 'biodiversidade'],
    entities: ['greenpeace', 'ibama', 'icmbio', 'marina silva', 'greta'],
    label: 'meio ambiente, clima e sustentabilidade'
  },
  'Segurança': {
    keywords: ['polícia', 'crime', 'violência', 'assalto', 'roubo', 'homicídio',
      'assassinato', 'prisão', 'preso', 'delegacia', 'investigação', 'operação',
      'tráfico', 'drogas', 'facção', 'milícia', 'segurança pública', 'pm',
      'polícia federal', 'delegado'],
    entities: ['pf', 'polícia civil', 'bope', 'coe', 'pcc', 'cv'],
    label: 'segurança pública, polícia e crime'
  },
  'Religião': {
    keywords: ['religião', 'igreja', 'padre', 'pastor', 'bispo', 'papa',
      'missa', 'culto', 'evangélico', 'católico', 'espírita', 'natal',
      'páscoa', 'fé', 'deus', 'bíblia', 'oração'],
    entities: ['vaticano', 'papa francisco', 'edir macedo', 'silas malafaia'],
    label: 'religião, fé e igrejas'
  },
  'Automóveis': {
    keywords: ['carro', 'automóvel', 'veículo', 'lançamento', 'test drive',
      'motor', 'combustível', 'elétrico', 'híbrido', 'suv', 'sedan', 'hatch',
      'quilometragem', 'avaliação', 'recall', 'ipva', 'detran'],
    entities: ['volkswagen', 'fiat', 'chevrolet', 'toyota', 'honda', 'hyundai',
      'ford', 'jeep', 'bmw', 'mercedes', 'audi', 'byd'],
    label: 'automóveis, carros e veículos'
  },
  'Games': {
    keywords: ['game', 'jogo', 'videogame', 'playstation', 'xbox', 'nintendo',
      'pc gamer', 'esports', 'campeonato gaming', 'streamer', 'twitch',
      'fps', 'mmorpg', 'battle royale', 'console'],
    entities: ['sony', 'microsoft gaming', 'nintendo', 'riot games', 'epic games',
      'steam', 'fortnite', 'call of duty', 'minecraft', 'gta', 'fifa'],
    label: 'jogos, videogames e esports'
  },
  'Brasil': {
    keywords: ['estados', 'municípios', 'prefeito', 'governador', 'regional',
      'tragédia', 'acidente', 'enchente', 'chuva', 'desastre', 'resgate',
      'infraestrutura', 'obras', 'transporte público'],
    entities: [],
    label: 'notícias nacionais e regionais do Brasil'
  }
};

// Configuração de detecção de LOCAL
const LOCATION_CONFIG = {
  'São Paulo': ['são paulo', 'sp', 'paulista', 'sampa', 'capital paulista'],
  'Rio de Janeiro': ['rio de janeiro', 'rj', 'carioca', 'rio', 'zona sul', 'zona norte'],
  'Minas Gerais': ['minas gerais', 'mg', 'mineiro', 'bh', 'belo horizonte'],
  'Bahia': ['bahia', 'ba', 'baiano', 'salvador', 'nordeste baiano'],
  'Rio Grande do Sul': ['rio grande do sul', 'rs', 'gaúcho', 'porto alegre', 'gaucha'],
  'Paraná': ['paraná', 'pr', 'paranaense', 'curitiba'],
  'Santa Catarina': ['santa catarina', 'sc', 'catarinense', 'florianópolis'],
  'Pernambuco': ['pernambuco', 'pe', 'pernambucano', 'recife'],
  'Ceará': ['ceará', 'ce', 'cearense', 'fortaleza'],
  'Distrito Federal': ['distrito federal', 'df', 'brasília', 'brasiliense'],
  'Goiás': ['goiás', 'go', 'goiano', 'goiânia'],
  'Amazonas': ['amazonas', 'am', 'manaus', 'amazonense'],
  'Pará': ['pará', 'pa', 'paraense', 'belém'],
  'Maranhão': ['maranhão', 'ma', 'maranhense', 'são luís'],
  'Espírito Santo': ['espírito santo', 'es', 'capixaba', 'vitória']
};

const DEFAULT_CATEGORIES = Object.keys(CATEGORY_CONFIG);

let classifier = null;

const ClassifierService = {
  /**
   * Inicializa o modelo de classificação
   */
  async loadModel() {
    if (classifier) return classifier;

    console.log('🤖 Carregando modelo de classificação avançado...');
    console.log('   Modelo: Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7');

    classifier = await pipeline(
      'zero-shot-classification',
      'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7'
    );

    console.log('✅ Modelo carregado com sucesso!');
    return classifier;
  },

  /**
   * Pré-processa o texto para melhor análise
   */
  preprocessText(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos para matching
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Detecta categoria por palavras-chave e entidades
   */
  detectByKeywords(text) {
    const normalizedText = this.preprocessText(text);
    const scores = {};

    for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
      let score = 0;

      // Verifica palavras-chave (peso 2)
      for (const keyword of config.keywords) {
        const normalizedKeyword = this.preprocessText(keyword);
        if (normalizedText.includes(normalizedKeyword)) {
          score += 2;
        }
      }

      // Verifica entidades (peso 3 - mais específicas)
      for (const entity of config.entities) {
        const normalizedEntity = this.preprocessText(entity);
        if (normalizedText.includes(normalizedEntity)) {
          score += 3;
        }
      }

      if (score > 0) {
        scores[category] = score;
      }
    }

    // Retorna categoria com maior score
    if (Object.keys(scores).length > 0) {
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const [topCategory, topScore] = sorted[0];

      // Só usa keyword match se score for significativo (>= 4)
      if (topScore >= 4) {
        return {
          category: topCategory,
          confidence: Math.min(0.95, 0.7 + (topScore * 0.03)),
          method: 'keywords'
        };
      }
    }

    return null;
  },

  /**
   * Detecta localização (estado brasileiro) no texto
   */
  detectLocation(text) {
    const normalizedText = this.preprocessText(text);

    for (const [location, aliases] of Object.entries(LOCATION_CONFIG)) {
      for (const alias of aliases) {
        const normalizedAlias = this.preprocessText(alias);
        if (normalizedText.includes(normalizedAlias)) {
          return location;
        }
      }
    }

    return null;
  },

  /**
   * Classifica usando modelo de IA
   */
  async classifyWithAI(text, categories = DEFAULT_CATEGORIES) {
    const model = await this.loadModel();

    // Prepara labels expandidos
    const labels = categories.map(cat =>
      CATEGORY_CONFIG[cat]?.label || cat
    );

    const result = await model(text, labels, {
      multi_label: false,
      hypothesis_template: 'Esta notícia é sobre {}'
    });

    // Mapeia de volta para categoria original
    const topLabel = result.labels[0];
    const labelIndex = labels.indexOf(topLabel);
    const category = categories[labelIndex >= 0 ? labelIndex : 0];

    return {
      category,
      confidence: result.scores[0],
      method: 'ai'
    };
  },

  /**
   * Classificação híbrida: keywords + IA + Localização
   */
  async classifyArticle(text, categories = DEFAULT_CATEGORIES) {
    // Detecta localização
    const location = this.detectLocation(text);

    // 1. Tenta detecção por keywords primeiro (mais rápido e preciso para casos óbvios)
    const keywordResult = this.detectByKeywords(text);

    if (keywordResult && keywordResult.confidence >= 0.85) {
      return { ...keywordResult, location };
    }

    // 2. Usa IA para casos não óbvios
    const aiResult = await this.classifyWithAI(text, categories);

    // 3. Se keyword tinha um match mas com baixa confiança, compara com IA
    if (keywordResult) {
      // Se ambos concordam, aumenta a confiança
      if (keywordResult.category === aiResult.category) {
        return {
          category: aiResult.category,
          confidence: Math.min(0.98, aiResult.confidence + 0.1),
          method: 'hybrid',
          location
        };
      }

      // Se keyword tinha score significativo, preferir keywords
      if (keywordResult.confidence >= 0.75) {
        return { ...keywordResult, location };
      }
    }

    return { ...aiResult, location };
  },

  /**
   * Processa artigos não categorizados do banco
   */
  async processUncategorized(batchSize = 50) {
    console.log('\n🧠 Classificando artigos não categorizados...');

    const uncategorized = await Article.findUncategorized(batchSize);

    if (uncategorized.length === 0) {
      console.log('   ✅ Nenhum artigo para classificar');
      return { processed: 0 };
    }

    console.log(`   Encontrados: ${uncategorized.length} artigos`);

    let processed = 0;
    const startTime = Date.now();

    for (const article of uncategorized) {
      try {
        const text = article.summary
          ? `${article.title}. ${article.summary}`
          : article.title;

        const classification = await this.classifyArticle(text);

        await Article.updateCategory(
          article.id,
          classification.category,
          classification.confidence
        );

        processed++;
        console.log(`   [${classification.method}] ${article.title.slice(0, 40)}... → ${classification.category}`);
      } catch (error) {
        console.error(`   ❌ Erro ao classificar artigo ${article.id}:`, error.message);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n   ✅ Classificados: ${processed} artigos em ${duration}s`);

    return {
      processed,
      duration: parseFloat(duration)
    };
  },

  /**
   * Reclassifica todos os artigos (para atualizar com novo algoritmo)
   */
  async reclassifyAll(limit = 500) {
    console.log(`\n🔄 Reclassificando todos os artigos (limite: ${limit})...`);

    const articles = await Article.findAll({ limit });
    let processed = 0;

    for (const article of articles) {
      try {
        const text = article.summary
          ? `${article.title}. ${article.summary}`
          : article.title;

        const classification = await this.classifyArticle(text);

        await Article.updateCategory(
          article.id,
          classification.category,
          classification.confidence
        );

        processed++;
        if (processed % 10 === 0) {
          console.log(`   Progresso: ${processed}/${articles.length}`);
        }
      } catch (error) {
        console.error(`   ❌ Erro: ${error.message}`);
      }
    }

    console.log(`   ✅ Reclassificados: ${processed} artigos`);
    return { processed };
  }
};

export default ClassifierService;
