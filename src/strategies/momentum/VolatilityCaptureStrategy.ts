import { EventEmitter } from 'events';
import type { NormalizedMarket } from '../../clients/shared/interfaces.js';
import type { PriceStats } from '../../services/priceHistory/PriceHistoryTracker.js';
import type { TradingSignal } from './MomentumStrategy.js';
import { logger, type Logger } from '../../utils/logger.js';
import { OUTCOMES } from '../../config/constants.js';

/**
 * Volatility Capture Strategy Configuration
 * 
 * Based on documented 86% ROI strategy:
 * - Monitor first 2 minutes after market events
 * - Buy when prices drop 10%+ rapidly
 * - Hedge with opposite position at target price
 */
export interface VolatilityCaptureConfig {
  // Volatility thresholds
  minDropPercent: number; // Minimum price drop to trigger (e.g., 10%)
  maxDropPercent: number; // Maximum drop to avoid (too extreme, might be error)
  
  // Time window
  monitoringWindowMinutes: number; // Monitor first X minutes (e.g., 2)
  
  // Position sizing
  maxPositionSize: number;
  minPositionSize: number;
  
  // Risk management
  hedgeTargetPercent: number; // Hedge when price recovers by X%
  stopLossPercent: number; // Stop loss if price continues dropping
}

const DEFAULT_CONFIG: VolatilityCaptureConfig = {
  minDropPercent: 10.0, // 10% drop minimum
  maxDropPercent: 50.0, // Avoid drops >50% (likely error or extreme event)
  monitoringWindowMinutes: 2, // First 2 minutes
  maxPositionSize: 50,
  minPositionSize: 10,
  hedgeTargetPercent: 5.0, // Hedge when price recovers 5%
  stopLossPercent: 15.0, // Stop loss if drops another 15%
};

/**
 * Volatility Capture Strategy
 * 
 * Captures rapid price movements in the first minutes after market events
 * 
 * Strategy:
 * 1. Monitor markets in first 2 minutes after significant events
 * 2. When price drops 10%+ rapidly, buy the outcome
 * 3. Hedge with opposite position when price recovers to target
 * 4. Stop loss if price continues dropping
 */
export class VolatilityCaptureStrategy extends EventEmitter {
  private log: Logger;
  private config: VolatilityCaptureConfig;
  private activeSignals: Map<string, TradingSignal> = new Map();
  private marketEventTimes: Map<string, Date> = new Map(); // Track when markets become active/update

  constructor(config?: Partial<VolatilityCaptureConfig>) {
    super();
    this.log = logger('VolatilityCaptureStrategy');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a market for volatility capture opportunities
   */
  analyze(market: NormalizedMarket, stats: PriceStats | null): TradingSignal | null {
    if (!market.isActive) return null;

    // Only works for binary markets
    if (market.outcomes.length !== 2) return null;

    // Need price history to detect volatility
    if (!stats) return null;

    // Check if already have active signal
    if (this.activeSignals.has(market.externalId)) {
      return null;
    }

    // Check if we're in the monitoring window (first 2 minutes after event)
    const eventTime = this.marketEventTimes.get(market.externalId);
    if (!eventTime) {
      // Mark this as a potential event time if we see significant movement
      if (Math.abs(stats.changePercent) >= this.config.minDropPercent) {
        this.marketEventTimes.set(market.externalId, new Date());
      }
      return null;
    }

    const minutesSinceEvent = (Date.now() - eventTime.getTime()) / (1000 * 60);
    if (minutesSinceEvent > this.config.monitoringWindowMinutes) {
      // Outside monitoring window, clear event time
      this.marketEventTimes.delete(market.externalId);
      return null;
    }

    // Check for rapid price drop
    const dropPercent = Math.abs(stats.changePercent);
    if (dropPercent < this.config.minDropPercent || dropPercent > this.config.maxDropPercent) {
      return null;
    }

    // Check if price is dropping (not recovering)
    if (stats.changePercent > 0) {
      return null; // Price is going up, not dropping
    }

    // Check volatility (high volatility = more opportunity)
    if (stats.volatility < 0.01) {
      return null; // Not volatile enough
    }

    const yesOutcome = market.outcomes.find((o) => o.type === OUTCOMES.YES);
    if (!yesOutcome) return null;

    // Calculate confidence based on drop magnitude and volatility
    const dropScore = Math.min(1.0, (dropPercent - this.config.minDropPercent) / 20.0);
    const volatilityScore = Math.min(1.0, stats.volatility * 100);
    const confidence = (dropScore * 0.7 + volatilityScore * 0.3);

    if (confidence < 0.4) {
      return null; // Not confident enough
    }

    // Determine which outcome to buy (usually the one dropping)
    // If YES is dropping, buy YES (betting on recovery)
    // If NO is dropping, buy NO
    const outcome = yesOutcome;
    const price = outcome.bestAsk || stats.current;

    // Calculate position size
    const size = this.config.minPositionSize + 
      (this.config.maxPositionSize - this.config.minPositionSize) * confidence;

    const signal: TradingSignal = {
      id: `volatility-capture:${market.externalId}:${Date.now()}`,
      marketId: market.externalId,
      market,
      outcomeId: outcome.externalId,
      outcomeName: outcome.name,
      side: 'BUY',
      price,
      size: size / price,
      confidence,
      reason: `Volatility capture: ${dropPercent.toFixed(1)}% drop detected in first ${minutesSinceEvent.toFixed(1)} minutes. Volatility: ${(stats.volatility * 100).toFixed(2)}%`,
      strategy: 'volatility-capture',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000), // 60 second validity
    };

    this.activeSignals.set(market.externalId, signal);
    this.emit('signal', signal);

    this.log.info('Volatility capture signal generated', {
      market: market.title.substring(0, 50),
      dropPercent: dropPercent.toFixed(1) + '%',
      volatility: (stats.volatility * 100).toFixed(2) + '%',
      minutesSinceEvent: minutesSinceEvent.toFixed(1),
      confidence: confidence.toFixed(2),
    });

    return signal;
  }

  /**
   * Record a market event (e.g., market becomes active, significant update)
   */
  recordMarketEvent(marketId: string): void {
    this.marketEventTimes.set(marketId, new Date());
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

    // Clean up old event times (older than monitoring window)
    const cutoffTime = Date.now() - (this.config.monitoringWindowMinutes * 60 * 1000);
    for (const [marketId, eventTime] of this.marketEventTimes) {
      if (eventTime.getTime() < cutoffTime) {
        this.marketEventTimes.delete(marketId);
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
  updateConfig(config: Partial<VolatilityCaptureConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
