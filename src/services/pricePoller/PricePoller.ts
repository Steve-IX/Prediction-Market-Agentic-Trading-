import { EventEmitter } from 'events';
import type { PolymarketClient } from '../../clients/polymarket/PolymarketClient.js';
import type { KalshiClient } from '../../clients/kalshi/KalshiClient.js';
import type { NormalizedMarket } from '../../clients/shared/interfaces.js';
import { PLATFORMS } from '../../config/constants.js';
import { logger, type Logger } from '../../utils/logger.js';

export interface PricePollerConfig {
  intervalMs: number;
  maxMarkets: number;
  batchSize: number;
}

const DEFAULT_CONFIG: PricePollerConfig = {
  intervalMs: 30000,
  maxMarkets: 10000,
  batchSize: 500,
};

export interface PolledPriceUpdate {
  marketId: string;
  outcomeId: string;
  price: number;
  timestamp: Date;
}

/**
 * Polls REST APIs for fresh market prices (supplements WebSocket data).
 */
export class PricePoller extends EventEmitter {
  private log: Logger;
  private config: PricePollerConfig;
  private polymarketClient: PolymarketClient | null;
  private kalshiClient: KalshiClient | null;
  private isRunning = false;
  private isPolling = false;
  private intervalHandle: NodeJS.Timeout | null = null;
  private trackedMarkets: Map<string, NormalizedMarket> = new Map();
  private pollCount = 0;
  private errorCount = 0;
  private lastPollUpdates = 0;

  constructor(
    clients: { polymarket?: PolymarketClient; kalshi?: KalshiClient },
    config?: Partial<PricePollerConfig>
  ) {
    super();
    this.log = logger('PricePoller');
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.polymarketClient = clients.polymarket ?? null;
    this.kalshiClient = clients.kalshi ?? null;
  }

  start(): void {
    if (this.isRunning) {
      this.log.warn('Price poller already running');
      return;
    }

    this.isRunning = true;
    void this.poll();
    this.intervalHandle = setInterval(() => {
      void this.poll();
    }, this.config.intervalMs);

    this.log.info('Price poller started', {
      intervalMs: this.config.intervalMs,
      maxMarkets: this.config.maxMarkets,
      hasPolymarket: !!this.polymarketClient,
      hasKalshi: !!this.kalshiClient,
    });
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.log.info('Price poller stopped', {
      totalPolls: this.pollCount,
      errors: this.errorCount,
      trackedMarkets: this.trackedMarkets.size,
    });
  }

  updateTrackedMarkets(markets: NormalizedMarket[]): void {
    this.trackedMarkets.clear();

    const activeMarkets = markets
      .filter((m) => m.isActive && m.outcomes.length === 2)
      .slice(0, this.config.maxMarkets);

    for (const market of activeMarkets) {
      this.trackedMarkets.set(`${market.platform}:${market.externalId}`, market);
    }

    this.log.debug('Tracked markets updated', {
      nowTracking: this.trackedMarkets.size,
    });
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;

    this.isPolling = true;
    this.pollCount++;
    const timestamp = new Date();
    let updatesEmitted = 0;

    try {
      if (this.polymarketClient?.isConnected()) {
        updatesEmitted += await this.pollPolymarket(timestamp);
      }

      if (this.kalshiClient?.isConnected()) {
        updatesEmitted += await this.pollKalshi(timestamp);
      }

      if (updatesEmitted === 0 && this.trackedMarkets.size > 0) {
        updatesEmitted += this.emitFromCachedMarkets(timestamp);
      }

      this.lastPollUpdates = updatesEmitted;

      if (this.pollCount % 6 === 0) {
        this.log.info('Price poller summary', {
          pollCount: this.pollCount,
          trackedMarkets: this.trackedMarkets.size,
          lastPollUpdates: updatesEmitted,
          errors: this.errorCount,
        });
      }
    } catch (error) {
      this.errorCount++;
      this.log.error('Poll failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isPolling = false;
    }
  }

  private async pollPolymarket(timestamp: Date): Promise<number> {
    const client = this.polymarketClient!;
    const markets = await client.getMarkets({
      activeOnly: true,
      limit: Math.min(this.config.maxMarkets, this.config.batchSize),
    });

    let count = 0;
    for (const market of markets) {
      if (!market.isActive || market.outcomes.length !== 2) continue;

      this.trackedMarkets.set(`${PLATFORMS.POLYMARKET}:${market.externalId}`, market);

      const yesOutcome = market.outcomes.find((o) => o.type === 'yes');
      if (yesOutcome?.bestAsk && yesOutcome.bestAsk > 0 && yesOutcome.bestAsk < 1) {
        this.emit('priceUpdate', {
          marketId: market.externalId,
          outcomeId: yesOutcome.externalId,
          price: yesOutcome.bestAsk,
          timestamp,
        } satisfies PolledPriceUpdate);
        count++;
      }
    }
    return count;
  }

  private async pollKalshi(timestamp: Date): Promise<number> {
    const client = this.kalshiClient!;
    const markets = await client.getMarkets({
      activeOnly: true,
      limit: Math.min(this.config.maxMarkets, this.config.batchSize),
    });

    let count = 0;
    for (const market of markets) {
      if (!market.isActive || market.outcomes.length !== 2) continue;

      this.trackedMarkets.set(`${PLATFORMS.KALSHI}:${market.externalId}`, market);

      const yesOutcome = market.outcomes.find((o) => o.type === 'yes');
      if (yesOutcome?.bestAsk && yesOutcome.bestAsk > 0 && yesOutcome.bestAsk < 1) {
        this.emit('priceUpdate', {
          marketId: market.externalId,
          outcomeId: yesOutcome.externalId,
          price: yesOutcome.bestAsk,
          timestamp,
        } satisfies PolledPriceUpdate);
        count++;
      }
    }
    return count;
  }

  private emitFromCachedMarkets(timestamp: Date): number {
    let count = 0;
    for (const market of this.trackedMarkets.values()) {
      for (const outcome of market.outcomes) {
        const price = outcome.bestAsk;
        if (price && price > 0 && price < 1) {
          this.emit('priceUpdate', {
            marketId: market.externalId,
            outcomeId: outcome.externalId,
            price,
            timestamp,
          } satisfies PolledPriceUpdate);
          count++;
        }
      }
    }
    return count;
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      pollCount: this.pollCount,
      trackedMarkets: this.trackedMarkets.size,
      lastPollUpdates: this.lastPollUpdates,
      errorCount: this.errorCount,
    };
  }
}
