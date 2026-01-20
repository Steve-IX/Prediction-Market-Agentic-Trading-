import { EventEmitter } from 'events';
import type { NormalizedMarket } from '../../clients/shared/interfaces.js';
import type { PriceStats } from '../../services/priceHistory/PriceHistoryTracker.js';
import type { TradingSignal } from './MomentumStrategy.js';
import { logger, type Logger } from '../../utils/logger.js';
import { OUTCOMES } from '../../config/constants.js';

/**
 * Mean Reversion Strategy Configuration
 */
export interface MeanReversionConfig {
  // Deviation thresholds
  minDeviation: number; // Min % deviation from mean to trigger
  maxDeviation: number; // Max deviation (too extreme, might be news)
  
  // RSI extremes
  rsiOverbought: number; // RSI level for overbought
  rsiOversold: number; // RSI level for oversold
  
  // Position sizing
  maxPositionSize: number;
  minPositionSize: number;
  
  // Risk management
  takeProfitPercent: number;
  stopLossPercent: number;
  
  // Time filters
  minPriceAge: number; // Min data points needed
}

const DEFAULT_CONFIG: MeanReversionConfig = {
  minDeviation: 3, // 3% from VWAP
  maxDeviation: 15, // 15% max (above this might be real news)
  rsiOverbought: 75,
  rsiOversold: 25,
  maxPositionSize: 100,
  minPositionSize: 10,
  takeProfitPercent: 3,
  stopLossPercent: 5,
  minPriceAge: 20,
};

/**
 * Mean Reversion Strategy
 * Fades extreme price moves, betting on reversion to mean
 * 
 * Logic:
 * - BUY when: price significantly below VWAP/SMA, RSI oversold
 * - SELL when: price significantly above VWAP/SMA, RSI overbought
 * 
 * This strategy bets that extreme moves will revert to the mean
 */
export class MeanReversionStrategy extends EventEmitter {
  private log: Logger;
  private config: MeanReversionConfig;
  private activeSignals: Map<string, TradingSignal> = new Map();

  constructor(config?: Partial<MeanReversionConfig>) {
    super();
    this.log = logger('MeanReversionStrategy');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a market for mean reversion opportunities
   */
  analyze(market: NormalizedMarket, stats: PriceStats): TradingSignal | null {
    if (!market.isActive) return null;

    // Get the YES outcome
    const yesOutcome = market.outcomes.find((o) => o.type === OUTCOMES.YES);
    if (!yesOutcome) return null;

    // Skip if already have active signal
    if (this.activeSignals.has(market.externalId)) {
      return null;
    }

    // Calculate deviation from mean (VWAP)
    const deviationFromVwap = ((stats.current - stats.vwap) / stats.vwap) * 100;
    const deviationFromSma = ((stats.current - stats.sma20) / stats.sma20) * 100;

    // Check for oversold condition (price dropped too far)
    if (this.isOversold(stats, deviationFromVwap, deviationFromSma)) {
      return this.createSignal(market, yesOutcome, 'BUY', stats, deviationFromVwap);
    }

    // Check for overbought condition (price rose too far)
    if (this.isOverbought(stats, deviationFromVwap, deviationFromSma)) {
      return this.createSignal(market, yesOutcome, 'SELL', stats, deviationFromVwap);
    }

    return null;
  }

  /**
   * Check if oversold (good to buy)
   */
  private isOversold(stats: PriceStats, deviationVwap: number, deviationSma: number): boolean {
    // Price significantly below mean
    const avgDeviation = (Math.abs(deviationVwap) + Math.abs(deviationSma)) / 2;
    if (deviationVwap > -this.config.minDeviation) return false;
    if (avgDeviation > this.config.maxDeviation) return false; // Too extreme

    // RSI confirms oversold
    if (stats.rsi > this.config.rsiOversold) return false;

    // Price below both VWAP and SMA (double confirmation)
    if (stats.current > stats.vwap || stats.current > stats.sma20) return false;

    return true;
  }

  /**
   * Check if overbought (good to sell)
   */
  private isOverbought(stats: PriceStats, deviationVwap: number, deviationSma: number): boolean {
    // Price significantly above mean
    const avgDeviation = (Math.abs(deviationVwap) + Math.abs(deviationSma)) / 2;
    if (deviationVwap < this.config.minDeviation) return false;
    if (avgDeviation > this.config.maxDeviation) return false; // Too extreme

    // RSI confirms overbought
    if (stats.rsi < this.config.rsiOverbought) return false;

    // Price above both VWAP and SMA (double confirmation)
    if (stats.current < stats.vwap || stats.current < stats.sma20) return false;

    return true;
  }

  /**
   * Create a trading signal
   */
  private createSignal(
    market: NormalizedMarket,
    outcome: { externalId: string; name: string; bestBid: number; bestAsk: number },
    side: 'BUY' | 'SELL',
    stats: PriceStats,
    deviation: number
  ): TradingSignal {
    // Calculate confidence based on how extreme the deviation is
    const confidence = this.calculateConfidence(stats, deviation);
    const baseSize = this.config.minPositionSize +
      (this.config.maxPositionSize - this.config.minPositionSize) * confidence;

    const price = side === 'BUY' ? outcome.bestAsk : outcome.bestBid;
    const size = Math.min(baseSize / price, this.config.maxPositionSize / price);

    const signal: TradingSignal = {
      id: `meanrev:${market.externalId}:${side}:${Date.now()}`,
      marketId: market.externalId,
      market,
      outcomeId: outcome.externalId,
      outcomeName: outcome.name,
      side,
      price,
      size,
      confidence,
      reason: this.getSignalReason(stats, side, deviation),
      strategy: 'mean_reversion',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000), // 60 second validity (longer for mean reversion)
    };

    this.activeSignals.set(market.externalId, signal);
    this.emit('signal', signal);

    this.log.info('Mean reversion signal generated', {
      market: market.title,
      side,
      price,
      confidence: confidence.toFixed(2),
      deviation: deviation.toFixed(1) + '%',
      rsi: stats.rsi.toFixed(0),
    });

    return signal;
  }

  /**
   * Calculate signal confidence
   */
  private calculateConfidence(stats: PriceStats, deviation: number): number {
    let confidence = 0.5;

    // Larger deviation = higher confidence (to a point)
    const absDeviation = Math.abs(deviation);
    if (absDeviation >= 5) confidence += 0.15;
    if (absDeviation >= 8) confidence += 0.1;

    // Extreme RSI = higher confidence
    if (stats.rsi < 20 || stats.rsi > 80) {
      confidence += 0.15;
    } else if (stats.rsi < 25 || stats.rsi > 75) {
      confidence += 0.1;
    }

    // Low volatility environment = higher confidence for mean reversion
    if (stats.volatility < 0.02) {
      confidence += 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Get signal reason
   */
  private getSignalReason(stats: PriceStats, side: 'BUY' | 'SELL', deviation: number): string {
    const reasons: string[] = [];

    if (side === 'BUY') {
      reasons.push(`Price ${Math.abs(deviation).toFixed(1)}% below VWAP`);
      reasons.push(`RSI oversold at ${stats.rsi.toFixed(0)}`);
      reasons.push('Expecting mean reversion up');
    } else {
      reasons.push(`Price ${deviation.toFixed(1)}% above VWAP`);
      reasons.push(`RSI overbought at ${stats.rsi.toFixed(0)}`);
      reasons.push('Expecting mean reversion down');
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
  updateConfig(config: Partial<MeanReversionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
