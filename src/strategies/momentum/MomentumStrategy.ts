import { EventEmitter } from 'events';
import type { NormalizedMarket } from '../../clients/shared/interfaces.js';
import type { PriceStats } from '../../services/priceHistory/PriceHistoryTracker.js';
import { logger, type Logger } from '../../utils/logger.js';
import { OUTCOMES } from '../../config/constants.js';

/**
 * Trading signal
 */
export interface TradingSignal {
  id: string;
  marketId: string;
  market: NormalizedMarket;
  outcomeId: string;
  outcomeName: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  confidence: number; // 0-1
  reason: string;
  strategy: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Momentum Strategy Configuration
 */
export interface MomentumConfig {
  // Momentum thresholds
  minMomentum: number; // Minimum momentum to trigger (0-1)
  minChangePercent: number; // Minimum price change %
  
  // RSI settings
  rsiOverbought: number; // Don't buy above this
  rsiOversold: number; // Don't sell below this
  
  // Position sizing
  maxPositionSize: number; // Maximum position in USDC
  minPositionSize: number; // Minimum position in USDC
  
  // Risk management  
  takeProfitPercent: number; // Take profit at X%
  stopLossPercent: number; // Stop loss at X%
  
  // Filters
  minVolume: number; // Minimum volume in last hour
  minLiquidity: number; // Minimum orderbook depth
}

const DEFAULT_CONFIG: MomentumConfig = {
  minMomentum: 0.4,
  minChangePercent: 2,
  rsiOverbought: 70,
  rsiOversold: 30,
  maxPositionSize: 100,
  minPositionSize: 10,
  takeProfitPercent: 5,
  stopLossPercent: 3,
  minVolume: 100,
  minLiquidity: 50,
};

/**
 * Momentum Strategy
 * Trades in the direction of price momentum
 * 
 * Logic:
 * - BUY when: momentum > threshold, trend is up, RSI not overbought
 * - SELL when: momentum < -threshold, trend is down, RSI not oversold
 */
export class MomentumStrategy extends EventEmitter {
  private log: Logger;
  private config: MomentumConfig;
  private activeSignals: Map<string, TradingSignal> = new Map();

  constructor(config?: Partial<MomentumConfig>) {
    super();
    this.log = logger('MomentumStrategy');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a market and generate signals
   */
  analyze(market: NormalizedMarket, stats: PriceStats): TradingSignal | null {
    if (!market.isActive) return null;

    // Get the YES outcome (we trade YES tokens)
    const yesOutcome = market.outcomes.find((o) => o.type === OUTCOMES.YES);
    if (!yesOutcome) return null;

    // Skip if already have active signal
    if (this.activeSignals.has(market.externalId)) {
      return null;
    }

    // Check for BUY signal (bullish momentum)
    if (this.shouldBuy(stats)) {
      return this.createSignal(market, yesOutcome, 'BUY', stats);
    }

    // Check for SELL signal (bearish momentum)
    if (this.shouldSell(stats)) {
      return this.createSignal(market, yesOutcome, 'SELL', stats);
    }

    return null;
  }

  /**
   * Check if we should buy (bullish signal)
   */
  private shouldBuy(stats: PriceStats): boolean {
    // Strong upward momentum
    if (stats.momentum < this.config.minMomentum) return false;

    // Price change confirms momentum
    if (stats.changePercent < this.config.minChangePercent) return false;

    // Trend is up
    if (stats.trend !== 'up') return false;

    // RSI not overbought (avoid buying at peak)
    if (stats.rsi > this.config.rsiOverbought) return false;

    // Price above short-term MA (confirmation)
    if (stats.current < stats.sma5) return false;

    // Volume confirms move (optional)
    if (stats.volumeSpike) {
      this.log.debug('Volume spike detected - stronger signal');
    }

    return true;
  }

  /**
   * Check if we should sell (bearish signal)
   */
  private shouldSell(stats: PriceStats): boolean {
    // Strong downward momentum
    if (stats.momentum > -this.config.minMomentum) return false;

    // Price change confirms momentum
    if (stats.changePercent > -this.config.minChangePercent) return false;

    // Trend is down
    if (stats.trend !== 'down') return false;

    // RSI not oversold (avoid selling at bottom)
    if (stats.rsi < this.config.rsiOversold) return false;

    // Price below short-term MA (confirmation)
    if (stats.current > stats.sma5) return false;

    return true;
  }

  /**
   * Create a trading signal
   */
  private createSignal(
    market: NormalizedMarket,
    outcome: { externalId: string; name: string; bestBid: number; bestAsk: number },
    side: 'BUY' | 'SELL',
    stats: PriceStats
  ): TradingSignal {
    // Calculate position size based on confidence
    const confidence = this.calculateConfidence(stats, side);
    const baseSize = this.config.minPositionSize + 
      (this.config.maxPositionSize - this.config.minPositionSize) * confidence;
    
    // Use appropriate price
    const price = side === 'BUY' ? outcome.bestAsk : outcome.bestBid;
    const size = Math.min(baseSize / price, this.config.maxPositionSize / price);

    const signal: TradingSignal = {
      id: `momentum:${market.externalId}:${side}:${Date.now()}`,
      marketId: market.externalId,
      market,
      outcomeId: outcome.externalId,
      outcomeName: outcome.name,
      side,
      price,
      size,
      confidence,
      reason: this.getSignalReason(stats, side),
      strategy: 'momentum',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30000), // 30 second validity
    };

    this.activeSignals.set(market.externalId, signal);
    this.emit('signal', signal);

    this.log.info('Momentum signal generated', {
      market: market.title,
      side,
      price,
      confidence: confidence.toFixed(2),
      momentum: stats.momentum.toFixed(2),
      rsi: stats.rsi.toFixed(0),
    });

    return signal;
  }

  /**
   * Calculate signal confidence (0-1)
   */
  private calculateConfidence(stats: PriceStats, side: 'BUY' | 'SELL'): number {
    let confidence = 0.5; // Base confidence

    // Momentum strength
    const momentumStrength = Math.abs(stats.momentum);
    confidence += momentumStrength * 0.2;

    // RSI confirmation
    if (side === 'BUY' && stats.rsi < 50) {
      confidence += 0.1; // Buying when not overbought
    } else if (side === 'SELL' && stats.rsi > 50) {
      confidence += 0.1; // Selling when not oversold
    }

    // Volume spike bonus
    if (stats.volumeSpike) {
      confidence += 0.1;
    }

    // Price above/below VWAP
    if (side === 'BUY' && stats.current < stats.vwap) {
      confidence += 0.05; // Buying below VWAP
    } else if (side === 'SELL' && stats.current > stats.vwap) {
      confidence += 0.05; // Selling above VWAP
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Get human-readable signal reason
   */
  private getSignalReason(stats: PriceStats, side: 'BUY' | 'SELL'): string {
    const reasons: string[] = [];

    if (side === 'BUY') {
      reasons.push(`Upward momentum (${(stats.momentum * 100).toFixed(0)}%)`);
      reasons.push(`Price up ${stats.changePercent.toFixed(1)}%`);
      if (stats.rsi < 50) reasons.push(`RSI ${stats.rsi.toFixed(0)} (not overbought)`);
    } else {
      reasons.push(`Downward momentum (${(stats.momentum * 100).toFixed(0)}%)`);
      reasons.push(`Price down ${Math.abs(stats.changePercent).toFixed(1)}%`);
      if (stats.rsi > 50) reasons.push(`RSI ${stats.rsi.toFixed(0)} (not oversold)`);
    }

    if (stats.volumeSpike) {
      reasons.push('Volume spike');
    }

    return reasons.join(', ');
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
  updateConfig(config: Partial<MomentumConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
