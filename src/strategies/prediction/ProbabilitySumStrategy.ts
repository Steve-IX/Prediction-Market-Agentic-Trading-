import { EventEmitter } from 'events';
import type { NormalizedMarket } from '../../clients/shared/interfaces.js';
import type { TradingSignal } from '../momentum/MomentumStrategy.js';
import { logger, type Logger } from '../../utils/logger.js';
import { OUTCOMES } from '../../config/constants.js';

/**
 * Probability Sum Strategy Configuration
 * 
 * In prediction markets, YES + NO should always sum to $1.00
 * When they don't, there's a guaranteed arbitrage opportunity
 */
export interface ProbabilitySumConfig {
  // Minimum mispricing to act on
  minMispricingPercent: number; // e.g., 0.5 = 0.5% (YES + NO = 0.995 or 1.005)
  
  // Position sizing
  maxPositionSize: number;
  minPositionSize: number;
  
  // Fees
  platformFeePercent: number; // Polymarket takes ~1% fee
}

const DEFAULT_CONFIG: ProbabilitySumConfig = {
  minMispricingPercent: 0.5, // 0.5% mispricing minimum
  maxPositionSize: 100,
  minPositionSize: 10,
  platformFeePercent: 1.0, // Account for fees
};

/**
 * Probability Sum Arbitrage Strategy
 * 
 * Core principle: In binary markets, YES + NO = $1.00
 * 
 * Opportunity types:
 * 1. Sum < $1.00 → Buy BOTH YES and NO, guaranteed profit at resolution
 * 2. Sum > $1.00 → Sell BOTH YES and NO (if you hold them)
 * 
 * This is the most reliable strategy for prediction markets
 */
export class ProbabilitySumStrategy extends EventEmitter {
  private log: Logger;
  private config: ProbabilitySumConfig;
  private activeSignals: Map<string, TradingSignal> = new Map();
  private lastScanResults: Map<string, { sum: number; timestamp: Date }> = new Map();

  constructor(config?: Partial<ProbabilitySumConfig>) {
    super();
    this.log = logger('ProbabilitySumStrategy');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a market for probability sum arbitrage
   */
  analyze(market: NormalizedMarket): TradingSignal | null {
    if (!market.isActive) {
      this.log.debug('Market inactive', { market: market.title });
      return null;
    }

    // Only works for binary markets (YES/NO)
    if (market.outcomes.length !== 2) {
      return null;
    }

    const yesOutcome = market.outcomes.find((o) => o.type === OUTCOMES.YES);
    const noOutcome = market.outcomes.find((o) => o.type === OUTCOMES.NO);

    if (!yesOutcome || !noOutcome) {
      return null;
    }

    // Check if already have active signal
    if (this.activeSignals.has(market.externalId)) {
      return null;
    }

    // Calculate probability sum using best prices
    // For buying: use best ASK (what we pay)
    const yesAsk = yesOutcome.bestAsk;
    const noAsk = noOutcome.bestAsk;
    // Note: yesBid and noBid could be used for sell-side arbitrage in future
    // const yesBid = yesOutcome.bestBid;
    // const noBid = noOutcome.bestBid;

    // Skip if no valid prices
    if (!yesAsk || !noAsk || yesAsk <= 0 || noAsk <= 0) {
      this.log.debug('No valid ask prices', { 
        market: market.title,
        yesAsk,
        noAsk 
      });
      return null;
    }

    // Calculate sum of asks (cost to buy both)
    const sumOfAsks = yesAsk + noAsk;
    
    // Store scan result for debugging
    this.lastScanResults.set(market.externalId, {
      sum: sumOfAsks,
      timestamp: new Date()
    });

    // Calculate mispricing
    const mispricingPercent = Math.abs(sumOfAsks - 1.0) * 100;
    const profitAfterFees = (1.0 - sumOfAsks) * 100 - this.config.platformFeePercent;

    this.log.debug('Probability sum check', {
      market: market.title.substring(0, 40),
      yesAsk: yesAsk.toFixed(4),
      noAsk: noAsk.toFixed(4),
      sum: sumOfAsks.toFixed(4),
      mispricingPct: mispricingPercent.toFixed(2),
      profitAfterFees: profitAfterFees.toFixed(2),
    });

    // Check for arbitrage opportunity: sum < $1.00 (minus fees)
    if (sumOfAsks < 1.0 && profitAfterFees > 0) {
      // We can buy both YES and NO for less than $1, guaranteed $1 at resolution
      return this.createArbitrageSignal(market, yesOutcome, noOutcome, sumOfAsks, profitAfterFees);
    }

    return null;
  }

  /**
   * Scan multiple markets for probability sum opportunities
   */
  scanMarkets(markets: NormalizedMarket[]): TradingSignal[] {
    const signals: TradingSignal[] = [];
    let scannedCount = 0;
    let validBinaryCount = 0;

    for (const market of markets) {
      scannedCount++;
      
      // Only binary markets
      if (market.outcomes.length === 2) {
        validBinaryCount++;
        const signal = this.analyze(market);
        if (signal) {
          signals.push(signal);
        }
      }
    }

    if (scannedCount > 0) {
      this.log.info('Probability sum scan complete', {
        marketsScanned: scannedCount,
        binaryMarkets: validBinaryCount,
        opportunitiesFound: signals.length,
      });
    }

    return signals;
  }

  /**
   * Get best opportunities sorted by profit
   */
  getBestOpportunities(markets: NormalizedMarket[], limit = 5): Array<{
    market: NormalizedMarket;
    sum: number;
    profitPercent: number;
  }> {
    const opportunities: Array<{
      market: NormalizedMarket;
      sum: number;
      profitPercent: number;
    }> = [];

    for (const market of markets) {
      if (!market.isActive || market.outcomes.length !== 2) continue;

      const yesOutcome = market.outcomes.find((o) => o.type === OUTCOMES.YES);
      const noOutcome = market.outcomes.find((o) => o.type === OUTCOMES.NO);
      if (!yesOutcome || !noOutcome) continue;

      const yesAsk = yesOutcome.bestAsk;
      const noAsk = noOutcome.bestAsk;
      if (!yesAsk || !noAsk) continue;

      const sum = yesAsk + noAsk;
      const profitPercent = (1.0 - sum) * 100 - this.config.platformFeePercent;

      opportunities.push({ market, sum, profitPercent });
    }

    // Sort by profit (highest first)
    opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
    return opportunities.slice(0, limit);
  }

  /**
   * Create an arbitrage signal for buying both YES and NO
   */
  private createArbitrageSignal(
    market: NormalizedMarket,
    yesOutcome: { externalId: string; name: string; bestAsk: number },
    noOutcome: { externalId: string; name: string; bestAsk: number },
    sumOfAsks: number,
    profitPercent: number
  ): TradingSignal {
    // For arbitrage, we buy the cheaper outcome
    const buyYes = yesOutcome.bestAsk <= noOutcome.bestAsk;
    const outcome = buyYes ? yesOutcome : noOutcome;
    
    const confidence = Math.min(1.0, 0.5 + profitPercent / 10); // Higher profit = higher confidence
    const size = this.config.minPositionSize + 
      (this.config.maxPositionSize - this.config.minPositionSize) * confidence;

    const signal: TradingSignal = {
      id: `probsum:${market.externalId}:BUY:${Date.now()}`,
      marketId: market.externalId,
      market,
      outcomeId: outcome.externalId,
      outcomeName: outcome.name,
      side: 'BUY',
      price: outcome.bestAsk,
      size: size / outcome.bestAsk,
      confidence,
      reason: `Probability sum arbitrage: YES($${yesOutcome.bestAsk.toFixed(3)}) + NO($${noOutcome.bestAsk.toFixed(3)}) = $${sumOfAsks.toFixed(3)} < $1.00. Est. profit: ${profitPercent.toFixed(2)}% after fees`,
      strategy: 'probability_sum',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30000), // 30 second validity
    };

    this.activeSignals.set(market.externalId, signal);
    this.emit('signal', signal);

    this.log.info('Probability sum arbitrage signal', {
      market: market.title.substring(0, 50),
      sum: sumOfAsks.toFixed(4),
      profitPercent: profitPercent.toFixed(2),
      confidence: confidence.toFixed(2),
    });

    return signal;
  }

  /**
   * Get last scan results for debugging
   */
  getLastScanResults(): Map<string, { sum: number; timestamp: Date }> {
    return new Map(this.lastScanResults);
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
  updateConfig(config: Partial<ProbabilitySumConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
