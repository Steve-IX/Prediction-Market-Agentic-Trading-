import { EventEmitter } from 'events';
import type { NormalizedMarket, OrderBook } from '../../clients/shared/interfaces.js';
import type { TradingSignal } from './MomentumStrategy.js';
import { logger, type Logger } from '../../utils/logger.js';
import { OUTCOMES } from '../../config/constants.js';

/**
 * Orderbook snapshot for analysis
 */
export interface OrderbookSnapshot {
  marketId: string;
  outcomeId: string;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
  timestamp: Date;
}

/**
 * Orderbook Imbalance Configuration
 */
export interface OrderbookImbalanceConfig {
  // Imbalance thresholds
  minImbalanceRatio: number; // Min ratio of bid/ask to trigger (e.g., 2.0 = 2x more bids than asks)
  
  // Depth analysis
  depthLevels: number; // How many price levels to analyze
  
  // Position sizing
  maxPositionSize: number;
  minPositionSize: number;
  
  // Risk
  takeProfitPercent: number;
  stopLossPercent: number;
  
  // Filters
  minTotalVolume: number; // Minimum combined orderbook volume
  maxSpreadPercent: number; // Maximum bid-ask spread
}

// IMPORTANT: Prediction markets have lower volume - adjust thresholds
const DEFAULT_CONFIG: OrderbookImbalanceConfig = {
  minImbalanceRatio: 1.5, // Lowered from 2.0 - 1.5x imbalance is significant in prediction markets
  depthLevels: 5,
  maxPositionSize: 100,
  minPositionSize: 10,
  takeProfitPercent: 1.5, // Lowered for faster exits
  stopLossPercent: 2,
  minTotalVolume: 10, // Lowered significantly from 100 - prediction markets have less volume
  maxSpreadPercent: 10, // Increased from 5 - prediction markets can have wider spreads
};

/**
 * Orderbook Imbalance Strategy
 * Trades based on orderbook bid/ask imbalance
 * 
 * Logic:
 * - BUY when: significantly more bid volume than ask volume (buying pressure)
 * - SELL when: significantly more ask volume than bid volume (selling pressure)
 * 
 * This strategy anticipates short-term price moves based on order flow
 */
export class OrderbookImbalanceStrategy extends EventEmitter {
  private log: Logger;
  private config: OrderbookImbalanceConfig;
  private activeSignals: Map<string, TradingSignal> = new Map();
  private lastImbalance: Map<string, { ratio: number; timestamp: Date }> = new Map();

  constructor(config?: Partial<OrderbookImbalanceConfig>) {
    super();
    this.log = logger('OrderbookImbalanceStrategy');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze orderbook for imbalance signals
   */
  analyze(market: NormalizedMarket, orderbook: OrderBook): TradingSignal | null {
    if (!market.isActive) return null;

    // Get YES outcome
    const yesOutcome = market.outcomes.find((o) => o.type === OUTCOMES.YES);
    if (!yesOutcome) return null;

    // Skip if already have active signal
    if (this.activeSignals.has(market.externalId)) {
      return null;
    }

    // Calculate orderbook metrics
    const metrics = this.calculateOrderbookMetrics(orderbook);
    if (!metrics) return null;

    // Check filters
    if (metrics.totalVolume < this.config.minTotalVolume) return null;
    if (metrics.spreadPercent > this.config.maxSpreadPercent) return null;

    // Store imbalance for trend detection
    this.lastImbalance.set(market.externalId, {
      ratio: metrics.imbalanceRatio,
      timestamp: new Date(),
    });

    this.log.debug('Orderbook imbalance check', {
      market: market.title.substring(0, 40),
      imbalanceRatio: metrics.imbalanceRatio.toFixed(2),
      bidVolume: metrics.bidVolume.toFixed(0),
      askVolume: metrics.askVolume.toFixed(0),
      totalVolume: metrics.totalVolume.toFixed(0),
      spreadPercent: metrics.spreadPercent.toFixed(2),
      minRatio: this.config.minImbalanceRatio,
    });

    // Check for buy signal (bid imbalance - buying pressure)
    if (metrics.imbalanceRatio >= this.config.minImbalanceRatio) {
      return this.createSignal(market, yesOutcome, 'BUY', metrics);
    }

    // Check for sell signal (ask imbalance - selling pressure)
    if (metrics.imbalanceRatio <= 1 / this.config.minImbalanceRatio) {
      return this.createSignal(market, yesOutcome, 'SELL', metrics);
    }

    return null;
  }

  /**
   * Calculate orderbook metrics
   */
  private calculateOrderbookMetrics(orderbook: OrderBook): {
    bidVolume: number;
    askVolume: number;
    totalVolume: number;
    imbalanceRatio: number;
    bidDepthUsd: number;
    askDepthUsd: number;
    spreadPercent: number;
    midPrice: number;
    bestBid: number;
    bestAsk: number;
  } | null {
    if (orderbook.bids.length === 0 || orderbook.asks.length === 0) {
      return null;
    }

    // Take top N levels
    const bids = orderbook.bids.slice(0, this.config.depthLevels);
    const asks = orderbook.asks.slice(0, this.config.depthLevels);

    // Calculate volumes
    const bidVolume = bids.reduce((sum, level) => sum + level.size, 0);
    const askVolume = asks.reduce((sum, level) => sum + level.size, 0);
    const totalVolume = bidVolume + askVolume;

    // Calculate depth in USD
    const bidDepthUsd = bids.reduce((sum, level) => sum + level.size * level.price, 0);
    const askDepthUsd = asks.reduce((sum, level) => sum + level.size * level.price, 0);

    // Calculate imbalance ratio (bid/ask)
    const imbalanceRatio = askVolume > 0 ? bidVolume / askVolume : 10;

    // Calculate spread
    const bestBid = bids[0]!.price;
    const bestAsk = asks[0]!.price;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadPercent = ((bestAsk - bestBid) / midPrice) * 100;

    return {
      bidVolume,
      askVolume,
      totalVolume,
      imbalanceRatio,
      bidDepthUsd,
      askDepthUsd,
      spreadPercent,
      midPrice,
      bestBid,
      bestAsk,
    };
  }

  /**
   * Create a trading signal
   */
  private createSignal(
    market: NormalizedMarket,
    outcome: { externalId: string; name: string },
    side: 'BUY' | 'SELL',
    metrics: {
      imbalanceRatio: number;
      bidVolume: number;
      askVolume: number;
      spreadPercent: number;
      bestBid: number;
      bestAsk: number;
    }
  ): TradingSignal {
    // Calculate confidence based on imbalance strength
    const confidence = this.calculateConfidence(metrics.imbalanceRatio, metrics.spreadPercent);
    const baseSize = this.config.minPositionSize +
      (this.config.maxPositionSize - this.config.minPositionSize) * confidence;

    const price = side === 'BUY' ? metrics.bestAsk : metrics.bestBid;
    const size = Math.min(baseSize / price, this.config.maxPositionSize / price);

    const signal: TradingSignal = {
      id: `obimb:${market.externalId}:${side}:${Date.now()}`,
      marketId: market.externalId,
      market,
      outcomeId: outcome.externalId,
      outcomeName: outcome.name,
      side,
      price,
      size,
      confidence,
      reason: this.getSignalReason(side, metrics),
      strategy: 'orderbook_imbalance',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 15000), // 15 second validity (short-term)
    };

    this.activeSignals.set(market.externalId, signal);
    this.emit('signal', signal);

    this.log.info('Orderbook imbalance signal generated', {
      market: market.title,
      side,
      price,
      confidence: confidence.toFixed(2),
      imbalanceRatio: metrics.imbalanceRatio.toFixed(2),
      bidVolume: metrics.bidVolume.toFixed(0),
      askVolume: metrics.askVolume.toFixed(0),
    });

    return signal;
  }

  /**
   * Calculate confidence
   */
  private calculateConfidence(imbalanceRatio: number, spreadPercent: number): number {
    let confidence = 0.5;

    // Higher imbalance = higher confidence
    const effectiveRatio = imbalanceRatio > 1 ? imbalanceRatio : 1 / imbalanceRatio;
    if (effectiveRatio >= 3) confidence += 0.2;
    else if (effectiveRatio >= 2.5) confidence += 0.15;
    else if (effectiveRatio >= 2) confidence += 0.1;

    // Tighter spread = higher confidence
    if (spreadPercent < 1) confidence += 0.15;
    else if (spreadPercent < 2) confidence += 0.1;
    else if (spreadPercent < 3) confidence += 0.05;

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Get signal reason
   */
  private getSignalReason(
    side: 'BUY' | 'SELL',
    metrics: { imbalanceRatio: number; bidVolume: number; askVolume: number }
  ): string {
    if (side === 'BUY') {
      return `Bid imbalance ${metrics.imbalanceRatio.toFixed(1)}x (${metrics.bidVolume.toFixed(0)} vs ${metrics.askVolume.toFixed(0)} shares) - buying pressure`;
    } else {
      return `Ask imbalance ${(1 / metrics.imbalanceRatio).toFixed(1)}x (${metrics.askVolume.toFixed(0)} vs ${metrics.bidVolume.toFixed(0)} shares) - selling pressure`;
    }
  }

  /**
   * Clear expired signals
   */
  clearExpiredSignals(): void {
    const now = new Date();
    for (const [marketId, signal] of this.activeSignals) {
      if (signal.expiresAt < now) {
        this.activeSignals.delete(marketId);
      }
    }
  }

  /**
   * Get active signals
   */
  getActiveSignals(): TradingSignal[] {
    return Array.from(this.activeSignals.values());
  }

  /**
   * Clear signal for market
   */
  clearSignal(marketId: string): void {
    this.activeSignals.delete(marketId);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OrderbookImbalanceConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
