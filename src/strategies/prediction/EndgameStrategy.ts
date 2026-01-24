import { EventEmitter } from 'events';
import type { NormalizedMarket } from '../../clients/shared/interfaces.js';
import type { TradingSignal } from '../momentum/MomentumStrategy.js';
import { logger, type Logger } from '../../utils/logger.js';
import { OUTCOMES } from '../../config/constants.js';

/**
 * Endgame Strategy Configuration
 * 
 * Buy high-probability outcomes close to resolution
 * Small margins but high annualized returns
 */
export interface EndgameConfig {
  // Probability thresholds
  minProbability: number; // e.g., 0.90 = 90% (outcome nearly certain)
  maxProbability: number; // e.g., 0.99 = 99% (avoid 100% as might be stale)
  
  // Time to resolution
  maxHoursToResolution: number; // Only trade if resolving within X hours
  minHoursToResolution: number; // Don't trade if resolving too soon (might miss)
  
  // Position sizing
  maxPositionSize: number;
  minPositionSize: number;
  
  // Risk
  minAnnualizedReturn: number; // Minimum annualized return to consider
}

const DEFAULT_CONFIG: EndgameConfig = {
  minProbability: 0.70, // 70% certain (lowered from 75%)
  maxProbability: 0.98, // Not 99%+ (might be stale data)
  maxHoursToResolution: 720, // 30 days (increased from 2 weeks)
  minHoursToResolution: 0.5, // At least 30 min to resolution
  maxPositionSize: 50, // Max position for small balance
  minPositionSize: 1, // Min $1 position
  minAnnualizedReturn: 10, // 10% annualized minimum (lowered from 15%)
};

/**
 * Endgame Strategy
 * 
 * Buys outcomes that are nearly certain to win
 * 
 * Example:
 * - Market: "Will it rain tomorrow?" 
 * - YES price: $0.95 (95% probability)
 * - Resolution: 24 hours
 * - If it does rain, you get $1.00 for $0.95 = 5.26% profit in 24 hours
 * - Annualized: ~1,920% return (if you could compound)
 * 
 * This strategy captures the "last mile" before resolution
 */
export class EndgameStrategy extends EventEmitter {
  private log: Logger;
  private config: EndgameConfig;
  private activeSignals: Map<string, TradingSignal> = new Map();

  constructor(config?: Partial<EndgameConfig>) {
    super();
    this.log = logger('EndgameStrategy');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a market for endgame opportunities
   */
  analyze(market: NormalizedMarket): TradingSignal | null {
    if (!market.isActive) return null;

    // Only works for binary markets
    if (market.outcomes.length !== 2) return null;

    // Check if already have active signal
    if (this.activeSignals.has(market.externalId)) {
      return null;
    }

    // Check resolution time
    const hoursToResolution = this.getHoursToResolution(market);
    if (hoursToResolution === null) {
      this.log.debug('No resolution time', { market: market.title });
      return null;
    }

    if (hoursToResolution > this.config.maxHoursToResolution) {
      return null; // Too far out
    }

    if (hoursToResolution < this.config.minHoursToResolution) {
      return null; // Too close (might miss)
    }

    const yesOutcome = market.outcomes.find((o) => o.type === OUTCOMES.YES);
    const noOutcome = market.outcomes.find((o) => o.type === OUTCOMES.NO);

    if (!yesOutcome || !noOutcome) return null;

    // Check both outcomes for high probability
    const opportunities = [];

    // YES outcome check
    if (yesOutcome.bestAsk >= this.config.minProbability && 
        yesOutcome.bestAsk <= this.config.maxProbability) {
      const profit = this.calculatePotentialProfit(yesOutcome.bestAsk);
      const annualizedReturn = this.calculateAnnualizedReturn(profit, hoursToResolution);
      
      if (annualizedReturn >= this.config.minAnnualizedReturn) {
        opportunities.push({
          outcome: yesOutcome,
          probability: yesOutcome.bestAsk,
          profit,
          annualizedReturn,
          side: 'YES' as const,
        });
      }
    }

    // NO outcome check
    if (noOutcome.bestAsk >= this.config.minProbability && 
        noOutcome.bestAsk <= this.config.maxProbability) {
      const profit = this.calculatePotentialProfit(noOutcome.bestAsk);
      const annualizedReturn = this.calculateAnnualizedReturn(profit, hoursToResolution);
      
      if (annualizedReturn >= this.config.minAnnualizedReturn) {
        opportunities.push({
          outcome: noOutcome,
          probability: noOutcome.bestAsk,
          profit,
          annualizedReturn,
          side: 'NO' as const,
        });
      }
    }

    // Log diagnostics for why strategy doesn't trigger
    if (opportunities.length === 0) {
      if (Math.random() < 0.01) { // Log 1% of non-opportunities for diagnostics
        const yesProb = yesOutcome.bestAsk || 0;
        const noProb = noOutcome.bestAsk || 0;
        const maxProb = Math.max(yesProb, noProb);
        
        let reason = '';
        if (maxProb < this.config.minProbability) {
          reason = `Max probability ${(maxProb * 100).toFixed(1)}% < threshold ${(this.config.minProbability * 100).toFixed(1)}%`;
        } else if (maxProb > this.config.maxProbability) {
          reason = `Max probability ${(maxProb * 100).toFixed(1)}% > max ${(this.config.maxProbability * 100).toFixed(1)}% (stale?)`;
        } else {
          // Check annualized return
          const testProfit = this.calculatePotentialProfit(maxProb);
          const testAnnualized = this.calculateAnnualizedReturn(testProfit, hoursToResolution);
          if (testAnnualized < this.config.minAnnualizedReturn) {
            reason = `Annualized return ${testAnnualized.toFixed(1)}% < threshold ${this.config.minAnnualizedReturn}%`;
          }
        }
        
        this.log.debug('Endgame: No opportunity', {
          market: market.title.substring(0, 40),
          hoursToRes: hoursToResolution.toFixed(1),
          yesAsk: yesProb.toFixed(3),
          noAsk: noProb.toFixed(3),
          reason,
        });
      }
      return null;
    }

    this.log.debug('Endgame check', {
      market: market.title.substring(0, 40),
      hoursToRes: hoursToResolution.toFixed(1),
      yesAsk: yesOutcome.bestAsk?.toFixed(3),
      noAsk: noOutcome.bestAsk?.toFixed(3),
      opportunities: opportunities.length,
    });

    // Take the best opportunity (highest annualized return)
    const best = opportunities.reduce((a, b) => 
      a.annualizedReturn > b.annualizedReturn ? a : b
    );

    return this.createSignal(market, best.outcome, best, hoursToResolution);
  }

  /**
   * Scan markets for endgame opportunities
   */
  scanMarkets(markets: NormalizedMarket[]): TradingSignal[] {
    const signals: TradingSignal[] = [];
    let checkedCount = 0;
    let nearResolutionCount = 0;

    for (const market of markets) {
      const hours = this.getHoursToResolution(market);
      if (hours !== null && hours <= this.config.maxHoursToResolution) {
        nearResolutionCount++;
      }
      
      const signal = this.analyze(market);
      if (signal) {
        signals.push(signal);
      }
      checkedCount++;
    }

    this.log.info('Endgame scan complete', {
      marketsChecked: checkedCount,
      nearResolution: nearResolutionCount,
      opportunitiesFound: signals.length,
    });

    return signals;
  }

  /**
   * Get hours until market resolution
   */
  private getHoursToResolution(market: NormalizedMarket): number | null {
    // Use market.endDate from NormalizedMarket interface
    const endDate = market.endDate;
    if (!endDate) {
      // Fallback: check metadata if endDate is missing
      const metadata = (market as any).raw;
      if (metadata && (metadata.endDate || metadata.close_time || metadata.resolutionTime)) {
        const fallbackDate = metadata.endDate || metadata.close_time || metadata.resolutionTime;
        const resolutionTime = new Date(fallbackDate);
        const now = new Date();
        if (resolutionTime <= now) return null;
        const msToResolution = resolutionTime.getTime() - now.getTime();
        return msToResolution / (1000 * 60 * 60);
      }
      return null;
    }

    const resolutionTime = new Date(endDate);
    const now = new Date();
    
    if (resolutionTime <= now) return null; // Already resolved
    
    const msToResolution = resolutionTime.getTime() - now.getTime();
    return msToResolution / (1000 * 60 * 60); // Convert to hours
  }

  /**
   * Calculate potential profit percentage
   */
  private calculatePotentialProfit(price: number): number {
    // If price is $0.95, profit is (1.00 - 0.95) / 0.95 = 5.26%
    return ((1.0 - price) / price) * 100;
  }

  /**
   * Calculate annualized return
   */
  private calculateAnnualizedReturn(profitPercent: number, hoursToResolution: number): number {
    // Simple annualization: profit * (8760 hours/year) / hours to resolution
    const hoursPerYear = 8760;
    return (profitPercent / 100) * (hoursPerYear / hoursToResolution) * 100;
  }

  /**
   * Create a trading signal
   */
  private createSignal(
    market: NormalizedMarket,
    outcome: { externalId: string; name: string; bestAsk: number },
    opportunity: {
      probability: number;
      profit: number;
      annualizedReturn: number;
      side: 'YES' | 'NO';
    },
    hoursToResolution: number
  ): TradingSignal {
    // Higher probability = higher confidence
    const confidence = Math.min(1.0, opportunity.probability);
    const size = this.config.minPositionSize + 
      (this.config.maxPositionSize - this.config.minPositionSize) * confidence;

    const signal: TradingSignal = {
      id: `endgame:${market.externalId}:BUY:${Date.now()}`,
      marketId: market.externalId,
      market,
      outcomeId: outcome.externalId,
      outcomeName: outcome.name,
      side: 'BUY',
      price: outcome.bestAsk,
      size: size / outcome.bestAsk,
      confidence,
      reason: `Endgame: ${opportunity.side} at ${(opportunity.probability * 100).toFixed(1)}% probability. Profit: ${opportunity.profit.toFixed(2)}% in ${hoursToResolution.toFixed(1)}h. Annualized: ${opportunity.annualizedReturn.toFixed(0)}%`,
      strategy: 'endgame',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000), // 60 second validity
    };

    this.activeSignals.set(market.externalId, signal);
    this.emit('signal', signal);

    this.log.info('Endgame signal generated', {
      market: market.title.substring(0, 50),
      side: opportunity.side,
      probability: (opportunity.probability * 100).toFixed(1) + '%',
      profit: opportunity.profit.toFixed(2) + '%',
      hoursToRes: hoursToResolution.toFixed(1),
      annualized: opportunity.annualizedReturn.toFixed(0) + '%',
    });

    return signal;
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
  updateConfig(config: Partial<EndgameConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
