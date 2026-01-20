import { EventEmitter } from 'events';
import type { NormalizedMarket, OrderBook } from '../clients/shared/interfaces.js';
import { PriceHistoryTracker, type PriceStats } from '../services/priceHistory/PriceHistoryTracker.js';
import { MomentumStrategy, type TradingSignal } from './momentum/MomentumStrategy.js';
import { MeanReversionStrategy } from './momentum/MeanReversionStrategy.js';
import { OrderbookImbalanceStrategy } from './momentum/OrderbookImbalanceStrategy.js';
import { ProbabilitySumStrategy } from './prediction/ProbabilitySumStrategy.js';
import { EndgameStrategy } from './prediction/EndgameStrategy.js';
import { logger, type Logger } from '../utils/logger.js';

/**
 * Strategy Manager Configuration
 */
export interface StrategyManagerConfig {
  enableMomentum: boolean;
  enableMeanReversion: boolean;
  enableOrderbookImbalance: boolean;
  enableProbabilitySum: boolean; // NEW: Prediction market arbitrage
  enableEndgame: boolean; // NEW: Near-resolution high-probability trading
  maxConcurrentSignals: number;
  signalCooldownMs: number;
}

const DEFAULT_CONFIG: StrategyManagerConfig = {
  enableMomentum: true,
  enableMeanReversion: true,
  enableOrderbookImbalance: true,
  enableProbabilitySum: true, // NEW: Enabled by default - most reliable strategy
  enableEndgame: true, // NEW: Enabled by default
  maxConcurrentSignals: 5, // Increased from 3
  signalCooldownMs: 15000, // Reduced from 30 seconds to 15 seconds
};

/**
 * Strategy Manager
 * Coordinates multiple trading strategies and generates unified signals
 * 
 * STRATEGIES:
 * 1. ProbabilitySum - Arbitrage when YES + NO != $1 (most reliable)
 * 2. Endgame - Buy high probability outcomes near resolution
 * 3. Momentum - Follow price trends
 * 4. MeanReversion - Fade extreme moves
 * 5. OrderbookImbalance - Trade on bid/ask volume imbalance
 */
export class StrategyManager extends EventEmitter {
  private log: Logger;
  private config: StrategyManagerConfig;

  // Price tracking
  private priceTracker: PriceHistoryTracker;

  // Technical Analysis Strategies
  private momentumStrategy: MomentumStrategy;
  private meanReversionStrategy: MeanReversionStrategy;
  private orderbookImbalanceStrategy: OrderbookImbalanceStrategy;

  // Prediction Market-Specific Strategies (NEW)
  private probabilitySumStrategy: ProbabilitySumStrategy;
  private endgameStrategy: EndgameStrategy;

  // Signal management
  private signalCooldowns: Map<string, Date> = new Map();
  
  // Debug tracking
  private lastScanStats: {
    marketsScanned: number;
    marketsWithPriceHistory: number;
    signalsGenerated: number;
    timestamp: Date;
  } = { marketsScanned: 0, marketsWithPriceHistory: 0, signalsGenerated: 0, timestamp: new Date() };

  constructor(config?: Partial<StrategyManagerConfig>) {
    super();
    this.log = logger('StrategyManager');
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components (reduced interval for faster data collection)
    this.priceTracker = new PriceHistoryTracker(1000, 500);
    
    // Technical analysis strategies
    this.momentumStrategy = new MomentumStrategy();
    this.meanReversionStrategy = new MeanReversionStrategy();
    this.orderbookImbalanceStrategy = new OrderbookImbalanceStrategy();
    
    // NEW: Prediction market-specific strategies
    this.probabilitySumStrategy = new ProbabilitySumStrategy();
    this.endgameStrategy = new EndgameStrategy();

    // Forward signals from strategies
    this.setupEventForwarding();
    
    this.log.info('Strategy manager initialized', {
      enableMomentum: this.config.enableMomentum,
      enableMeanReversion: this.config.enableMeanReversion,
      enableOrderbookImbalance: this.config.enableOrderbookImbalance,
      enableProbabilitySum: this.config.enableProbabilitySum,
      enableEndgame: this.config.enableEndgame,
    });
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

    // === PREDICTION MARKET-SPECIFIC STRATEGIES (highest priority) ===
    
    // Run probability sum strategy (doesn't need price history!)
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

    // Run endgame strategy (doesn't need price history!)
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

    // Run momentum strategy
    if (this.config.enableMomentum && stats) {
      const signal = this.momentumStrategy.analyze(market, stats);
      if (signal) {
        signals.push(signal);
        this.log.info('Momentum signal generated', {
          market: market.title.substring(0, 40),
          confidence: signal.confidence.toFixed(2),
        });
      }
    }

    // Run mean reversion strategy
    if (this.config.enableMeanReversion && stats) {
      const signal = this.meanReversionStrategy.analyze(market, stats);
      if (signal) {
        signals.push(signal);
        this.log.info('MeanReversion signal generated', {
          market: market.title.substring(0, 40),
          confidence: signal.confidence.toFixed(2),
        });
      }
    }

    // Run orderbook imbalance strategy
    if (this.config.enableOrderbookImbalance && orderbook) {
      const signal = this.orderbookImbalanceStrategy.analyze(market, orderbook);
      if (signal) {
        signals.push(signal);
        this.log.info('OrderbookImbalance signal generated', {
          market: market.title.substring(0, 40),
          confidence: signal.confidence.toFixed(2),
        });
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
    let marketsWithPriceHistory = 0;

    for (const market of markets) {
      const orderbook = orderbooks?.get(market.externalId);
      const signals = this.analyzeMarket(market, orderbook);
      allSignals.push(...signals);
      
      // Track price history availability
      if (this.priceTracker.getStats(market.externalId, 60) !== null) {
        marketsWithPriceHistory++;
      }
    }

    // Update debug stats
    this.lastScanStats = {
      marketsScanned: markets.length,
      marketsWithPriceHistory,
      signalsGenerated: allSignals.length,
      timestamp: new Date(),
    };

    // Log scan summary periodically (every 10th scan or when signals found)
    if (allSignals.length > 0 || Math.random() < 0.1) {
      this.log.info('Market scan summary', {
        marketsScanned: markets.length,
        marketsWithPriceHistory,
        signalsGenerated: allSignals.length,
        strategies: allSignals.length > 0 ? [...new Set(allSignals.map(s => s.strategy))].join(', ') : 'none',
      });
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
   * Get last scan statistics (for debugging)
   */
  getLastScanStats(): typeof this.lastScanStats {
    return { ...this.lastScanStats };
  }

  /**
   * Get price tracker summary (for debugging)
   */
  getPriceTrackerSummary(): Array<{ marketId: string; pointCount: number; hasStats: boolean }> {
    return this.priceTracker.getTrackedMarketsSummary();
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
      this.log.info('Significant price move detected', data);
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
