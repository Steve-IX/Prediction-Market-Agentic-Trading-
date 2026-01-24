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
  minMispricingPercent: 0.3, // 0.3% mispricing minimum (lowered for prediction markets)
  maxPositionSize: 100,
  minPositionSize: 10,
  platformFeePercent: 1.0, // Fees are on execution, not upfront
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

    // Calculate profit percentage (fees are on execution, not upfront)
    // If sum = 0.997, profit = (1.0 - 0.997) / 0.997 = 0.3%
    const profitPercent = ((1.0 - sumOfAsks) / sumOfAsks) * 100;
    const minProfitPercent = this.config.minMispricingPercent;

    // Log diagnostics for why strategy doesn't trigger
    if (sumOfAsks >= 1.0) {
      // Sum >= 1.0, no arbitrage opportunity
      if (Math.random() < 0.01) { // Log 1% of non-opportunities for diagnostics
        this.log.debug('ProbabilitySum: No opportunity (sum >= 1.0)', {
          market: market.title.substring(0, 40),
          sumOfAsks: sumOfAsks.toFixed(4),
          yesAsk: yesAsk.toFixed(4),
          noAsk: noAsk.toFixed(4),
        });
      }
      return null;
    }

    // Log if we find a close opportunity (within 0.5% of threshold) for diagnostics
    if (sumOfAsks < 1.0 && profitPercent < minProfitPercent) {
      this.log.debug('ProbabilitySum: Close but below threshold', {
        market: market.title.substring(0, 40),
        sumOfAsks: sumOfAsks.toFixed(4),
        yesAsk: yesAsk.toFixed(4),
        noAsk: noAsk.toFixed(4),
        profitPercent: profitPercent.toFixed(2),
        threshold: minProfitPercent.toFixed(2),
        reason: `Profit ${profitPercent.toFixed(2)}% < threshold ${minProfitPercent.toFixed(2)}%`,
      });
      return null;
    }

    // Check for arbitrage opportunity: sum < $1.00 and profit > threshold
    // Note: Fees (~1%) are deducted at execution, so we need profit > fees to be profitable
    if (sumOfAsks < 1.0 && profitPercent >= minProfitPercent) {
      // We can buy both YES and NO for less than $1, guaranteed $1 at resolution
      // Create signals for BOTH outcomes (true arbitrage requires both)
      return this.createArbitrageSignal(market, yesOutcome, noOutcome, sumOfAsks, profitPercent);
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
      // Calculate profit percentage (fees are on execution, not upfront)
      const profitPercent = ((1.0 - sum) / sum) * 100;

      opportunities.push({ market, sum, profitPercent });
    }

    // Sort by profit (highest first)
    opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
    return opportunities.slice(0, limit);
  }

  /**
   * Create an arbitrage signal for buying both YES and NO
   * Returns a signal with metadata indicating it needs batch execution
   */
  private createArbitrageSignal(
    market: NormalizedMarket,
    yesOutcome: { externalId: string; name: string; bestAsk: number },
    noOutcome: { externalId: string; name: string; bestAsk: number },
    sumOfAsks: number,
    profitPercent: number
  ): TradingSignal {
    // For true arbitrage, we need to buy BOTH YES and NO
    // Calculate position size: split investment between both outcomes
    const confidence = Math.min(1.0, 0.7 + profitPercent / 20); // Higher profit = higher confidence
    const totalSize = this.config.minPositionSize + 
      (this.config.maxPositionSize - this.config.minPositionSize) * confidence;
    
    // Split position: buy proportional to prices (more of the cheaper one)
    // But ensure we get at least $1 worth of each outcome at resolution
    const yesSize = totalSize * (yesOutcome.bestAsk / sumOfAsks);
    const noSize = totalSize * (noOutcome.bestAsk / sumOfAsks);
    
    // Calculate shares needed for each outcome
    const yesShares = yesSize / yesOutcome.bestAsk;
    const noShares = noSize / noOutcome.bestAsk;
    
    // Use YES outcome as primary signal, but include metadata for batch execution
    const signal: TradingSignal = {
      id: `probsum:${market.externalId}:BATCH:${Date.now()}`,
      marketId: market.externalId,
      market,
      outcomeId: yesOutcome.externalId, // Primary outcome ID
      outcomeName: yesOutcome.name,
      side: 'BUY',
      price: yesOutcome.bestAsk,
      size: yesShares, // Size for YES outcome
      confidence,
      reason: `Probability sum arbitrage: YES($${yesOutcome.bestAsk.toFixed(3)}) + NO($${noOutcome.bestAsk.toFixed(3)}) = $${sumOfAsks.toFixed(3)} < $1.00. Est. profit: ${profitPercent.toFixed(2)}% (requires buying BOTH outcomes)`,
      strategy: 'probability_sum',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30000), // 30 second validity
      // Add metadata for batch execution (will be checked by SignalExecutor)
      metadata: {
        batchExecution: true,
        batchOrders: [
          {
            outcomeId: yesOutcome.externalId,
            outcomeName: yesOutcome.name,
            side: 'BUY',
            price: yesOutcome.bestAsk,
            size: yesShares,
          },
          {
            outcomeId: noOutcome.externalId,
            outcomeName: noOutcome.name,
            side: 'BUY',
            price: noOutcome.bestAsk,
            size: noShares,
          },
        ],
        totalCost: totalSize,
        expectedProfit: profitPercent,
        sumOfAsks,
      },
    };

    this.activeSignals.set(market.externalId, signal);
    this.emit('signal', signal);

    this.log.info('Probability sum arbitrage signal (BATCH)', {
      market: market.title.substring(0, 50),
      sum: sumOfAsks.toFixed(4),
      profitPercent: profitPercent.toFixed(2),
      confidence: confidence.toFixed(2),
      yesSize: yesSize.toFixed(2),
      noSize: noSize.toFixed(2),
      totalSize: totalSize.toFixed(2),
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
