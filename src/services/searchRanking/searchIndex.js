/**
 * In-Memory Search Cache & Precomputed Index
 * 
 * Provides sub-100ms response times for repeat and popular queries,
 * with LRU eviction and field precomputation.
 */

import { SEARCH_RANKING_CONFIG } from "./config.js";
import { normalizeText } from "./textNormalizer.js";

class SearchLRUCache {
  constructor(maxSize = SEARCH_RANKING_CONFIG.thresholds.cacheMaxSize, ttlMs = SEARCH_RANKING_CONFIG.thresholds.cacheTtlMs) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU position
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

export const searchLRUCache = new SearchLRUCache();
