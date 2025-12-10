/**
 * Scraper Service
 * Serviço principal de scraping integrado com rate limiting e deduplicação
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import Site from '../models/Site.js';
import Article from '../models/Article.js';
import ScrapingLog from '../models/ScrapingLog.js';
import { fetchWithRateLimit } from '../utils/rateLimiter.js';
import { isDuplicate, markAsProcessed, normalizeUrl } from '../utils/deduplication.js';

// Seletores comuns de containers de artigos
const ARTICLE_SELECTORS = [
  'article',
  '[class*="article"]',
  '[class*="news"]',
  '[class*="post"]',
  '[class*="entry"]',
  '[class*="item"]',
  '[itemtype*="Article"]'
];

const ScraperService = {
  /**
   * Faz scraping de um site
   */
  async scrapeSite(siteId) {
    const startTime = Date.now();
    const site = await Site.findById(siteId);

    if (!site) {
      throw new Error('Site not found');
    }

    console.log(`\n🔍 Scraping: ${site.name}`);

    try {
      // Faz requisição respeitando rate limit e robots.txt
      const response = await fetchWithRateLimit(site.url);
      const $ = cheerio.load(response.data);

      // Remove elementos desnecessários
      $('script, style, noscript, iframe, svg, nav, footer, header, aside').remove();

      // Extrai metadados do site (se necessário atualizar)
      const metadata = await this.extractMetadata($, site.url);

      // Detecta automaticamente os artigos
      const articles = await this.extractArticles($, site.url, site);

      // Filtra duplicados e salva no banco
      let savedCount = 0;
      let skippedCount = 0;

      for (const article of articles) {
        // Verifica deduplicação
        const dupl = await isDuplicate(article.url, article.title);

        if (dupl.isDuplicate) {
          skippedCount++;
          console.log(`  ⏭️ Duplicado (${dupl.reason}): ${article.title.slice(0, 50)}...`);
          continue;
        }

        // Salva artigo
        try {
          // Se não tem imagem, tenta buscar da página do artigo (fallback)
          if (!article.imageUrl) {
            console.log(`  🖼️ Buscando imagem de ${article.url.slice(0, 50)}...`);
            article.imageUrl = await this.extractImageFromArticlePage(article.url);
          }

          const saved = await Article.create({
            siteId: site.id,
            ...article
          });

          // Classifica via Gemini (se rate limited, fica na fila para depois)
          try {
            const GeminiClassifier = (await import('./geminiClassifierService.js')).default;
            const CategoryService = (await import('./categoryService.js')).default;
            const sseManager = (await import('./sseManager.js')).default;
            const classified = await GeminiClassifier.classifyArticle(article.title, article.summary);

            if (classified) {
              // Normaliza e obtém/cria categoria no banco
              const category = await CategoryService.normalizeAndGetCategory(classified.category);
              
              // Atualiza artigo com category_id
              const updatedArticle = await Article.updateCategory(saved.id, category.id, classified.confidence);
              console.log(`  ✅ ${article.title.slice(0, 50)}... [${category.name}]${article.imageUrl ? ' 🖼️' : ''}`);
              
              // Envia via SSE imediatamente após classificar (um por um)
              sseManager.broadcastFiltered('new_article', {
                id: updatedArticle.id,
                title: updatedArticle.title,
                url: updatedArticle.url,
                summary: updatedArticle.summary,
                image_url: updatedArticle.image_url,
                category_id: category.id,
                category: {
                  id: category.id,
                  name: category.name,
                  slug: category.slug
                },
                category_confidence: updatedArticle.category_confidence,
                published_at: updatedArticle.published_at,
                created_at: updatedArticle.created_at,
                site_id: updatedArticle.site_id,
                site_name: updatedArticle.site_name || site.name
              });
            } else {
              // Rate limited - artigo fica na fila para classificação posterior
              console.log(`  ⏳ ${article.title.slice(0, 50)}... (na fila)${article.imageUrl ? ' 🖼️' : ''}`);
            }
          } catch (classError) {
            console.log(`  ⏳ ${article.title.slice(0, 50)}... (na fila - ${classError.message})${article.imageUrl ? ' 🖼️' : ''}`);
          }

          // Marca como processado
          await markAsProcessed(article.url, article.title);
          savedCount++;
        } catch (error) {
          console.error(`  ❌ Erro ao salvar: ${error.message}`);
        }
      }

      // Atualiza última execução
      await Site.updateLastScraped(siteId);

      // Registra log
      const duration = Date.now() - startTime;
      await ScrapingLog.create({
        siteId,
        status: 'success',
        articlesFound: articles.length,
        scrapingDuration: duration
      });

      console.log(`✅ Scraping concluído: ${savedCount} novos, ${skippedCount} duplicados`);

      return {
        success: true,
        totalFound: articles.length,
        saved: savedCount,
        skipped: skippedCount,
        duration
      };

    } catch (error) {
      console.error(`❌ Erro no scraping: ${error.message}`);

      // Registra log de erro
      await ScrapingLog.create({
        siteId,
        status: 'failed',
        errorMessage: error.message,
        scrapingDuration: Date.now() - startTime
      });

      throw error;
    }
  },

  /**
   * Extrai metadados do site
   */
  async extractMetadata($, url) {
    return {
      title: $('title').text().trim() ||
        $('meta[property="og:site_name"]').attr('content') ||
        new URL(url).hostname,
      description: $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') || ''
    };
  },

  /**
   * Extrai artigos da página
   */
  async extractArticles($, baseUrl, site) {
    const articles = [];
    const seen = new Set();

    // Seletores priorizados - mais específicos primeiro
    const PRIORITY_SELECTORS = [
      // Seletores semânticos
      'article[itemtype*="NewsArticle"]',
      'article[itemtype*="Article"]',
      'article',

      // Links diretos para notícias (fallback poderoso)
      'a[href*="/noticia"]',
      'a[href*="/noticias/"]',
      'a[href*="/news/"]',

      // Classes específicas de notícias
      '[class*="post-item"]',
      '[class*="news-item"]',
      '[class*="news-card"]',
      '[class*="article-item"]',
      '[class*="article-card"]',
      '[class*="story-card"]',
      '[class*="story"]',

      // Classes com card/box de conteúdo
      '[class*="content-card"]',
      '[class*="feed-post"]',
      '[class*="card-news"]',
      '[class*="destaque"]',
      '[class*="headline"]',

      // G1 / Globo
      '.feed-post-body',
      '.bastian-feed-item',

      // UOL
      '[class*="headlines"]',
      '[class*="result-item"]',

      // Climatempo
      '[class*="card-noticia"]',
      '[class*="noticia-item"]',

      // Terra / R7
      '[class*="story"]',
      '[class*="teaser"]',

      // Genéricos (último recurso)
      '[class*="entry"]',
      '[class*="item"]',
      'li a[href*="/"]',
    ];

    for (const selector of PRIORITY_SELECTORS) {
      try {
        $(selector).each((_, element) => {
          const article = this.extractArticleData($, element, baseUrl);

          if (this.isValidArticle(article) && !seen.has(article.url)) {
            seen.add(article.url);
            articles.push(article);
          }
        });

        // Se encontrou artigos suficientes com este seletor, para
        if (articles.length >= 15) break;
      } catch (e) {
        // Seletor inválido, continua
      }
    }

    return articles.slice(0, 30); // Limita a 30 por scraping
  },

  /**
   * Valida se é realmente um artigo
   */
  isValidArticle(article) {
    if (!article || !article.url || !article.title) return false;

    // Título muito curto
    if (article.title.length < 20) return false;

    // URLs a ignorar
    const ignorePatterns = [
      '/autor/',
      '/categoria/',
      '/tag/',
      '/busca',
      '/search',
      '/page/',
      '/contato',
      '/sobre',
      'javascript:',
      '#',
    ];

    for (const pattern of ignorePatterns) {
      if (article.url.includes(pattern)) return false;
    }

    // Título muito genérico
    const genericTitles = [
      'leia mais',
      'saiba mais',
      'veja',
      'confira',
      'assista',
      'clique aqui',
      'acesse',
    ];

    const titleLower = article.title.toLowerCase();
    for (const generic of genericTitles) {
      if (titleLower === generic) return false;
    }

    return true;
  },

  /**
   * Extrai dados de um artigo específico
   */
  extractArticleData($, element, baseUrl) {
    const $el = $(element);

    // URL do artigo - verifica se o próprio elemento é um link
    let $link;
    let url;

    if ($el.is('a') && $el.attr('href')) {
      // O próprio elemento é um link
      $link = $el;
      url = $el.attr('href');
    } else {
      // Busca link dentro do elemento
      $link = $el.find('a[href*="/noticia"]').first(); // Climatempo, etc
      if (!$link.length) $link = $el.find('h1 a, h2 a, h3 a').first();
      if (!$link.length) $link = $el.find('a[href]').first();
      url = $link.attr('href');
    }

    if (!url) return null;

    // Converte URL relativa para absoluta
    if (url.startsWith('/')) {
      const base = new URL(baseUrl);
      url = `${base.protocol}//${base.host}${url}`;
    } else if (url.startsWith('http') === false) {
      try {
        url = new URL(url, baseUrl).href;
      } catch (e) {
        return null;
      }
    }

    // Título - prioriza headings, depois título do link
    let title = '';
    const $heading = $el.find('h1, h2, h3, h4').first();
    if ($heading.length) {
      title = $heading.text().trim();
    } else {
      const $title = $el.find('[class*="title"], [class*="headline"]').first();
      title = $title.text().trim() || $link.text().trim() || $link.attr('title') || '';
    }

    // Se o título ainda estiver vazio e o elemento é um link, pega o texto do link
    if (!title && $el.is('a')) {
      title = $el.text().trim() || $el.attr('title') || '';
    }

    if (!title || title.length < 10) return null;

    // Resumo/descrição - ignora textos muito curtos
    let summary = null;
    const $summary = $el.find('p, [class*="summary"], [class*="description"], [class*="excerpt"]').first();
    const summaryText = $summary.text().trim();
    if (summaryText && summaryText.length > 30) {
      summary = summaryText;
    }

    // Imagem - busca em múltiplas fontes
    let imageUrl = this.extractBestImage($el, baseUrl);

    // Data (tentativa)
    const $time = $el.find('time, [class*="date"], [class*="time"]').first();
    let publishedAt = $time.attr('datetime') || null;

    return {
      title: title.slice(0, 500),
      url: normalizeUrl(url),
      summary: summary ? summary.slice(0, 1000) : null,
      imageUrl,
      publishedAt,
      author: null
    };
  },

  /**
   * Extrai a melhor imagem do elemento
   */
  extractBestImage($el, baseUrl) {
    // Atributos de lazy loading PRIMEIRO (têm a URL real)
    // 'src' por último porque frequentemente contém placeholder SVG
    const imgAttrs = [
      'data-src',
      'data-lazy-src',
      'data-original',
      'data-image',
      'data-bg',
      'data-url',
      'data-lazy',
      'data-load-src',
      'data-srcset',
      'src' // Por último - frequentemente placeholder em lazy loading
    ];

    let imageUrl = null;

    // 1. PRIORIDADE: Busca imagens WordPress (featured-img, wp-post-image)
    const wpSelectors = [
      'img.wp-post-image',
      'img.featured-img',
      'img[class*="wp-image"]',
      'img[src*="wp-content/uploads"]'
    ];

    for (const selector of wpSelectors) {
      const $wpImg = $el.find(selector).first();
      if ($wpImg.length) {
        for (const attr of imgAttrs) {
          const value = $wpImg.attr(attr);
          if (value && this.isValidImageUrl(value)) {
            imageUrl = value;
            break;
          }
        }
        if (imageUrl) break;
      }
    }

    // 2. Busca em figure/picture (alta prioridade)
    if (!imageUrl) {
      const $figure = $el.find('figure img, picture img, picture source').first();
      if ($figure.length) {
        for (const attr of imgAttrs) {
          const value = $figure.attr(attr);
          if (value && this.isValidImageUrl(value)) {
            imageUrl = value;
            break;
          }
        }
      }
    }

    // 3. Busca imagens normais (incluindo srcset)
    if (!imageUrl) {
      const $imgs = $el.find('img');
      $imgs.each((_, img) => {
        if (imageUrl) return;
        const $img = $el.find(img);

        // Tenta srcset primeiro (maior resolução)
        const srcset = $img.attr('srcset') || $img.attr('data-srcset');
        if (srcset) {
          const srcsetUrl = this.extractFromSrcset(srcset);
          if (srcsetUrl) {
            imageUrl = srcsetUrl;
            return;
          }
        }

        // Fallback para atributos padrão
        for (const attr of imgAttrs) {
          const value = $img.attr(attr);
          if (value && this.isValidImageUrl(value)) {
            imageUrl = value;
            break;
          }
        }
      });
    }

    // 4. Busca background-image em divs
    if (!imageUrl) {
      const bgSelectors = [
        '[style*="background-image"]',
        '[class*="thumb"]',
        '[class*="image"]'
      ];
      for (const selector of bgSelectors) {
        const $bgDiv = $el.find(selector).first();
        if ($bgDiv.length) {
          const style = $bgDiv.attr('style') || '';
          const match = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
          if (match && this.isValidImageUrl(match[1])) {
            imageUrl = match[1];
            break;
          }
        }
      }
    }

    // 5. Busca no elemento pai (para casos onde imagem está fora do link)
    if (!imageUrl) {
      const $parent = $el.parent();
      const $parentImg = $parent.find('img').first();
      if ($parentImg.length) {
        for (const attr of imgAttrs) {
          const value = $parentImg.attr(attr);
          if (value && this.isValidImageUrl(value)) {
            imageUrl = value;
            break;
          }
        }
      }
    }

    // 6. Busca em elementos irmãos anteriores
    if (!imageUrl) {
      const $prev = $el.prev();
      const $prevImg = $prev.find('img').add($prev.filter('img'));
      if ($prevImg.length) {
        for (const attr of imgAttrs) {
          const value = $prevImg.first().attr(attr);
          if (value && this.isValidImageUrl(value)) {
            imageUrl = value;
            break;
          }
        }
      }
    }

    // Converte para URL absoluta
    if (imageUrl) {
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        const base = new URL(baseUrl);
        imageUrl = `${base.protocol}//${base.host}${imageUrl}`;
      } else if (!imageUrl.startsWith('http')) {
        try {
          imageUrl = new URL(imageUrl, baseUrl).href;
        } catch (e) {
          imageUrl = null;
        }
      }
    }

    return imageUrl;
  },

  /**
   * ALGORITMO INTELIGENTE DE EXTRAÇÃO DE IMAGEM
   * Busca a imagem PRINCIPAL da notícia usando múltiplos critérios
   */
  async extractImageFromArticlePage(articleUrl) {
    try {
      const response = await axios.get(articleUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);

      // ===== MÉTODO 1: META TAGS (MAIS CONFIÁVEL) =====
      // og:image é quase sempre a imagem principal da notícia
      let ogImage = $('meta[property="og:image"]').attr('content');
      if (ogImage && this.isMainArticleImage(ogImage)) {
        return this.normalizeImageUrl(ogImage, articleUrl);
      }

      // twitter:image como fallback
      let twitterImage = $('meta[name="twitter:image"]').attr('content') ||
        $('meta[name="twitter:image:src"]').attr('content');
      if (twitterImage && this.isMainArticleImage(twitterImage)) {
        return this.normalizeImageUrl(twitterImage, articleUrl);
      }

      // ===== MÉTODO 2: JSON-LD STRUCTURED DATA =====
      let jsonLdImage = null;
      $('script[type="application/ld+json"]').each((_, script) => {
        if (jsonLdImage) return;
        try {
          const data = JSON.parse($(script).html());
          // Pode ser NewsArticle, Article, BlogPosting, etc
          const articleData = data['@graph']?.find(item =>
            ['NewsArticle', 'Article', 'BlogPosting', 'WebPage'].includes(item['@type'])
          ) || data;

          if (articleData.image) {
            let img = articleData.image;
            if (Array.isArray(img)) img = img[0];
            if (typeof img === 'object') img = img.url || img['@id'];
            if (img && this.isMainArticleImage(img)) {
              jsonLdImage = img;
            }
          }
        } catch (e) { }
      });

      if (jsonLdImage) {
        return this.normalizeImageUrl(jsonLdImage, articleUrl);
      }

      // ===== MÉTODO 3: SISTEMA DE PONTUAÇÃO PARA IMAGENS NO CONTEÚDO =====
      // Usado quando meta tags não estão disponíveis
      const imageScores = [];

      // Seletores de conteúdo principal (ordem de prioridade)
      const contentSelectors = [
        'article .post-content',
        'article .entry-content',
        'article .article-content',
        'article .content',
        '.post-content',
        '.entry-content',
        '.article-body',
        '.single-post',
        'article',
        'main',
        '[role="main"]'
      ];

      let $content = null;
      for (const selector of contentSelectors) {
        $content = $(selector).first();
        if ($content.length) break;
      }

      if (!$content || !$content.length) {
        $content = $('body');
      }

      // Analisa cada imagem
      $content.find('img').each((index, img) => {
        const $img = $(img);
        const src = $img.attr('data-src') || $img.attr('data-lazy-src') ||
          $img.attr('data-original') || $img.attr('src');

        if (!src || !this.isMainArticleImage(src)) return;

        let score = 0;

        // +50 pontos: Imagem com classe indicando featured/principal
        const imgClass = ($img.attr('class') || '').toLowerCase();
        const imgParentClass = ($img.parent().attr('class') || '').toLowerCase();
        const featuredKeywords = ['featured', 'hero', 'main', 'principal', 'destaque', 'thumbnail', 'post-image', 'wp-post-image'];
        for (const kw of featuredKeywords) {
          if (imgClass.includes(kw) || imgParentClass.includes(kw)) {
            score += 50;
            break;
          }
        }

        // +40 pontos: Dentro de figure (semântica correta)
        if ($img.closest('figure').length) score += 40;

        // +30 pontos: Tem alt text (imagem importante tem descrição)
        const alt = $img.attr('alt') || '';
        if (alt.length > 10) score += 30;

        // +25 pontos: É a primeira imagem significativa
        if (index === 0) score += 25;
        if (index === 1) score += 15;
        if (index === 2) score += 5;

        // +20 pontos: URL indica conteúdo principal
        const srcLower = src.toLowerCase();
        if (srcLower.includes('wp-content/uploads') ||
          srcLower.includes('/uploads/') ||
          srcLower.includes('/images/')) {
          score += 20;
        }

        // +15 pontos: Tamanho grande especificado
        const width = parseInt($img.attr('width')) || 0;
        const height = parseInt($img.attr('height')) || 0;
        if (width >= 600 || height >= 400) score += 15;
        if (width >= 800 || height >= 600) score += 10;

        // -30 pontos: Classes que indicam NÃO ser a imagem principal
        const excludeKeywords = ['avatar', 'author', 'logo', 'icon', 'ad', 'banner', 'sidebar', 'widget', 'related', 'comment'];
        for (const kw of excludeKeywords) {
          if (imgClass.includes(kw) || imgParentClass.includes(kw)) {
            score -= 30;
            break;
          }
        }

        // -20 pontos: Imagem muito pequena especificada
        if ((width > 0 && width < 200) || (height > 0 && height < 150)) {
          score -= 20;
        }

        // -50 pontos: Dentro de aside, sidebar ou footer
        if ($img.closest('aside, [class*="sidebar"], footer, [class*="related"]').length) {
          score -= 50;
        }

        imageScores.push({ url: src, score });
      });

      // Ordena por pontuação e pega a melhor
      if (imageScores.length > 0) {
        imageScores.sort((a, b) => b.score - a.score);
        const best = imageScores[0];

        // Só aceita se score >= 20 (evita pegar imagens aleatórias)
        if (best.score >= 20) {
          return this.normalizeImageUrl(best.url, articleUrl);
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  },

  /**
   * Verifica se a imagem é candidata a imagem principal do artigo
   * Filtra logos, avatares, ícones, etc.
   */
  isMainArticleImage(url) {
    if (!url || typeof url !== 'string') return false;

    const urlLower = url.toLowerCase();

    // Ignora data URIs pequenas
    if (url.startsWith('data:') && url.length < 500) return false;

    // Padrões que NÃO são imagem principal
    const excludePatterns = [
      'logo', 'icon', 'avatar', 'author', 'gravatar',
      'placeholder', 'loading', 'spinner', 'blank',
      'pixel', 'spacer', 'transparent', '1x1',
      'emoji', 'smiley', 'badge', 'button',
      'ad-', 'ads-', 'advertisement', 'banner-ad',
      'share', 'social', 'facebook', 'twitter', 'whatsapp',
      'print', 'email', 'comment', 'profile'
    ];

    for (const pattern of excludePatterns) {
      if (urlLower.includes(pattern)) return false;
    }

    // Extensões permitidas
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];
    const hasValidExtension = validExtensions.some(ext =>
      urlLower.includes(ext) || !urlLower.match(/\.[a-z]{2,4}(\?|$)/)
    );

    return hasValidExtension;
  },

  /**
   * Normaliza URL de imagem para formato absoluto
   */
  normalizeImageUrl(url, baseUrl) {
    if (!url) return null;

    if (url.startsWith('//')) {
      return 'https:' + url;
    } else if (url.startsWith('/')) {
      try {
        const base = new URL(baseUrl);
        return `${base.protocol}//${base.host}${url}`;
      } catch (e) {
        return null;
      }
    } else if (!url.startsWith('http')) {
      try {
        return new URL(url, baseUrl).href;
      } catch (e) {
        return null;
      }
    }

    return url;
  },

  /**
   * Extrai srcset e retorna a maior imagem
   */
  extractFromSrcset(srcset) {
    if (!srcset) return null;

    try {
      // srcset format: "url1 300w, url2 600w, url3 1200w"
      const parts = srcset.split(',').map(s => s.trim());
      let bestUrl = null;
      let bestSize = 0;

      for (const part of parts) {
        const match = part.match(/^(.+?)\\s+(\\d+)w?$/);
        if (match) {
          const url = match[1].trim();
          const size = parseInt(match[2]) || 0;
          if (size > bestSize && this.isValidImageUrl(url)) {
            bestSize = size;
            bestUrl = url;
          }
        } else {
          // Sem indicador de tamanho, usa o primeiro válido
          const url = part.split(/\\s+/)[0];
          if (!bestUrl && this.isValidImageUrl(url)) {
            bestUrl = url;
          }
        }
      }

      return bestUrl;
    } catch (e) {
      return null;
    }
  },

  /**
   * Valida se é uma URL de imagem válida
   */
  isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // Ignora data URIs pequenas (provavelmente placeholders)
    if (url.startsWith('data:') && url.length < 200) return false;

    // Ignora SVGs inline muito pequenos
    if (url.includes('data:image/svg') && url.length < 500) return false;

    // Ignora padrões de placeholders/logos
    const ignorePatterns = [
      'logo',
      'icon',
      'avatar',
      'placeholder',
      'loading',
      'spinner',
      'blank',
      '1x1',
      'transparent',
      'pixel',
      'spacer'
    ];

    const urlLower = url.toLowerCase();
    for (const pattern of ignorePatterns) {
      if (urlLower.includes(pattern)) return false;
    }

    return true;
  },

  /**
   * Testa scraping de um site (sem salvar)
   */
  async testScrape(url) {
    console.log(`\n🧪 Testando scraping: ${url}`);

    try {
      const response = await fetchWithRateLimit(url);
      const $ = cheerio.load(response.data);
      $('script, style, noscript, iframe').remove();

      const articles = await this.extractArticles($, url, {});

      return {
        success: true,
        articlesFound: articles.length,
        preview: articles.slice(0, 5).map(a => ({
          title: a.title.slice(0, 80),
          url: a.url,
          hasImage: !!a.imageUrl
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};

export default ScraperService;
