/**
 * Redis Configuration - Upstash
 * Configuração do cache Redis usando Upstash REST API
 */

import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

let redis = null;
let isConnected = false;

/**
 * Inicializa conexão com Upstash Redis
 */
function getRedisClient() {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('⚠️ UPSTASH_REDIS não configurado. Cache desabilitado.');
    return null;
  }

  try {
    redis = new Redis({
      url,
      token,
    });
    isConnected = true;
    console.log('✅ Conectado ao Upstash Redis!');
    return redis;
  } catch (error) {
    console.error('❌ Erro ao conectar ao Upstash:', error.message);
    return null;
  }
}

/**
 * Helper de cache
 */
const cache = {
  /**
   * Busca valor do cache
   */
  async get(key) {
    try {
      const client = getRedisClient();
      if (client) {
        return await client.get(key);
      }
    } catch (error) {
      console.error('Cache get error:', error.message);
    }
    return null;
  },

  /**
   * Salva valor no cache com TTL
   */
  async set(key, value, ttlSeconds = 3600) {
    try {
      const client = getRedisClient();
      if (client) {
        await client.set(key, value, { ex: ttlSeconds });
        return true;
      }
    } catch (error) {
      console.error('Cache set error:', error.message);
    }
    return false;
  },

  /**
   * Remove chave do cache
   */
  async del(key) {
    try {
      const client = getRedisClient();
      if (client) {
        await client.del(key);
        return true;
      }
    } catch (error) {
      console.error('Cache del error:', error.message);
    }
    return false;
  },

  /**
   * Verifica se chave existe
   */
  async exists(key) {
    try {
      const client = getRedisClient();
      if (client) {
        const result = await client.exists(key);
        return result === 1;
      }
    } catch (error) {
      console.error('Cache exists error:', error.message);
    }
    return false;
  },

  /**
   * Incrementa contador
   */
  async incr(key, ttlSeconds = 900) {
    try {
      const client = getRedisClient();
      if (client) {
        const value = await client.incr(key);
        await client.expire(key, ttlSeconds);
        return value;
      }
    } catch (error) {
      console.error('Cache incr error:', error.message);
    }
    return 0;
  },

  /**
   * Limpa chaves de deduplicação
   */
  async flushDedup() {
    try {
      const client = getRedisClient();
      if (client) {
        // Upstash não suporta SCAN diretamente, então usamos KEYS
        // Em produção com muitos dados, isso pode ser lento
        const keys = await client.keys('dedup:*');
        if (keys && keys.length > 0) {
          for (const key of keys) {
            await client.del(key);
          }
          return keys.length;
        }
        return 0;
      }
    } catch (error) {
      console.error('Cache flushDedup error:', error.message);
    }
    return 0;
  }
};

/**
 * Normaliza URL para deduplicação
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Remove parâmetros de tracking
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    parsed.searchParams.delete('ref');
    parsed.searchParams.delete('fbclid');
    parsed.searchParams.delete('gclid');
    // Normaliza
    return parsed.href.toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Gera hash do título para deduplicação
 */
function hashTitle(title) {
  const normalized = title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('md5').update(normalized).digest('hex').slice(0, 12);
}

/**
 * Verifica se artigo é duplicado
 */
async function isDuplicate(url, title) {
  const normalizedUrl = normalizeUrl(url);
  const titleHash = hashTitle(title);

  // Verifica URL
  const urlKey = `dedup:url:${crypto.createHash('md5').update(normalizedUrl).digest('hex').slice(0, 16)}`;
  if (await cache.exists(urlKey)) {
    return { isDuplicate: true, reason: 'url' };
  }

  // Verifica título
  const titleKey = `dedup:title:${titleHash}`;
  if (await cache.exists(titleKey)) {
    return { isDuplicate: true, reason: 'title' };
  }

  return { isDuplicate: false };
}

/**
 * Marca artigo como processado
 */
async function markAsProcessed(url, title) {
  const normalizedUrl = normalizeUrl(url);
  const titleHash = hashTitle(title);
  const TTL = 86400; // 24 horas

  const urlKey = `dedup:url:${crypto.createHash('md5').update(normalizedUrl).digest('hex').slice(0, 16)}`;
  const titleKey = `dedup:title:${titleHash}`;

  await cache.set(urlKey, '1', TTL);
  await cache.set(titleKey, '1', TTL);
}

export default { getRedisClient, cache };
export { cache, normalizeUrl, hashTitle, isDuplicate, markAsProcessed };
