/**
 * Trader Cache
 *
 * Caches trader performance data and recent trades to reduce API calls.
 * Implements time-based expiration and LRU-style eviction.
 *
 * Features:
 * - In-memory caching with configurable TTL
 * - Automatic cache eviction when size limit reached
 * - Cache hit/miss metrics
 * - Persistence support (optional DB backing)
 */

import { EventEmitter } from 'events';
import type { TraderCacheEntry, TraderPerformance } from './types.js';
import type { DetectedTrade } from '../copyTrading/types.js';
import { createComponentLogger } from '../../utils/logger.js';

const log = createComponentLogger('TraderCache');

/**
 * Cache configuration
 */
export interface TraderCacheConfig {
  maxSize: number; // Maximum number of traders to cache
  ttlMs: number; // Time-to-live for cache entries
  cleanupIntervalMs: number; // How often to run cleanup
}

const DEFAULT_CONFIG: TraderCacheConfig = {
  maxSize: 500,
  ttlMs: 3600000, // 1 hour
  cleanupIntervalMs: 300000, // 5 minutes
};

/**
 * Trader Cache service
 */
export class TraderCache extends EventEmitter {
  private cache: Map<string, TraderCacheEntry> = new Map();
  private config: TraderCacheConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private accessOrder: string[] = []; // Track access order for LRU eviction

  constructor(config: Partial<TraderCacheConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start automatic cache cleanup
   */
  startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.evictExpired();
    }, this.config.cleanupIntervalMs);

    log.info('Cache cleanup started', {
      intervalMs: this.config.cleanupIntervalMs,
    });
  }

  /**
   * Stop automatic cache cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      log.info('Cache cleanup stopped');
    }
  }

  /**
   * Get a cached trader entry
   */
  get(address: string): TraderCacheEntry | undefined {
    const normalizedAddress = address.toLowerCase();
    const entry = this.cache.get(normalizedAddress);

    if (!entry) {
      this.emit('cacheMiss', normalizedAddress);
      return undefined;
    }

    // Check if expired
    if (new Date() > entry.expiresAt) {
      this.cache.delete(normalizedAddress);
      this.removeFromAccessOrder(normalizedAddress);
      this.emit('cacheMiss', normalizedAddress);
      return undefined;
    }

    // Update access order (move to end)
    this.updateAccessOrder(normalizedAddress);

    this.emit('cacheHit', normalizedAddress);
    return entry;
  }

  /**
   * Check if trader is cached and not expired
   */
  has(address: string): boolean {
    const entry = this.get(address);
    return entry !== undefined;
  }

  /**
   * Get only the performance data for a trader
   */
  getPerformance(address: string): TraderPerformance | undefined {
    const entry = this.get(address);
    return entry?.performance;
  }

  /**
   * Get recent trades for a trader
   */
  getTrades(address: string): DetectedTrade[] {
    const entry = this.get(address);
    return entry?.recentTrades || [];
  }

  /**
   * Set a cache entry
   */
  set(
    address: string,
    performance: TraderPerformance,
    recentTrades: DetectedTrade[] = []
  ): void {
    const normalizedAddress = address.toLowerCase();
    const now = new Date();

    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize && !this.cache.has(normalizedAddress)) {
      this.evictLRU();
    }

    const entry: TraderCacheEntry = {
      address: normalizedAddress,
      performance,
      recentTrades,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + this.config.ttlMs),
    };

    this.cache.set(normalizedAddress, entry);
    this.updateAccessOrder(normalizedAddress);

    log.debug('Cache entry set', {
      address: normalizedAddress.slice(0, 10) + '...',
      expiresAt: entry.expiresAt.toISOString(),
      tradesCount: recentTrades.length,
    });

    this.emit('cacheUpdated', normalizedAddress);
  }

  /**
   * Update only performance data, keeping existing trades
   */
  updatePerformance(address: string, performance: TraderPerformance): void {
    const normalizedAddress = address.toLowerCase();
    const existing = this.cache.get(normalizedAddress);

    if (existing) {
      this.set(normalizedAddress, performance, existing.recentTrades);
    } else {
      this.set(normalizedAddress, performance, []);
    }
  }

  /**
   * Append new trades to cached trader
   */
  appendTrades(address: string, newTrades: DetectedTrade[]): void {
    const normalizedAddress = address.toLowerCase();
    const existing = this.cache.get(normalizedAddress);

    if (existing) {
      // Deduplicate by transaction hash
      const existingHashes = new Set(existing.recentTrades.map((t) => t.transactionHash));
      const uniqueNewTrades = newTrades.filter((t) => !existingHashes.has(t.transactionHash));

      const updatedTrades = [...existing.recentTrades, ...uniqueNewTrades];

      // Keep only most recent trades (limit to 1000)
      const limitedTrades = updatedTrades.slice(-1000);

      this.set(normalizedAddress, existing.performance, limitedTrades);
    }
  }

  /**
   * Delete a cache entry
   */
  delete(address: string): boolean {
    const normalizedAddress = address.toLowerCase();
    const existed = this.cache.delete(normalizedAddress);
    this.removeFromAccessOrder(normalizedAddress);

    if (existed) {
      log.debug('Cache entry deleted', {
        address: normalizedAddress.slice(0, 10) + '...',
      });
    }

    return existed;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder = [];

    log.info('Cache cleared', { entriesCleared: size });
  }

  /**
   * Get all cached trader addresses
   */
  getCachedAddresses(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all cached entries
   */
  getAllEntries(): TraderCacheEntry[] {
    // Filter out expired entries
    const now = new Date();
    return Array.from(this.cache.values()).filter((entry) => entry.expiresAt > now);
  }

  /**
   * Get all cached performances
   */
  getAllPerformances(): TraderPerformance[] {
    return this.getAllEntries().map((entry) => entry.performance);
  }

  /**
   * Evict expired entries
   */
  private evictExpired(): number {
    const now = new Date();
    let evicted = 0;

    for (const [address, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(address);
        this.removeFromAccessOrder(address);
        evicted++;
      }
    }

    if (evicted > 0) {
      log.debug('Evicted expired entries', { count: evicted });
    }

    return evicted;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruAddress = this.accessOrder[0];
    if (lruAddress) {
      this.cache.delete(lruAddress);
      this.accessOrder.shift();

      log.debug('Evicted LRU entry', {
        address: lruAddress.slice(0, 10) + '...',
      });
    }
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(address: string): void {
    this.removeFromAccessOrder(address);
    this.accessOrder.push(address);
  }

  /**
   * Remove from access order array
   */
  private removeFromAccessOrder(address: string): void {
    const index = this.accessOrder.indexOf(address);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttlMs: number;
    oldestEntryAge: number | null;
    newestEntryAge: number | null;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.values());

    let oldestAge: number | null = null;
    let newestAge: number | null = null;

    if (entries.length > 0) {
      const ages = entries.map((e) => now - e.cachedAt.getTime());
      oldestAge = Math.max(...ages);
      newestAge = Math.min(...ages);
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      ttlMs: this.config.ttlMs,
      oldestEntryAge: oldestAge,
      newestEntryAge: newestAge,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TraderCacheConfig>): void {
    const wasRunning = this.cleanupInterval !== null;

    if (wasRunning) {
      this.stopCleanup();
    }

    this.config = { ...this.config, ...config };

    if (wasRunning) {
      this.startCleanup();
    }

    log.info('Cache config updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): TraderCacheConfig {
    return { ...this.config };
  }

  /**
   * Export cache for persistence
   */
  exportCache(): TraderCacheEntry[] {
    return Array.from(this.cache.values());
  }

  /**
   * Import cache from persistence
   */
  importCache(entries: TraderCacheEntry[]): number {
    let imported = 0;
    const now = new Date();

    for (const entry of entries) {
      // Skip expired entries
      if (entry.expiresAt <= now) {
        continue;
      }

      // Skip if at capacity
      if (this.cache.size >= this.config.maxSize) {
        break;
      }

      const normalizedAddress = entry.address.toLowerCase();
      this.cache.set(normalizedAddress, entry);
      this.accessOrder.push(normalizedAddress);
      imported++;
    }

    log.info('Cache imported', {
      attempted: entries.length,
      imported,
    });

    return imported;
  }
}

// Export singleton instance
export const traderCache = new TraderCache();
