import { EventEmitter } from 'events';
import type { NormalizedMarket, OrderBook } from '../../clients/shared/interfaces.js';
import { logger, type Logger } from '../../utils/logger.js';
import { OUTCOMES } from '../../config/constants.js';
import type { TradingSignal } from './MomentumStrategy.js';

/**
 * Spread Hunter Strategy Configuration
 * Targets illiquid markets with wide spreads where bots are less active
 */
export interface SpreadHunterConfig {
  // Spread thresholds
  minSpreadPercent: number; // Minimum spread to consider (e.g., 2%)
  maxSpreadPercent: number; // Maximum spread to avoid (too illiquid, can't exit)
  
  // Liquidity filters
  minBidSize: number; // Minimum bid size in USD
  minAskSize: number; // Minimum ask size in USD
  maxBidAskRatio: number; // Max ratio between bid/ask depth (avoid extreme imbalance)
  
  // Position sizing
  maxPositionSize: number; // Maximum position in USDC
  minPositionSize: number; // Minimum position in USDC
  
  // Risk management
  takeProfitPercent: number; // Take profit when spread narrows
  stopLossPercent: number; // Stop loss if spread widens further
  
  // Market filters
  minMarketAgeHours: number; // Markets must be active for at least X hours
  maxMarketAgeHours: number; // Avoid markets too close to resolution
}

const DEFAULT_CONFIG: SpreadHunterConfig = {
  minSpreadPercent: 2.0, // Target markets with >2% spread
  maxSpreadPercent: 15.0, // Avoid markets with >15% spread (too illiquid)
  minBidSize: 10, // Minimum $10 on bid side
  minAskSize: 10, // Minimum $10 on ask side
  maxBidAskRatio: 5.0, // Bid depth shouldn't be >5x ask depth (or vice versa)
  maxPositionSize: 50, // Max $50 position
  minPositionSize: 10, // Min $10 position
  takeProfitPercent: 1.5, // Take profit when spread narrows by 1.5%
  stopLossPercent: 3.0, // Stop loss if spread widens by 3%
  minMarketAgeHours: 1, // Market must be active for at least 1 hour
  maxMarketAgeHours: 720, // Avoid markets resolving in <30 days
};

/**
 * Spread Hunter Strategy
 * Targets illiquid/niche markets with wide spreads where bots are less active
 * 
 * Logic:
 * - Finds markets with wide bid-ask spreads (>2%)
 * - Targets markets with sufficient but not excessive liquidity
 * - Enters when spread is wide enough to profit after fees
 * - Exits when spread narrows (take profit) or widens further (stop loss)
 */
export class SpreadHunterStrategy extends EventEmitter {
  private log: Logger;
  private config: SpreadHunterConfig;
  private activeSignals: Map<string, TradingSignal> = new Map();

  constructor(config?: Partial<SpreadHunterConfig>) {
    super();
    this.log = logger('SpreadHunterStrategy');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a market and generate signals based on spread width
   */
  analyze(market: NormalizedMarket, orderbook?: OrderBook): TradingSignal | null {
    if (!market.isActive) return null;

    // Only trade binary markets
    if (market.outcomes.length !== 2) return null;

    const yesOutcome = market.outcomes.find((o) => o.type === OUTCOMES.YES);
    const noOutcome = market.outcomes.find((o) => o.type === OUTCOMES.NO);

    if (!yesOutcome || !noOutcome) return null;

    // Need orderbook data to calculate spread
    if (!orderbook) return null;

    // Check market age
    if (market.endDate) {
      const hoursToResolution = (market.endDate.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursToResolution < this.config.minMarketAgeHours || hoursToResolution > this.config.maxMarketAgeHours) {
        return null;
      }
    }

    // Calculate spread from orderbook
    const spreadInfo = this.calculateSpread(yesOutcome, noOutcome, orderbook);
    if (!spreadInfo) return null;

    const { spreadPercent, bidSize, askSize } = spreadInfo;

    // Check spread thresholds
    if (spreadPercent < this.config.minSpreadPercent || spreadPercent > this.config.maxSpreadPercent) {
      return null;
    }

    // Check liquidity requirements
    if (bidSize < this.config.minBidSize || askSize < this.config.minAskSize) {
      return null;
    }

    // Check bid/ask imbalance
    const bidAskRatio = bidSize / askSize;
    if (bidAskRatio > this.config.maxBidAskRatio || bidAskRatio < 1 / this.config.maxBidAskRatio) {
      return null;
    }

    // Skip if already have active signal
    if (this.activeSignals.has(market.externalId)) {
      return null;
    }

    // Determine which side to trade based on spread
    // If YES ask is high and NO ask is low, buy NO (or vice versa)
    // Strategy: Buy the cheaper side when spread is wide
    const yesAsk = yesOutcome.bestAsk || 0;
    const noAsk = noOutcome.bestAsk || 0;
    const sumOfAsks = yesAsk + noAsk;

    // If sum < 1.0, there's arbitrage (handled by ProbabilitySumStrategy)
    // If sum > 1.0, we look for wide spreads to trade
    if (sumOfAsks < 1.0) {
      return null; // Let ProbabilitySumStrategy handle this
    }

    // Calculate expected profit after fees (assuming 2% platform fee)
    const platformFeePercent = 2.0;
    const profitAfterFees = (spreadPercent - platformFeePercent) / 100;

    // Only trade if we can profit after fees
    if (profitAfterFees <= 0) {
      return null;
    }

    // Determine trade direction
    // If YES is overpriced relative to NO, buy NO
    // If NO is overpriced relative to YES, buy YES
    let tradeSide: 'BUY' | 'SELL';
    let tradeOutcome: typeof yesOutcome | typeof noOutcome;
    let tradePrice: number;
    let reason: string;

    if (yesAsk > noAsk + 0.02) {
      // YES is overpriced, buy NO
      tradeSide = 'BUY';
      tradeOutcome = noOutcome;
      tradePrice = noOutcome.bestAsk || 0;
      reason = `NO is underpriced (YES=${yesAsk.toFixed(3)}, NO=${noAsk.toFixed(3)}, spread=${spreadPercent.toFixed(2)}%)`;
    } else if (noAsk > yesAsk + 0.02) {
      // NO is overpriced, buy YES
      tradeSide = 'BUY';
      tradeOutcome = yesOutcome;
      tradePrice = yesOutcome.bestAsk || 0;
      reason = `YES is underpriced (YES=${yesAsk.toFixed(3)}, NO=${noAsk.toFixed(3)}, spread=${spreadPercent.toFixed(2)}%)`;
    } else {
      // Spread is wide but both sides are relatively balanced
      // Buy the cheaper side
      if (yesAsk < noAsk) {
        tradeSide = 'BUY';
        tradeOutcome = yesOutcome;
        tradePrice = yesAsk;
        reason = `Wide spread opportunity - buying cheaper YES (spread=${spreadPercent.toFixed(2)}%)`;
      } else {
        tradeSide = 'BUY';
        tradeOutcome = noOutcome;
        tradePrice = noAsk;
        reason = `Wide spread opportunity - buying cheaper NO (spread=${spreadPercent.toFixed(2)}%)`;
      }
    }

    // Calculate position size based on available liquidity and max position
    const availableLiquidity = Math.min(bidSize, askSize);
    const positionSize = Math.min(
      this.config.maxPositionSize,
      Math.max(this.config.minPositionSize, availableLiquidity * 0.3) // Use 30% of available liquidity
    );

    // Calculate confidence based on spread width and liquidity
    const spreadScore = Math.min(1.0, (spreadPercent - this.config.minSpreadPercent) / 5.0); // Normalize to 0-1
    const liquidityScore = Math.min(1.0, availableLiquidity / 100); // More liquidity = higher confidence
    const confidence = (spreadScore * 0.6 + liquidityScore * 0.4); // Weight spread more

    if (confidence < 0.5) {
      return null; // Not confident enough
    }

    // Create signal
    const signal: TradingSignal = {
      id: `spread-hunter-${market.externalId}-${Date.now()}`,
      marketId: market.externalId,
      market,
      outcomeId: tradeOutcome.id,
      outcomeName: tradeOutcome.name,
      side: tradeSide,
      price: tradePrice,
      size: positionSize,
      confidence,
      reason,
      strategy: 'spread-hunter',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // Expires in 5 minutes
    };

    this.activeSignals.set(market.externalId, signal);
    this.log.info('SpreadHunter signal generated', {
      market: market.title.substring(0, 40),
      spread: `${spreadPercent.toFixed(2)}%`,
      side: tradeSide,
      outcome: tradeOutcome.name,
      confidence: confidence.toFixed(2),
      profitAfterFees: `${(profitAfterFees * 100).toFixed(2)}%`,
    });

    return signal;
  }

  /**
   * Calculate spread information from orderbook
   */
  private calculateSpread(
    yesOutcome: { bestBid?: number; bestAsk?: number },
    noOutcome: { bestBid?: number; bestAsk?: number },
    orderbook: OrderBook
  ): {
    spreadPercent: number;
    bidSize: number;
    askSize: number;
  } | null {
    const yesBid = yesOutcome.bestBid || 0;
    const yesAsk = yesOutcome.bestAsk || 0;
    const noBid = noOutcome.bestBid || 0;
    const noAsk = noOutcome.bestAsk || 0;

    // Need both bid and ask prices
    if (!yesBid || !yesAsk || !noBid || !noAsk) {
      return null;
    }

    // Calculate spread for YES
    const yesSpread = yesAsk - yesBid;
    const yesSpreadPercent = (yesSpread / yesBid) * 100;

    // Calculate spread for NO
    const noSpread = noAsk - noBid;
    const noSpreadPercent = (noSpread / noBid) * 100;

    // Use the wider spread
    const useYes = yesSpreadPercent > noSpreadPercent;
    const spreadPercent = useYes ? yesSpreadPercent : noSpreadPercent;

    // Get orderbook depth from yes/no structure
    const yesBids = orderbook.yes?.bids || [];
    const yesAsks = orderbook.yes?.asks || [];
    const noBids = orderbook.no?.bids || [];
    const noAsks = orderbook.no?.asks || [];

    // Calculate total size on each side (size is already in USD)
    const yesBidSize = yesBids.reduce((sum, b) => sum + b.size, 0);
    const yesAskSize = yesAsks.reduce((sum, a) => sum + a.size, 0);
    const noBidSize = noBids.reduce((sum, b) => sum + b.size, 0);
    const noAskSize = noAsks.reduce((sum, a) => sum + a.size, 0);

    const bidSize = useYes ? yesBidSize : noBidSize;
    const askSize = useYes ? yesAskSize : noAskSize;

    return {
      spreadPercent,
      bidSize,
      askSize,
    };
  }

  /**
   * Remove expired signals
   */
  cleanupExpiredSignals(): void {
    const now = new Date();
    for (const [marketId, signal] of this.activeSignals.entries()) {
      if (signal.expiresAt < now) {
        this.activeSignals.delete(marketId);
      }
    }
  }

  /**
   * Get active signals
   */
  getActiveSignals(): TradingSignal[] {
    this.cleanupExpiredSignals();
    return Array.from(this.activeSignals.values());
  }
}
