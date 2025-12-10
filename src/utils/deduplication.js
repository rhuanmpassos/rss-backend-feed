/**
 * Deduplication Utils
 * Utilitários para deduplicação de artigos
 */

import crypto from 'crypto';
import { cache } from '../config/redis.js';

/**
 * Normaliza URL removendo query params e fragmentos
 */
export function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);

    // Remove query params
    urlObj.search = '';

    // Remove fragment
    urlObj.hash = '';

    // Remove trailing slash
    let normalized = urlObj.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized.toLowerCase();
  } catch (error) {
    return url.toLowerCase();
  }
}

/**
 * Gera hash MD5 de um texto
 */
export function hashText(text) {
  return crypto
    .createHash('md5')
    .update(text.toLowerCase().trim())
    .digest('hex');
}

/**
 * Verifica se artigo já foi processado recentemente
 */
export async function isDuplicate(url, title, hoursLimit = 24) {
  const normalizedUrl = normalizeUrl(url);
  const titleHash = hashText(title);

  // Chaves para verificação
  const urlKey = `article:url:${normalizedUrl}`;
  const titleKey = `article:title:${titleHash}`;

  // Verifica se URL já existe
  const urlExists = await cache.exists(urlKey);
  if (urlExists) {
    return { isDuplicate: true, reason: 'url' };
  }

  // Verifica se título similar existe
  const titleExists = await cache.exists(titleKey);
  if (titleExists) {
    return { isDuplicate: true, reason: 'title' };
  }

  return { isDuplicate: false };
}

/**
 * Marca artigo como processado
 */
export async function markAsProcessed(url, title, hoursLimit = 24) {
  const normalizedUrl = normalizeUrl(url);
  const titleHash = hashText(title);
  const expirationInSeconds = hoursLimit * 3600;

  await cache.set(`article:url:${normalizedUrl}`, Date.now(), expirationInSeconds);
  await cache.set(`article:title:${titleHash}`, Date.now(), expirationInSeconds);
}

/**
 * Limpa marcações antigas
 */
export async function clearOldMarkers() {
  // Redis já remove automaticamente com TTL
  // Esta função é apenas para compatibilidade
  return true;
}
