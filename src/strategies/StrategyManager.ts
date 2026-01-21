import { EventEmitter } from 'events';
import type { NormalizedMarket, OrderBook } from '../clients/shared/interfaces.js';
import { PriceHistoryTracker, type PriceStats } from '../services/priceHistory/PriceHistoryTracker.js';
import { MomentumStrategy, type TradingSignal } from './momentum/MomentumStrategy.js';
import { MeanReversionStrategy } from './momentum/MeanReversionStrategy.js';
import { OrderbookImbalanceStrategy } from './momentum/OrderbookImbalanceStrategy.js';
import { ProbabilitySumStrategy } from './prediction/ProbabilitySumStrategy.js';
import { EndgameStrategy } from './prediction/EndgameStrategy.js';
import { OUTCOMES } from '../config/constants.js';
import { logger, type Logger } from '../utils/logger.js';

/**
 * Strategy Manager Configuration
 */
export interface StrategyManagerConfig {
  enableMomentum: boolean;
  enableMeanReversion: boolean;
  enableOrderbookImbalance: boolean;
  enableProbabilitySum: boolean; // Prediction market arbitrage (YES+NO != $1)
  enableEndgame: boolean; // High probability near resolution
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
  probabilitySumConfig?: {
    minMispricingPercent?: number;
    maxPositionSize?: number;
    minPositionSize?: number;
  };
  endgameConfig?: {
    minProbability?: number;
    maxHoursToResolution?: number;
    minAnnualizedReturn?: number;
    maxPositionSize?: number;
    minPositionSize?: number;
  };
}

const DEFAULT_CONFIG: StrategyManagerConfig = {
  enableMomentum: true,
  enableMeanReversion: true,
  enableOrderbookImbalance: true,
  enableProbabilitySum: true, // Enabled by default - most reliable strategy
  enableEndgame: true, // Enabled by default
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

  // Technical Analysis Strategies (require price history)
  private momentumStrategy: MomentumStrategy;
  private meanReversionStrategy: MeanReversionStrategy;
  private orderbookImbalanceStrategy: OrderbookImbalanceStrategy;

  // Prediction Market-Specific Strategies (don't need price history)
  private probabilitySumStrategy: ProbabilitySumStrategy;
  private endgameStrategy: EndgameStrategy;

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
    
    // Prediction market-specific strategies (don't need price history)
    this.probabilitySumStrategy = new ProbabilitySumStrategy(this.config.probabilitySumConfig);
    this.endgameStrategy = new EndgameStrategy(this.config.endgameConfig);

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

    // === PREDICTION MARKET-SPECIFIC STRATEGIES (highest priority, don't need price history) ===
    
    // Run probability sum strategy (YES+NO != $1 arbitrage)
    if (this.config.enableProbabilitySum) {
      const signal = this.probabilitySumStrategy.analyze(market);
      if (signal) {
        signals.push(signal);
        this.log.info('ProbabilitySum signal generated', {
          market: market.title.substring(0, 40),
          confidence: signal.confidence.toFixed(2),
        });
      }
    }

    // Run endgame strategy (high probability near resolution)
    if (this.config.enableEndgame) {
      const signal = this.endgameStrategy.analyze(market);
      if (signal) {
        signals.push(signal);
        this.log.info('Endgame signal generated', {
          market: market.title.substring(0, 40),
          confidence: signal.confidence.toFixed(2),
        });
      }
    }

    // === TECHNICAL ANALYSIS STRATEGIES (need price history) ===
    
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
    const activeMarkets = markets.filter(m => m.isActive);
    const binaryMarkets = activeMarkets.filter(m => m.outcomes.length === 2);
    const marketsWithPrices = binaryMarkets.filter(m => {
      const yes = m.outcomes.find(o => o.type === OUTCOMES.YES);
      const no = m.outcomes.find(o => o.type === OUTCOMES.NO);
      return yes?.bestAsk && no?.bestAsk && yes.bestAsk > 0 && no.bestAsk > 0;
    });

    // Log at info level periodically (every 5th scan) to avoid spam
    if (Math.random() < 0.2) {
      this.log.info('Scanning markets for signals', {
        totalMarkets: markets.length,
        activeMarkets: activeMarkets.length,
        binaryMarkets: binaryMarkets.length,
        marketsWithPrices: marketsWithPrices.length,
        orderbooksAvailable: orderbooks?.size || 0,
      });
    }

    for (const market of activeMarkets) {
      // Try to get orderbook for first outcome (for orderbook imbalance strategy)
      const firstOutcomeId = market.outcomes[0]?.externalId;
      const orderbook = firstOutcomeId ? orderbooks?.get(firstOutcomeId) : undefined;
      const signals = this.analyzeMarket(market, orderbook);
      allSignals.push(...signals);
    }
    
    if (allSignals.length > 0) {
      this.log.info('Signals found during scan', {
        signalCount: allSignals.length,
        strategies: [...new Set(allSignals.map(s => s.strategy))],
      });
    } else if (marketsWithPrices.length > 0) {
      // Log summary of why no signals found (every 5th scan to avoid spam)
      if (Math.random() < 0.2) {
        const sampleMarket = marketsWithPrices[0];
        if (sampleMarket) {
          const yes = sampleMarket.outcomes.find(o => o.type === OUTCOMES.YES);
          const no = sampleMarket.outcomes.find(o => o.type === OUTCOMES.NO);
          const sum = (yes?.bestAsk || 0) + (no?.bestAsk || 0);
          this.log.info('No signals found - sample market analysis', {
            marketsAnalyzed: activeMarkets.length,
            binaryMarkets: binaryMarkets.length,
            marketsWithPrices: marketsWithPrices.length,
            sampleSum: sum.toFixed(4),
            sampleYesAsk: yes?.bestAsk?.toFixed(4),
            sampleNoAsk: no?.bestAsk?.toFixed(4),
            note: 'Markets may not meet strategy thresholds (e.g., probability sum < 1.0)',
          });
        }
      }
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
      ...this.probabilitySumStrategy.getActiveSignals(),
      ...this.endgameStrategy.getActiveSignals(),
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
    this.probabilitySumStrategy.clearSignal(signal.marketId);
    this.endgameStrategy.clearSignal(signal.marketId);
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
      ...this.probabilitySumStrategy.getActiveSignals(),
      ...this.endgameStrategy.getActiveSignals(),
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
    this.probabilitySumStrategy.on('signal', (signal) => {
      this.emit('signal', signal);
    });

    this.endgameStrategy.on('signal', (signal) => {
      this.emit('signal', signal);
    });

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
    this.probabilitySumStrategy.clearExpiredSignals();
    this.endgameStrategy.clearExpiredSignals();
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
