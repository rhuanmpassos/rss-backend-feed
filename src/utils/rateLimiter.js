/**
 * Rate Limiter
 * Controla taxa de requisições por domínio
 */

import { cache } from '../config/redis.js';
import robotsParser from 'robots-parser';
import axios from 'axios';

const robotsCache = new Map();

/**
 * Adiciona delay entre requisições
 */
export async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verifica rate limit para um domínio
 */
export async function checkRateLimit(domain) {
  const key = `ratelimit:${domain}`;
  const windowInSeconds = Math.floor(
    parseInt(process.env.RATE_LIMIT_WINDOW || 900000) / 1000
  );

  const count = await cache.incr(key, windowInSeconds);
  const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || 100);

  if (count > maxRequests) {
    const ttl = await cache.get(key + ':ttl');
    throw new Error(`Rate limit exceeded for ${domain}. Try again in ${ttl}s`);
  }

  return true;
}

/**
 * Obtém robots.txt de um site
 */
export async function getRobotsTxt(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;

    // Verifica cache
    if (robotsCache.has(robotsUrl)) {
      return robotsCache.get(robotsUrl);
    }

    // Busca robots.txt
    const response = await axios.get(robotsUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': process.env.USER_AGENT
      }
    });

    const robots = robotsParser(robotsUrl, response.data);
    robotsCache.set(robotsUrl, robots);

    return robots;
  } catch (error) {
    // Se não encontrar robots.txt, permite tudo
    return robotsParser('', '');
  }
}

/**
 * Verifica se pode fazer scraping de uma URL
 */
export async function canScrape(url) {
  const respectRobots = process.env.RESPECT_ROBOTS_TXT === 'true';

  if (!respectRobots) {
    return true;
  }

  try {
    const urlObj = new URL(url);
    const robots = await getRobotsTxt(url);
    const userAgent = process.env.USER_AGENT || 'Mozilla/5.0';

    const allowed = robots.isAllowed(url, userAgent);

    if (!allowed) {
      console.warn(`⚠️ Bloqueado por robots.txt: ${url}`);
    }

    return allowed;
  } catch (error) {
    console.error('Erro ao verificar robots.txt:', error.message);
    return true; // Em caso de erro, permite
  }
}

/**
 * Obtém Crawl-delay do robots.txt
 */
export async function getCrawlDelay(url) {
  try {
    const robots = await getRobotsTxt(url);
    const userAgent = process.env.USER_AGENT || 'Mozilla/5.0';

    const delay = robots.getCrawlDelay(userAgent);
    return delay || parseInt(process.env.REQUEST_DELAY || 1500);
  } catch (error) {
    return parseInt(process.env.REQUEST_DELAY || 1500);
  }
}

/**
 * Wrapper para fazer requisição respeitando rate limits
 */
export async function fetchWithRateLimit(url, options = {}) {
  const urlObj = new URL(url);
  const domain = urlObj.hostname;

  // Verifica rate limit
  await checkRateLimit(domain);

  // Verifica robots.txt
  const allowed = await canScrape(url);
  if (!allowed) {
    throw new Error('Blocked by robots.txt');
  }

  // Obtém delay recomendado
  const crawlDelay = await getCrawlDelay(url);

  // Adiciona delay
  await delay(crawlDelay);

  // Faz requisição
  return axios.get(url, {
    ...options,
    headers: {
      'User-Agent': process.env.USER_AGENT,
      ...options.headers
    },
    timeout: 30000
  });
}
