/**
 * Trader Discovery Service
 *
 * Main orchestrator for discovering and analyzing profitable Polymarket traders.
 * Coordinates caching, analysis, ranking, and simulation components.
 *
 * Features:
 * - Discover top traders from leaderboards
 * - Analyze trader performance
 * - Cache results for efficient access
 * - Rank traders by configurable criteria
 * - Simulate copy trading profitability
 */

import { EventEmitter } from 'events';
import axios, { type AxiosInstance } from 'axios';
import type {
  TraderPerformance,
  RankingCriteria,
  RankedTrader,
  SimulationParams,
  SimulationResult,
  BatchSimulationRequest,
  BatchSimulationResult,
  DiscoveryFilter,
  TraderDiscoveryState,
} from './types.js';
import { TraderCache, traderCache } from './TraderCache.js';
import { TraderAnalyzer, traderAnalyzer } from './TraderAnalyzer.js';
import { TraderRanker, traderRanker } from './TraderRanker.js';
import { CopySimulator, copySimulator } from './CopySimulator.js';
import { createComponentLogger } from '../../utils/logger.js';
import * as metrics from '../../utils/metrics.js';

const log = createComponentLogger('TraderDiscoveryService');

/**
 * Service configuration
 */
export interface TraderDiscoveryServiceConfig {
  enabled: boolean;
  dataApiUrl: string;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  defaultTimeframeDays: number;
  maxConcurrentAnalyses: number;
  rateLimitDelayMs: number;
}

const DEFAULT_CONFIG: TraderDiscoveryServiceConfig = {
  enabled: true,
  dataApiUrl: 'https://data-api.polymarket.com',
  cacheEnabled: true,
  cacheTtlMs: 3600000, // 1 hour
  defaultTimeframeDays: 30,
  maxConcurrentAnalyses: 3,
  rateLimitDelayMs: 500,
};

/**
 * Trader Discovery Service
 */
export class TraderDiscoveryService extends EventEmitter {
  private config: TraderDiscoveryServiceConfig;
  private httpClient: AxiosInstance;
  private cache: TraderCache;
  private analyzer: TraderAnalyzer;
  private ranker: TraderRanker;
  private simulator: CopySimulator;
  private state: TraderDiscoveryState;

  constructor(config: Partial<TraderDiscoveryServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.httpClient = axios.create({
      baseURL: this.config.dataApiUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    // Initialize sub-components
    this.cache = traderCache;
    this.analyzer = traderAnalyzer;
    this.ranker = traderRanker;
    this.simulator = copySimulator;

    // Configure cache
    this.cache.updateConfig({
      ttlMs: this.config.cacheTtlMs,
    });

    // Initialize state
    this.state = {
      isScanning: false,
      tradersAnalyzed: 0,
      tradersInCache: 0,
    };

    // Forward events from sub-components
    this.forwardEvents();
  }

  /**
   * Forward events from sub-components
   */
  private forwardEvents(): void {
    this.cache.on('cacheHit', (address) => this.emit('cacheHit', address));
    this.cache.on('cacheMiss', (address) => this.emit('cacheMiss', address));
    this.cache.on('cacheUpdated', (address) => this.emit('cacheUpdated', address));

    this.simulator.on('simulationStarted', (params) => this.emit('simulationStarted', params));
    this.simulator.on('simulationCompleted', (result) => this.emit('simulationCompleted', result));
    this.simulator.on('batchSimulationCompleted', (result) =>
      this.emit('batchSimulationCompleted', result)
    );
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      log.warn('Trader discovery service is disabled');
      return;
    }

    // Start cache cleanup
    this.cache.startCleanup();

    log.info('Trader discovery service started', {
      cacheEnabled: this.config.cacheEnabled,
      timeframeDays: this.config.defaultTimeframeDays,
    });
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    this.cache.stopCleanup();
    log.info('Trader discovery service stopped');
  }

  /**
   * Get current service state
   */
  getState(): TraderDiscoveryState {
    return {
      ...this.state,
      tradersInCache: this.cache.getCachedAddresses().length,
    };
  }

  /**
   * Discover top traders from Polymarket leaderboard
   */
  async discoverTopTraders(count: number = 20): Promise<string[]> {
    log.info('Discovering top traders', { count });

    try {
      // Fetch leaderboard from Polymarket data API
      const response = await this.httpClient.get<
        Array<{ address: string; profit: number; volume: number }>
      >('/leaderboard', {
        params: {
          limit: count * 2, // Fetch extra to filter
        },
      });

      metrics.traderDiscoveryApiCalls.labels('leaderboard').inc();

      const addresses = (response.data || [])
        .filter((entry) => entry.profit > 0) // Only profitable traders
        .slice(0, count)
        .map((entry) => entry.address.toLowerCase());

      log.info('Discovered traders from leaderboard', {
        found: addresses.length,
      });

      return addresses;
    } catch (error) {
      // Fallback: Return empty array if leaderboard API not available
      log.warn('Leaderboard API not available, returning empty list', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Analyze a single trader
   */
  async analyzeTrader(
    address: string,
    options: { bypassCache?: boolean; timeframeDays?: number } = {}
  ): Promise<TraderPerformance> {
    const normalizedAddress = address.toLowerCase();
    const timeframeDays = options.timeframeDays || this.config.defaultTimeframeDays;

    // Check cache first
    if (this.config.cacheEnabled && !options.bypassCache) {
      const cached = this.cache.getPerformance(normalizedAddress);
      if (cached) {
        log.debug('Cache hit for trader', {
          address: normalizedAddress.slice(0, 10) + '...',
        });
        return cached;
      }
    }

    // Analyze trader
    const performance = await this.analyzer.analyzeTrader(normalizedAddress, timeframeDays);

    // Cache the result
    if (this.config.cacheEnabled) {
      const trades = await this.analyzer.fetchTradeHistory(normalizedAddress, {
        startDate: new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000),
      });
      this.cache.set(normalizedAddress, performance, trades);
    }

    this.state.tradersAnalyzed++;
    this.emit('traderAnalyzed', performance);

    return performance;
  }

  /**
   * Analyze multiple traders
   */
  async analyzeTraders(
    addresses: string[],
    options: { bypassCache?: boolean; timeframeDays?: number } = {}
  ): Promise<Map<string, TraderPerformance>> {
    const results = new Map<string, TraderPerformance>();

    this.state.isScanning = true;
    this.state.scanProgress = {
      current: 0,
      total: addresses.length,
    };

    this.emit('scanStarted');

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i]!;
      const scanProgress: { current: number; total: number; currentTrader?: string } = {
        current: i + 1,
        total: addresses.length,
      };
      scanProgress.currentTrader = address;
      this.state.scanProgress = scanProgress;

      this.emit('scanProgress', {
        current: i + 1,
        total: addresses.length,
        trader: address,
      });

      try {
        const performance = await this.analyzeTrader(address, options);
        results.set(address.toLowerCase(), performance);
      } catch (error) {
        log.error('Failed to analyze trader', {
          address: address.slice(0, 10) + '...',
          error: error instanceof Error ? error.message : String(error),
        });
        this.emit('error', error instanceof Error ? error : new Error(String(error)), { address });
      }

      // Rate limiting delay
      if (i < addresses.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.config.rateLimitDelayMs));
      }
    }

    this.state.isScanning = false;
    this.state.lastScanAt = new Date();
    delete this.state.scanProgress;

    log.info('Trader analysis batch complete', {
      total: addresses.length,
      successful: results.size,
    });

    return results;
  }

  /**
   * Get ranked top traders
   */
  async getTopTraders(
    count: number = 10,
    filter?: DiscoveryFilter,
    criteria?: Partial<RankingCriteria>
  ): Promise<RankedTrader[]> {
    // Get performances (from cache or fresh analysis)
    let performances: TraderPerformance[];

    // First try to get from cache
    performances = this.cache.getAllPerformances();

    // If cache is empty, discover and analyze traders
    if (performances.length === 0) {
      const addresses = await this.discoverTopTraders(count * 3);
      const analyzed = await this.analyzeTraders(addresses);
      performances = Array.from(analyzed.values());
    }

    // Apply optional filters
    if (filter) {
      performances = this.applyFilters(performances, filter);
    }

    // Update ranker criteria if provided
    if (criteria) {
      this.ranker.updateCriteria(criteria);
    }

    // Rank and return top N
    return this.ranker.getTopTraders(performances, count);
  }

  /**
   * Apply discovery filters to performances
   */
  private applyFilters(
    performances: TraderPerformance[],
    filter: DiscoveryFilter
  ): TraderPerformance[] {
    return performances.filter((p) => {
      if (filter.minVolume && p.totalVolume < filter.minVolume) return false;
      if (filter.minTrades && p.totalTrades < filter.minTrades) return false;
      if (filter.minActiveDays && p.activeDays < filter.minActiveDays) return false;
      if (filter.minWinRate && p.winRate < filter.minWinRate) return false;
      if (filter.minRoi && p.roi < filter.minRoi) return false;
      if (filter.minProfitFactor && p.profitFactor < filter.minProfitFactor) return false;
      if (filter.maxDrawdown && p.maxDrawdown > filter.maxDrawdown) return false;
      if (filter.minOpenPositions && p.openPositions < filter.minOpenPositions) return false;
      if (filter.maxOpenPositions && p.openPositions > filter.maxOpenPositions) return false;

      // Timeframe filter
      if (filter.timeframeDays) {
        const cutoffDate = new Date(Date.now() - filter.timeframeDays * 24 * 60 * 60 * 1000);
        if (p.lastTradeAt < cutoffDate) return false;
      }

      return true;
    });
  }

  /**
   * Get trader's trade history
   */
  async getTraderTrades(
    address: string,
    options: { startDate?: Date; endDate?: Date; limit?: number } = {}
  ) {
    // Check cache first
    const cached = this.cache.getTrades(address);
    if (cached.length > 0) {
      // Apply filters to cached trades
      let filtered = cached;
      if (options.startDate) {
        filtered = filtered.filter((t) => t.timestamp >= options.startDate!);
      }
      if (options.endDate) {
        filtered = filtered.filter((t) => t.timestamp <= options.endDate!);
      }
      if (options.limit) {
        filtered = filtered.slice(0, options.limit);
      }
      return filtered;
    }

    // Fetch fresh
    const historyOptions: { startDate?: Date; endDate?: Date; limit?: number } = {};
    if (options.startDate) {
      historyOptions.startDate = options.startDate;
    }
    if (options.endDate) {
      historyOptions.endDate = options.endDate;
    }
    if (options.limit) {
      historyOptions.limit = options.limit;
    }
    return this.analyzer.fetchTradeHistory(address, historyOptions);
  }

  /**
   * Simulate copy trading for a trader
   */
  async simulateCopyTrading(params: SimulationParams): Promise<SimulationResult> {
    return this.simulator.simulate(params);
  }

  /**
   * Simulate copy trading for multiple traders
   */
  async simulateBatch(request: BatchSimulationRequest): Promise<BatchSimulationResult> {
    return this.simulator.simulateBatch(request);
  }

  /**
   * Compare sizing strategies for a trader
   */
  async compareStrategies(
    traderAddress: string,
    params: Omit<SimulationParams, 'traderAddress' | 'sizingStrategy'>
  ) {
    return this.simulator.compareStrategies(traderAddress, params);
  }

  /**
   * Find traders similar to a reference trader
   */
  async findSimilarTraders(
    referenceAddress: string,
    count: number = 5
  ): Promise<RankedTrader[]> {
    // Get reference trader performance
    const reference = await this.analyzeTrader(referenceAddress);

    // Get all cached performances
    const allPerformances = this.cache.getAllPerformances();

    if (allPerformances.length < 2) {
      // Need more traders to compare
      const discovered = await this.discoverTopTraders(50);
      await this.analyzeTraders(discovered);
    }

    const candidates = this.cache.getAllPerformances();
    return this.ranker.findSimilarTraders(reference, candidates, count);
  }

  /**
   * Get ranking criteria presets
   */
  getRankingPresets() {
    return TraderRanker.getPresets();
  }

  /**
   * Update ranking criteria
   */
  updateRankingCriteria(criteria: Partial<RankingCriteria>): void {
    this.ranker.updateCriteria(criteria);
  }

  /**
   * Get current ranking criteria
   */
  getRankingCriteria(): RankingCriteria {
    return this.ranker.getCriteria();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    log.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Export cache for persistence
   */
  exportCache() {
    return this.cache.exportCache();
  }

  /**
   * Import cache from persistence
   */
  importCache(data: ReturnType<typeof this.cache.exportCache>): number {
    return this.cache.importCache(data);
  }

  /**
   * Update service configuration
   */
  updateConfig(config: Partial<TraderDiscoveryServiceConfig>): void {
    this.config = { ...this.config, ...config };

    // Update cache config
    if (config.cacheTtlMs !== undefined) {
      this.cache.updateConfig({ ttlMs: config.cacheTtlMs });
    }

    log.info('Service config updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): TraderDiscoveryServiceConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const traderDiscoveryService = new TraderDiscoveryService();

// Default export
export default TraderDiscoveryService;
