import { EventEmitter } from 'events';
import type { Platform } from '../../config/constants.js';
import { PLATFORMS } from '../../config/constants.js';
import type { NormalizedMarket } from '../../clients/shared/interfaces.js';
import { PolymarketClient } from '../../clients/polymarket/PolymarketClient.js';
import { logger, type Logger } from '../../utils/logger.js';

/**
 * Price update from polling
 */
export interface PolledPriceUpdate {
  platform: Platform;
  marketId: string;
  outcomeId: string;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  timestamp: Date;
}

/**
 * Price Poller Configuration
 */
export interface PricePollerConfig {
  pollIntervalMs: number; // How often to poll
  batchSize: number; // How many markets to fetch per batch
  maxMarkets: number; // Maximum markets to track
}

const DEFAULT_CONFIG: PricePollerConfig = {
  pollIntervalMs: 10000, // Poll every 10 seconds
  batchSize: 50, // Fetch 50 markets at a time
  maxMarkets: 200, // Track up to 200 markets
};

/**
 * Price Poller Service
 * 
 * Polls REST API for market prices to supplement WebSocket data.
 * WebSocket only sends updates when there's activity, so many markets
 * won't have price data without polling.
 */
export class PricePoller extends EventEmitter {
  private log: Logger;
  private config: PricePollerConfig;
  private polyClient: PolymarketClient;
  
  private trackedMarkets: Map<string, NormalizedMarket> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private lastPollTime: Date | null = null;
  private pollCount = 0;
  private errorCount = 0;

  constructor(polyClient: PolymarketClient, config?: Partial<PricePollerConfig>) {
    super();
    this.log = logger('PricePoller');
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.polyClient = polyClient;
  }

  /**
   * Start polling for prices
   */
  start(markets: NormalizedMarket[]): void {
    if (this.pollInterval) {
      this.log.warn('Price poller already running');
      return;
    }

    // Track markets (up to maxMarkets)
    this.trackedMarkets.clear();
    for (const market of markets.slice(0, this.config.maxMarkets)) {
      if (market.isActive && market.outcomes.length === 2) {
        this.trackedMarkets.set(market.externalId, market);
      }
    }

    this.log.info('Starting price poller', {
      trackedMarkets: this.trackedMarkets.size,
      pollIntervalMs: this.config.pollIntervalMs,
    });

    // Do initial poll immediately
    this.poll();

    // Set up interval
    this.pollInterval = setInterval(() => this.poll(), this.config.pollIntervalMs);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isPolling = false;
    this.log.info('Price poller stopped', {
      totalPolls: this.pollCount,
      errors: this.errorCount,
    });
  }

  /**
   * Get polling statistics
   */
  getStats(): {
    isPolling: boolean;
    trackedMarkets: number;
    pollCount: number;
    errorCount: number;
    lastPollTime: Date | null;
  } {
    return {
      isPolling: this.isPolling,
      trackedMarkets: this.trackedMarkets.size,
      pollCount: this.pollCount,
      errorCount: this.errorCount,
      lastPollTime: this.lastPollTime,
    };
  }

  /**
   * Poll for prices
   */
  private async poll(): Promise<void> {
    if (this.isPolling) {
      this.log.debug('Skipping poll - previous poll still running');
      return;
    }

    this.isPolling = true;
    this.pollCount++;
    const startTime = Date.now();

    try {
      // Get fresh market data from API
      const markets = await this.polyClient.getMarkets({ 
        activeOnly: true, 
        limit: this.config.maxMarkets 
      });

      let updatesEmitted = 0;
      const now = new Date();

      for (const market of markets) {
        if (!market.isActive || market.outcomes.length !== 2) continue;

        // Update tracked market with fresh data
        this.trackedMarkets.set(market.externalId, market);

        // IMPORTANT: Only emit price update for YES outcome to avoid YES/NO price confusion
        // The YES outcome is what we trade - NO is just 1-YES
        const yesOutcome = market.outcomes.find(o => o.type === 'yes');
        if (yesOutcome && yesOutcome.bestBid !== undefined && yesOutcome.bestAsk !== undefined) {
          const update: PolledPriceUpdate = {
            platform: PLATFORMS.POLYMARKET,
            marketId: market.externalId,
            outcomeId: yesOutcome.externalId,
            bestBid: yesOutcome.bestBid,
            bestAsk: yesOutcome.bestAsk,
            midPrice: (yesOutcome.bestBid + yesOutcome.bestAsk) / 2,
            timestamp: now,
          };

          this.emit('priceUpdate', update);
          updatesEmitted++;
        }
      }

      this.lastPollTime = now;
      const durationMs = Date.now() - startTime;

      // Periodic summary log only (every 3 minutes = 18 * 10s)
      if (this.pollCount % 18 === 0) {
        this.log.info('Price poller summary', {
          pollCount: this.pollCount,
          trackedMarkets: this.trackedMarkets.size,
          lastPollUpdates: updatesEmitted,
          durationMs,
        });
      }

    } catch (error) {
      this.errorCount++;
      this.log.error('Poll failed', {
        error: error instanceof Error ? error.message : String(error),
        pollCount: this.pollCount,
        errorCount: this.errorCount,
      });
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Get all tracked markets
   */
  getTrackedMarkets(): NormalizedMarket[] {
    return Array.from(this.trackedMarkets.values());
  }

  /**
   * Check if a market is being tracked
   */
  isTracking(marketId: string): boolean {
    return this.trackedMarkets.has(marketId);
  }
}
