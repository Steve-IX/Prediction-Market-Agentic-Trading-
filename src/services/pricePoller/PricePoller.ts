import { EventEmitter } from 'events';
import type { NormalizedMarket } from '../../clients/shared/interfaces.js';
import { logger, type Logger } from '../../utils/logger.js';

/**
 * Price Poller Configuration
 */
export interface PricePollerConfig {
  intervalMs: number; // Poll interval in milliseconds
  maxMarkets: number; // Maximum number of markets to track
}

const DEFAULT_CONFIG: PricePollerConfig = {
  intervalMs: 30000, // 30 seconds (poll all markets less frequently)
  maxMarkets: 10000, // Poll ALL active markets (increased from 200)
};

/**
 * Price update from polling
 */
export interface PolledPriceUpdate {
  marketId: string;
  outcomeId: string;
  price: number;
  timestamp: Date;
}

/**
 * Price Poller
 * Actively polls REST API for market prices to populate price history
 *
 * Why this is needed:
 * WebSockets only send updates when there's trading activity.
 * Most markets are quiet, so we need to actively fetch prices via REST API.
 */
export class PricePoller extends EventEmitter {
  private log: Logger;
  private config: PricePollerConfig;
  private isRunning: boolean = false;
  private intervalHandle: NodeJS.Timeout | null = null;
  private trackedMarkets: Map<string, NormalizedMarket> = new Map();
  private pollCount: number = 0;
  private lastPollUpdates: number = 0;

  constructor(config?: Partial<PricePollerConfig>) {
    super();
    this.log = logger('PricePoller');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start polling
   */
  start(): void {
    if (this.isRunning) {
      this.log.warn('Price poller already running');
      return;
    }

    this.isRunning = true;
    this.intervalHandle = setInterval(() => {
      this.poll().catch((error) => {
        this.log.error('Error during poll', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.config.intervalMs);

    this.log.info('Price poller started', {
      intervalMs: this.config.intervalMs,
      maxMarkets: this.config.maxMarkets,
    });
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.log.info('Price poller stopped', {
      totalPolls: this.pollCount,
      trackedMarkets: this.trackedMarkets.size,
    });
  }

  /**
   * Update tracked markets
   * Now tracks ALL active markets (not just top N by volume)
   */
  updateTrackedMarkets(markets: NormalizedMarket[]): void {
    // Clear existing
    this.trackedMarkets.clear();

    // Track ALL active binary markets (prediction strategies work on all markets)
    const activeMarkets = markets
      .filter((m) => m.isActive && m.outcomes.length === 2)
      .slice(0, this.config.maxMarkets); // Limit only if exceeds maxMarkets

    // Store in map
    for (const market of activeMarkets) {
      this.trackedMarkets.set(market.externalId, market);
    }

    this.log.info('Tracked markets updated', {
      totalAvailable: markets.length,
      activeBinaryMarkets: activeMarkets.length,
      nowTracking: this.trackedMarkets.size,
      note: 'Tracking all active markets for prediction strategies',
    });
  }

  /**
   * Poll all tracked markets for current prices
   */
  private async poll(): Promise<void> {
    if (this.trackedMarkets.size === 0) {
      return;
    }

    this.pollCount++;
    const updates: PolledPriceUpdate[] = [];
    const timestamp = new Date();

    // Emit price updates for each tracked market
    for (const [marketId, market] of this.trackedMarkets) {
      // For each outcome (YES/NO), emit price update
      for (const outcome of market.outcomes) {
        const price = outcome.bestAsk;
        if (price && price > 0 && price < 1) {
          const update: PolledPriceUpdate = {
            marketId,
            outcomeId: outcome.externalId,
            price,
            timestamp,
          };
          updates.push(update);

          // Emit individual price update
          this.emit('priceUpdate', update);
        }
      }
    }

    this.lastPollUpdates = updates.length;

    // Log summary periodically (every 6th poll = ~1 minute)
    if (this.pollCount % 6 === 0) {
      this.log.info('Price poller summary', {
        pollCount: this.pollCount,
        trackedMarkets: this.trackedMarkets.size,
        lastPollUpdates: this.lastPollUpdates,
      });
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      pollCount: this.pollCount,
      trackedMarkets: this.trackedMarkets.size,
      lastPollUpdates: this.lastPollUpdates,
    };
  }
}
