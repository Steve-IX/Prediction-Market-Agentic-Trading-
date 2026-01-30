/**
 * Trader Monitor
 *
 * Monitors Polymarket for trades from tracked traders using the data API.
 * Detects new trades by polling the activity endpoint at regular intervals.
 *
 * Flow:
 * 1. Polls https://data-api.polymarket.com/activity?user={address}&type=TRADE
 * 2. Compares against known trades to find new ones
 * 3. Emits 'tradeDetected' events for new trades
 */

import { EventEmitter } from 'events';
import axios, { type AxiosInstance } from 'axios';
import type { DetectedTrade, PolymarketActivity, PolymarketPosition, TraderCopyConfig } from './types.js';
import { createComponentLogger } from '../../utils/logger.js';
import * as metrics from '../../utils/metrics.js';

const log = createComponentLogger('TraderMonitor');

/**
 * Trader monitor configuration
 */
export interface TraderMonitorConfig {
  pollIntervalMs: number;
  dataApiUrl: string;
  maxAgeHours: number; // Ignore trades older than this
  requestTimeoutMs: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: TraderMonitorConfig = {
  pollIntervalMs: 5000,
  dataApiUrl: 'https://data-api.polymarket.com',
  maxAgeHours: 24,
  requestTimeoutMs: 10000,
  maxRetries: 3,
};

/**
 * Trader Monitor service
 */
export class TraderMonitor extends EventEmitter {
  private config: TraderMonitorConfig;
  private httpClient: AxiosInstance;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;

  // Tracked traders
  private trackedTraders: Map<string, TraderCopyConfig> = new Map();
  // Known trade IDs to avoid duplicates: traderAddress -> Set<transactionHash>
  private knownTrades: Map<string, Set<string>> = new Map();
  // Last positions for each trader: traderAddress -> positions
  private traderPositions: Map<string, PolymarketPosition[]> = new Map();
  // Track if this is the first poll for a trader (to skip historical trades)
  private firstPoll: Set<string> = new Set();

  constructor(config: Partial<TraderMonitorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.httpClient = axios.create({
      baseURL: this.config.dataApiUrl,
      timeout: this.config.requestTimeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }

  /**
   * Add a trader to monitor
   */
  addTrader(config: TraderCopyConfig): void {
    const address = config.address.toLowerCase();
    this.trackedTraders.set(address, config);
    this.knownTrades.set(address, new Set());
    this.firstPoll.add(address);

    log.info('Added trader to monitor', {
      address: address.slice(0, 10) + '...',
      name: config.name || 'unnamed',
      isActive: config.isActive,
    });

    metrics.copyTradingTrackedTraders.inc();
    if (config.isActive) {
      metrics.copyTradingActiveTraders.inc();
    }
  }

  /**
   * Remove a trader from monitoring
   */
  removeTrader(address: string): void {
    const normalizedAddress = address.toLowerCase();
    const config = this.trackedTraders.get(normalizedAddress);

    if (config) {
      this.trackedTraders.delete(normalizedAddress);
      this.knownTrades.delete(normalizedAddress);
      this.traderPositions.delete(normalizedAddress);
      this.firstPoll.delete(normalizedAddress);

      log.info('Removed trader from monitor', {
        address: normalizedAddress.slice(0, 10) + '...',
      });

      metrics.copyTradingTrackedTraders.dec();
      if (config.isActive) {
        metrics.copyTradingActiveTraders.dec();
      }
    }
  }

  /**
   * Update a trader's configuration
   */
  updateTrader(address: string, updates: Partial<TraderCopyConfig>): void {
    const normalizedAddress = address.toLowerCase();
    const existing = this.trackedTraders.get(normalizedAddress);

    if (existing) {
      const wasActive = existing.isActive;
      const updated = { ...existing, ...updates, updatedAt: new Date() };
      this.trackedTraders.set(normalizedAddress, updated);

      // Update active trader count
      if (wasActive && !updated.isActive) {
        metrics.copyTradingActiveTraders.dec();
      } else if (!wasActive && updated.isActive) {
        metrics.copyTradingActiveTraders.inc();
      }

      log.debug('Updated trader config', {
        address: normalizedAddress.slice(0, 10) + '...',
      });
    }
  }

  /**
   * Get all tracked traders
   */
  getTrackedTraders(): TraderCopyConfig[] {
    return Array.from(this.trackedTraders.values());
  }

  /**
   * Get a specific trader's config
   */
  getTrader(address: string): TraderCopyConfig | undefined {
    return this.trackedTraders.get(address.toLowerCase());
  }

  /**
   * Get positions for a trader
   */
  getTraderPositions(address: string): PolymarketPosition[] {
    return this.traderPositions.get(address.toLowerCase()) || [];
  }

  /**
   * Fetch trades for a trader from Polymarket data API
   */
  private async fetchTraderTrades(address: string): Promise<PolymarketActivity[]> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get<PolymarketActivity[]>('/activity', {
        params: {
          user: address,
          type: 'TRADE',
        },
      });

      const latencyMs = Date.now() - startTime;
      metrics.traderDiscoveryApiCalls.labels('activity').inc();
      metrics.traderDiscoveryApiLatency.labels('activity').observe(latencyMs);

      return response.data || [];
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      metrics.traderDiscoveryApiLatency.labels('activity').observe(latencyMs);

      if (axios.isAxiosError(error)) {
        log.error('Failed to fetch trader trades', {
          address: address.slice(0, 10) + '...',
          status: error.response?.status,
          message: error.message,
        });
      }
      throw error;
    }
  }

  /**
   * Fetch positions for a trader from Polymarket data API
   */
  private async fetchTraderPositions(address: string): Promise<PolymarketPosition[]> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get<PolymarketPosition[]>('/positions', {
        params: {
          user: address,
        },
      });

      const latencyMs = Date.now() - startTime;
      metrics.traderDiscoveryApiCalls.labels('positions').inc();
      metrics.traderDiscoveryApiLatency.labels('positions').observe(latencyMs);

      return response.data || [];
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      metrics.traderDiscoveryApiLatency.labels('positions').observe(latencyMs);

      if (axios.isAxiosError(error)) {
        log.error('Failed to fetch trader positions', {
          address: address.slice(0, 10) + '...',
          status: error.response?.status,
        });
      }
      throw error;
    }
  }

  /**
   * Convert Polymarket activity to DetectedTrade
   */
  private activityToDetectedTrade(activity: PolymarketActivity): DetectedTrade {
    return {
      id: activity.id || activity.transactionHash,
      traderAddress: activity.proxyWallet.toLowerCase(),
      transactionHash: activity.transactionHash,
      marketId: activity.conditionId,
      outcomeId: activity.asset,
      outcomeName: activity.outcome,
      marketTitle: activity.title,
      marketSlug: activity.slug,
      side: activity.side as 'BUY' | 'SELL',
      price: activity.price,
      size: activity.size,
      usdcSize: activity.usdcSize,
      timestamp: new Date(activity.timestamp * 1000),
    };
  }

  /**
   * Check if a trade is too old to process
   */
  private isTradeTooOld(timestamp: number): boolean {
    const maxAgeMs = this.config.maxAgeHours * 60 * 60 * 1000;
    const tradeAgeMs = Date.now() - timestamp * 1000;
    return tradeAgeMs > maxAgeMs;
  }

  /**
   * Poll a single trader for new trades
   */
  private async pollTrader(address: string, config: TraderCopyConfig): Promise<void> {
    if (!config.isActive) {
      return;
    }

    try {
      // Fetch trades and positions in parallel
      const [activities, positions] = await Promise.all([
        this.fetchTraderTrades(address),
        this.fetchTraderPositions(address),
      ]);

      // Update positions
      this.traderPositions.set(address, positions);
      this.emit('traderPositionsUpdated', address, positions);

      // Get known trades for this trader
      const knownTradeIds = this.knownTrades.get(address) || new Set();

      // Check if this is the first poll
      const isFirstPoll = this.firstPoll.has(address);
      if (isFirstPoll) {
        // On first poll, mark all existing trades as known (don't copy historical)
        for (const activity of activities) {
          knownTradeIds.add(activity.transactionHash);
        }
        this.knownTrades.set(address, knownTradeIds);
        this.firstPoll.delete(address);

        log.info('First poll completed - marked historical trades', {
          address: address.slice(0, 10) + '...',
          historicalTrades: activities.length,
        });
        return;
      }

      // Process new trades
      for (const activity of activities) {
        // Skip if already known
        if (knownTradeIds.has(activity.transactionHash)) {
          continue;
        }

        // Skip if too old
        if (this.isTradeTooOld(activity.timestamp)) {
          continue;
        }

        // Skip non-TRADE activities
        if (activity.type !== 'TRADE') {
          continue;
        }

        // Mark as known
        knownTradeIds.add(activity.transactionHash);
        this.knownTrades.set(address, knownTradeIds);

        // Convert to detected trade
        const detectedTrade = this.activityToDetectedTrade(activity);

        log.info('New trade detected', {
          trader: address.slice(0, 10) + '...',
          side: detectedTrade.side,
          market: detectedTrade.marketTitle?.slice(0, 40) || detectedTrade.marketId,
          outcome: detectedTrade.outcomeName,
          price: detectedTrade.price.toFixed(4),
          usdcSize: detectedTrade.usdcSize.toFixed(2),
        });

        // Update metrics
        metrics.copyTradingTradesDetected.labels(address, detectedTrade.side).inc();

        // Emit event
        this.emit('tradeDetected', detectedTrade);
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)), address);
    }
  }

  /**
   * Run a single poll cycle for all traders
   */
  private async pollAllTraders(): Promise<void> {
    const traders = Array.from(this.trackedTraders.entries());

    // Poll traders sequentially to avoid rate limiting
    for (const [address, config] of traders) {
      try {
        await this.pollTrader(address, config);
      } catch (error) {
        // Individual trader errors are handled in pollTrader
        // Continue with other traders
      }

      // Small delay between traders to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Monitor already running');
      return;
    }

    this.isRunning = true;

    log.info('Starting trader monitor', {
      trackedTraders: this.trackedTraders.size,
      pollIntervalMs: this.config.pollIntervalMs,
    });

    // Initial poll
    await this.pollAllTraders();

    // Start polling interval
    this.pollInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.pollAllTraders();
      }
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    log.info('Trader monitor stopped');
  }

  /**
   * Check if running
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }

  /**
   * Force an immediate poll (manual trigger)
   */
  async pollNow(): Promise<void> {
    await this.pollAllTraders();
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isRunning: boolean;
    trackedTraders: number;
    activeTraders: number;
    pollIntervalMs: number;
  } {
    const traders = Array.from(this.trackedTraders.values());
    return {
      isRunning: this.isRunning,
      trackedTraders: traders.length,
      activeTraders: traders.filter((t) => t.isActive).length,
      pollIntervalMs: this.config.pollIntervalMs,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TraderMonitorConfig>): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...config };

    if (wasRunning) {
      this.start();
    }

    log.info('Monitor config updated', this.config);
  }

  /**
   * Clear all tracked data (for testing)
   */
  clear(): void {
    this.stop();
    this.trackedTraders.clear();
    this.knownTrades.clear();
    this.traderPositions.clear();
    this.firstPoll.clear();
    metrics.copyTradingTrackedTraders.set(0);
    metrics.copyTradingActiveTraders.set(0);
    log.info('Trader monitor cleared');
  }
}

// Export singleton instance
export const traderMonitor = new TraderMonitor();
