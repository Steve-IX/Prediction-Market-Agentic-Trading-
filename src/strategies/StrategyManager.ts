import { EventEmitter } from 'events';
import type { NormalizedMarket, OrderBook } from '../clients/shared/interfaces.js';
import { PriceHistoryTracker, type PriceStats } from '../services/priceHistory/PriceHistoryTracker.js';
import { MomentumStrategy, type TradingSignal } from './momentum/MomentumStrategy.js';
import { MeanReversionStrategy } from './momentum/MeanReversionStrategy.js';
import { OrderbookImbalanceStrategy } from './momentum/OrderbookImbalanceStrategy.js';
import { logger, type Logger } from '../utils/logger.js';

/**
 * Strategy Manager Configuration
 */
export interface StrategyManagerConfig {
  enableMomentum: boolean;
  enableMeanReversion: boolean;
  enableOrderbookImbalance: boolean;
  maxConcurrentSignals: number;
  signalCooldownMs: number;
  // Strategy-specific configs from environment variables
  momentumConfig?: {
    minMomentum?: number;
    minChangePercent?: number;
    maxPositionSize?: number;
    minPositionSize?: number;
  };
  meanReversionConfig?: {
    minDeviation?: number;
    maxDeviation?: number;
    maxPositionSize?: number;
    minPositionSize?: number;
  };
  orderbookImbalanceConfig?: {
    minImbalanceRatio?: number;
    maxPositionSize?: number;
    minPositionSize?: number;
  };
}

const DEFAULT_CONFIG: StrategyManagerConfig = {
  enableMomentum: true,
  enableMeanReversion: true,
  enableOrderbookImbalance: true,
  maxConcurrentSignals: 3,
  signalCooldownMs: 30000, // 30 seconds between signals on same market
};

/**
 * Strategy Manager
 * Coordinates multiple trading strategies and generates unified signals
 */
export class StrategyManager extends EventEmitter {
  private log: Logger;
  private config: StrategyManagerConfig;

  // Price tracking
  private priceTracker: PriceHistoryTracker;

  // Strategies
  private momentumStrategy: MomentumStrategy;
  private meanReversionStrategy: MeanReversionStrategy;
  private orderbookImbalanceStrategy: OrderbookImbalanceStrategy;

  // Signal management
  private signalCooldowns: Map<string, Date> = new Map();

  constructor(config?: Partial<StrategyManagerConfig>) {
    super();
    this.log = logger('StrategyManager');
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.priceTracker = new PriceHistoryTracker(1000, 1000);
    this.momentumStrategy = new MomentumStrategy(this.config.momentumConfig);
    this.meanReversionStrategy = new MeanReversionStrategy(this.config.meanReversionConfig);
    this.orderbookImbalanceStrategy = new OrderbookImbalanceStrategy(this.config.orderbookImbalanceConfig);

    // Forward signals from strategies
    this.setupEventForwarding();
  }

  /**
   * Process a price update
   */
  processPriceUpdate(
    marketId: string,
    price: number,
    volume?: number,
    bidSize?: number,
    askSize?: number
  ): void {
    this.priceTracker.recordPrice(marketId, price, volume, bidSize, askSize);
  }

  /**
   * Analyze a market for trading signals
   */
  analyzeMarket(market: NormalizedMarket, orderbook?: OrderBook): TradingSignal[] {
    const signals: TradingSignal[] = [];

    // Check cooldown
    if (this.isOnCooldown(market.externalId)) {
      return signals;
    }

    // Get price stats
    const stats = this.priceTracker.getStats(market.externalId, 60);

    // Run momentum strategy
    if (this.config.enableMomentum && stats) {
      const signal = this.momentumStrategy.analyze(market, stats);
      if (signal) {
        signals.push(signal);
      }
    }

    // Run mean reversion strategy
    if (this.config.enableMeanReversion && stats) {
      const signal = this.meanReversionStrategy.analyze(market, stats);
      if (signal) {
        signals.push(signal);
      }
    }

    // Run orderbook imbalance strategy
    if (this.config.enableOrderbookImbalance && orderbook) {
      const signal = this.orderbookImbalanceStrategy.analyze(market, orderbook);
      if (signal) {
        signals.push(signal);
      }
    }

    // Filter and prioritize signals
    const filteredSignals = this.filterSignals(signals);

    // Set cooldown if we generated signals
    if (filteredSignals.length > 0) {
      this.setCooldown(market.externalId);
    }

    return filteredSignals;
  }

  /**
   * Scan multiple markets
   */
  scanMarkets(markets: NormalizedMarket[], orderbooks?: Map<string, OrderBook>): TradingSignal[] {
    const allSignals: TradingSignal[] = [];

    for (const market of markets) {
      const orderbook = orderbooks?.get(market.externalId);
      const signals = this.analyzeMarket(market, orderbook);
      allSignals.push(...signals);
    }

    // Sort by confidence and limit
    allSignals.sort((a, b) => b.confidence - a.confidence);
    return allSignals.slice(0, this.config.maxConcurrentSignals);
  }

  /**
   * Get the best signal from current pending signals
   */
  getBestSignal(): TradingSignal | null {
    // Clean expired signals
    this.cleanExpiredSignals();

    // Get all active signals from strategies
    const allSignals = [
      ...this.momentumStrategy.getActiveSignals(),
      ...this.meanReversionStrategy.getActiveSignals(),
      ...this.orderbookImbalanceStrategy.getActiveSignals(),
    ];

    if (allSignals.length === 0) return null;

    // Return highest confidence signal
    return allSignals.reduce((best, signal) =>
      signal.confidence > best.confidence ? signal : best
    );
  }

  /**
   * Mark a signal as executed (removes from active)
   */
  markSignalExecuted(signal: TradingSignal): void {
    this.momentumStrategy.clearSignal(signal.marketId);
    this.meanReversionStrategy.clearSignal(signal.marketId);
    this.orderbookImbalanceStrategy.clearSignal(signal.marketId);
    this.setCooldown(signal.marketId);
  }

  /**
   * Get price statistics for a market
   */
  getPriceStats(marketId: string): PriceStats | null {
    return this.priceTracker.getStats(marketId, 60);
  }

  /**
   * Get all active signals
   */
  getAllActiveSignals(): TradingSignal[] {
    return [
      ...this.momentumStrategy.getActiveSignals(),
      ...this.meanReversionStrategy.getActiveSignals(),
      ...this.orderbookImbalanceStrategy.getActiveSignals(),
    ];
  }

  /**
   * Get tracked market count
   */
  getTrackedMarketsCount(): number {
    return this.priceTracker.getTrackedMarkets().length;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StrategyManagerConfig>): void {
    this.config = { ...this.config, ...config };
    this.log.info('Strategy manager config updated', config);
  }

  // ============================================
  // Private Methods
  // ============================================

  private setupEventForwarding(): void {
    // Forward significant price moves
    this.priceTracker.on('significantMove', (data) => {
      this.emit('significantMove', data);
      this.log.debug('Significant price move detected', data);
    });

    // Forward strategy signals
    this.momentumStrategy.on('signal', (signal) => {
      this.emit('signal', signal);
    });

    this.meanReversionStrategy.on('signal', (signal) => {
      this.emit('signal', signal);
    });

    this.orderbookImbalanceStrategy.on('signal', (signal) => {
      this.emit('signal', signal);
    });
  }

  private filterSignals(signals: TradingSignal[]): TradingSignal[] {
    // Remove duplicates (same market, same side)
    const seen = new Set<string>();
    return signals.filter((signal) => {
      const key = `${signal.marketId}:${signal.side}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private isOnCooldown(marketId: string): boolean {
    const cooldownUntil = this.signalCooldowns.get(marketId);
    if (!cooldownUntil) return false;
    return new Date() < cooldownUntil;
  }

  private setCooldown(marketId: string): void {
    this.signalCooldowns.set(
      marketId,
      new Date(Date.now() + this.config.signalCooldownMs)
    );
  }

  private cleanExpiredSignals(): void {
    this.momentumStrategy.clearExpiredSignals();
    this.meanReversionStrategy.clearExpiredSignals();
    this.orderbookImbalanceStrategy.clearExpiredSignals();

    // Clean expired cooldowns
    const now = new Date();
    for (const [marketId, until] of this.signalCooldowns) {
      if (until < now) {
        this.signalCooldowns.delete(marketId);
      }
    }
  }
}
