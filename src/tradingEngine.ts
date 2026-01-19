import { EventEmitter } from 'events';
import type { Config } from './config/schema.js';
import { getConfig } from './config/index.js';
import { PLATFORMS } from './config/constants.js';
import type { Platform } from './config/constants.js';
import type { NormalizedMarket } from './clients/shared/interfaces.js';
import { PolymarketClient } from './clients/polymarket/PolymarketClient.js';
import { KalshiClient } from './clients/kalshi/KalshiClient.js';
import { PolymarketWebSocket } from './clients/polymarket/PolymarketWebSocket.js';
import { KalshiWebSocket } from './clients/kalshi/KalshiWebSocket.js';
import { MarketDataService, type PriceUpdate } from './services/marketData/index.js';
import { OrderManager } from './services/orderManager/index.js';
import { MarketMatcher, type MarketPair } from './services/matching/index.js';
import { ArbitrageDetector, type ArbitrageOpportunity } from './strategies/arbitrage/ArbitrageDetector.js';
import { ArbitrageExecutor, type ExecutionResult } from './strategies/arbitrage/ArbitrageExecutor.js';
import { KillSwitch } from './risk/KillSwitch.js';
import { logger, type Logger } from './utils/logger.js';
import { arbitrageOpportunities, arbitrageExecutions, arbitrageProfit } from './utils/metrics.js';

/**
 * Trading engine configuration
 */
export interface TradingEngineConfig {
  enableSinglePlatformArb: boolean;
  enableCrossPlatformArb: boolean;
  enableWebSocket: boolean;
  scanIntervalMs: number; // Fallback polling interval
  cooldownAfterExecutionMs: number;
  maxConcurrentExecutions: number;
}

/**
 * Trading engine state
 */
export interface TradingEngineState {
  isRunning: boolean;
  isInitialized: boolean;
  lastScanTime: Date | null;
  opportunitiesDetected: number;
  executionsAttempted: number;
  executionsSucceeded: number;
  totalProfit: number;
  lastError: string | null;
}

/**
 * Default trading engine configuration
 */
const DEFAULT_CONFIG: TradingEngineConfig = {
  enableSinglePlatformArb: true,
  enableCrossPlatformArb: true,
  enableWebSocket: true,
  scanIntervalMs: 5000,
  cooldownAfterExecutionMs: 1000,
  maxConcurrentExecutions: 1,
};

/**
 * Trading Engine
 * Main orchestrator that connects all components:
 * - WebSocket feeds → Market Data Service → Arbitrage Detector → Executor
 * - Integrates with Kill Switch for risk management
 */
export class TradingEngine extends EventEmitter {
  private log: Logger;
  private config: TradingEngineConfig;
  private appConfig: Config;

  // State
  private state: TradingEngineState = {
    isRunning: false,
    isInitialized: false,
    lastScanTime: null,
    opportunitiesDetected: 0,
    executionsAttempted: 0,
    executionsSucceeded: 0,
    totalProfit: 0,
    lastError: null,
  };

  // Platform clients
  private polymarketClient: PolymarketClient;
  private kalshiClient: KalshiClient;

  // WebSocket clients
  private polyWs: PolymarketWebSocket;
  private kalshiWs: KalshiWebSocket;

  // Services
  private marketDataService: MarketDataService;
  private orderManager: OrderManager;
  private marketMatcher: MarketMatcher;

  // Strategies
  private arbitrageDetector: ArbitrageDetector;
  private arbitrageExecutor: ArbitrageExecutor;

  // Risk
  private killSwitch: KillSwitch;

  // Tracking
  private markets: Map<Platform, NormalizedMarket[]> = new Map();
  private matchedPairs: MarketPair[] = [];
  private pollingInterval: NodeJS.Timeout | null = null;
  private cooldownUntil: Date | null = null;
  private isProcessingUpdate = false;

  constructor(
    polyClient: PolymarketClient,
    kalshiClient: KalshiClient,
    orderManager: OrderManager,
    options?: Partial<TradingEngineConfig>
  ) {
    super();
    this.log = logger('TradingEngine');
    this.appConfig = getConfig();

    // Merge config
    this.config = {
      ...DEFAULT_CONFIG,
      enableSinglePlatformArb: this.appConfig.features.enableSinglePlatformArb,
      enableCrossPlatformArb: this.appConfig.features.enableCrossPlatformArb,
      enableWebSocket: this.appConfig.features.enableWebSocket,
      ...options,
    };

    // Store clients
    this.polymarketClient = polyClient;
    this.kalshiClient = kalshiClient;
    this.orderManager = orderManager;

    // Create WebSocket clients
    this.polyWs = new PolymarketWebSocket(this.appConfig.polymarket);
    this.kalshiWs = new KalshiWebSocket(this.appConfig.kalshi);

    // Create market data service
    this.marketDataService = new MarketDataService(this.polyWs, this.kalshiWs);

    // Create market matcher
    this.marketMatcher = new MarketMatcher();

    // Create strategies
    this.arbitrageDetector = new ArbitrageDetector();
    this.arbitrageExecutor = new ArbitrageExecutor(this.orderManager);

    // Create risk management
    this.killSwitch = new KillSwitch(this.orderManager);

    this.setupEventListeners();
  }

  /**
   * Initialize the trading engine (connects clients, fetches markets)
   */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      this.log.warn('Already initialized');
      return;
    }

    this.log.info('Initializing trading engine...');

    try {
      // Ensure platform clients are connected
      if (!this.polymarketClient.isConnected()) {
        await this.polymarketClient.connect();
      }
      if (!this.kalshiClient.isConnected()) {
        await this.kalshiClient.connect();
      }

      // Fetch initial markets
      await this.refreshMarkets();

      // Find matched market pairs
      if (this.config.enableCrossPlatformArb) {
        await this.refreshMatchedPairs();
      }

      // Connect market data service if WebSocket enabled
      if (this.config.enableWebSocket) {
        await this.marketDataService.connect();
        this.subscribeToTrackedMarkets();
      }

      this.state.isInitialized = true;
      this.emit('initialized');
      this.log.info('Trading engine initialized', {
        polymarketMarkets: this.markets.get(PLATFORMS.POLYMARKET)?.length ?? 0,
        kalshiMarkets: this.markets.get(PLATFORMS.KALSHI)?.length ?? 0,
        matchedPairs: this.matchedPairs.length,
      });
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to initialize trading engine', { error: this.state.lastError });
      throw error;
    }
  }

  /**
   * Start the trading loop
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      this.log.warn('Trading engine already running');
      return;
    }

    if (!this.state.isInitialized) {
      await this.initialize();
    }

    this.log.info('Starting trading engine...');
    this.state.isRunning = true;

    // Start kill switch monitoring
    this.killSwitch.start();

    // Start polling interval as fallback
    if (this.config.scanIntervalMs > 0) {
      this.pollingInterval = setInterval(
        () => this.scanForOpportunities(),
        this.config.scanIntervalMs
      );
    }

    this.emit('started');
    this.log.info('Trading engine started', {
      singlePlatformArb: this.config.enableSinglePlatformArb,
      crossPlatformArb: this.config.enableCrossPlatformArb,
      webSocket: this.config.enableWebSocket,
    });
  }

  /**
   * Stop the trading loop
   */
  async stop(): Promise<void> {
    if (!this.state.isRunning) {
      this.log.warn('Trading engine not running');
      return;
    }

    this.log.info('Stopping trading engine...');
    this.state.isRunning = false;

    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Stop kill switch monitoring
    this.killSwitch.stop();

    // Disconnect market data service
    await this.marketDataService.disconnect();

    // Cancel any open orders
    try {
      await this.orderManager.cancelAllOrders();
    } catch (error) {
      this.log.error('Error cancelling orders during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.emit('stopped');
    this.log.info('Trading engine stopped');
  }

  /**
   * Get current engine state
   */
  getState(): TradingEngineState {
    return { ...this.state };
  }

  /**
   * Get matched market pairs
   */
  getMatchedPairs(): MarketPair[] {
    return [...this.matchedPairs];
  }

  /**
   * Get all tracked markets
   */
  getMarkets(): Map<Platform, NormalizedMarket[]> {
    return new Map(this.markets);
  }

  /**
   * Manually trigger a scan for opportunities
   */
  async triggerScan(): Promise<ArbitrageOpportunity[]> {
    return this.scanForOpportunities();
  }

  // ============================================
  // Private Methods
  // ============================================

  private setupEventListeners(): void {
    // Market data price updates
    this.marketDataService.on('priceUpdate', (update: PriceUpdate) => {
      this.onPriceUpdate(update);
    });

    // Connection status changes
    this.marketDataService.on('connectionStatus', ({ platform, status }) => {
      this.log.info('Connection status changed', { platform, status });
      this.emit('connectionStatus', { platform, status });
    });

    // Market data errors
    this.marketDataService.on('error', ({ platform, error }) => {
      this.log.error('Market data error', { platform, error: error.message });
      this.killSwitch.recordApiCall(false);
    });

    // Arbitrage executor events
    this.arbitrageExecutor.on('execution', (result: ExecutionResult) => {
      this.onExecutionComplete(result);
    });

    this.arbitrageExecutor.on('executionFailed', (error: Error) => {
      this.log.error('Execution failed', { error: error.message });
    });

    // Kill switch events
    this.killSwitch.on('activated', ({ trigger, message }) => {
      this.log.error('Kill switch activated', { trigger, message });
      this.emit('killSwitchActivated', { trigger, message });
    });

    this.killSwitch.on('reset', () => {
      this.log.info('Kill switch reset');
      this.emit('killSwitchReset');
    });
  }

  private async onPriceUpdate(_update: PriceUpdate): Promise<void> {
    // Skip if not running or processing another update
    if (!this.state.isRunning || this.isProcessingUpdate) {
      return;
    }

    // Skip if kill switch is active
    if (this.killSwitch.isActive()) {
      return;
    }

    // Skip if in cooldown
    if (this.cooldownUntil && new Date() < this.cooldownUntil) {
      return;
    }

    // Debounce - only scan occasionally on price updates
    // The actual debouncing is done in MarketDataService, but we add an extra check here
    const now = Date.now();
    if (this.state.lastScanTime && now - this.state.lastScanTime.getTime() < 500) {
      return;
    }

    await this.scanForOpportunities();
  }

  private async scanForOpportunities(): Promise<ArbitrageOpportunity[]> {
    if (this.isProcessingUpdate) {
      return [];
    }

    this.isProcessingUpdate = true;
    this.state.lastScanTime = new Date();

    try {
      const opportunities: ArbitrageOpportunity[] = [];

      // Single-platform arbitrage
      if (this.config.enableSinglePlatformArb) {
        const polymarketMarkets = this.markets.get(PLATFORMS.POLYMARKET) ?? [];
        const kalshiMarkets = this.markets.get(PLATFORMS.KALSHI) ?? [];

        const singlePlatformOpps = [
          ...this.arbitrageDetector.scanSinglePlatform(polymarketMarkets),
          ...this.arbitrageDetector.scanSinglePlatform(kalshiMarkets),
        ];

        opportunities.push(...singlePlatformOpps);
      }

      // Cross-platform arbitrage
      if (this.config.enableCrossPlatformArb && this.matchedPairs.length > 0) {
        const crossPlatformOpps = this.arbitrageDetector.scanCrossPlatform(this.matchedPairs);
        opportunities.push(...crossPlatformOpps);
      }

      // Update metrics and state
      if (opportunities.length > 0) {
        this.state.opportunitiesDetected += opportunities.length;

        for (const opp of opportunities) {
          arbitrageOpportunities.labels(opp.type).inc();
        }

        this.log.debug('Opportunities detected', {
          count: opportunities.length,
          bestProfit: opportunities.reduce((max, o) => Math.max(max, o.maxProfit), 0),
        });

        // Execute best opportunity
        await this.executeBestOpportunity(opportunities);
      }

      return opportunities;
    } catch (error) {
      this.log.error('Error during scan', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    } finally {
      this.isProcessingUpdate = false;
    }
  }

  private async executeBestOpportunity(opportunities: ArbitrageOpportunity[]): Promise<void> {
    // Sort by expected profit
    const sorted = opportunities.sort((a, b) => b.maxProfit - a.maxProfit);
    const bestOpp = sorted[0];

    if (!bestOpp || !bestOpp.isValid) {
      return;
    }

    // Check kill switch one more time
    if (this.killSwitch.isActive()) {
      this.log.warn('Skipping execution - kill switch active');
      return;
    }

    this.log.info('Executing opportunity', {
      id: bestOpp.id,
      type: bestOpp.type,
      expectedProfit: bestOpp.maxProfit,
      spreadBps: bestOpp.spreadBps,
    });

    this.state.executionsAttempted++;

    try {
      const result = await this.arbitrageExecutor.execute(bestOpp);
      this.onExecutionComplete(result);
    } catch (error) {
      this.log.error('Execution error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private onExecutionComplete(result: ExecutionResult): void {
    // Update state
    if (result.success) {
      this.state.executionsSucceeded++;
      this.state.totalProfit += result.profit;
      arbitrageProfit.observe(result.profit);
      arbitrageExecutions.labels(result.opportunity.type, 'success').inc();
    } else if (result.partialFill) {
      arbitrageExecutions.labels(result.opportunity.type, 'partial').inc();
    } else {
      arbitrageExecutions.labels(result.opportunity.type, 'failed').inc();
    }

    // Start cooldown
    this.cooldownUntil = new Date(Date.now() + this.config.cooldownAfterExecutionMs);

    // Update kill switch metrics
    this.killSwitch.updateDailyPnl(result.profit);

    this.emit('executionComplete', result);

    this.log.info('Execution complete', {
      success: result.success,
      profit: result.profit,
      executionTimeMs: result.executionTimeMs,
    });
  }

  private async refreshMarkets(): Promise<void> {
    this.log.debug('Refreshing markets...');

    try {
      const [polymarketMarkets, kalshiMarkets] = await Promise.all([
        this.polymarketClient.getMarkets({ activeOnly: true, limit: 100 }),
        this.kalshiClient.getMarkets({ activeOnly: true, limit: 100 }),
      ]);

      this.markets.set(PLATFORMS.POLYMARKET, polymarketMarkets);
      this.markets.set(PLATFORMS.KALSHI, kalshiMarkets);

      this.log.info('Markets refreshed', {
        polymarket: polymarketMarkets.length,
        kalshi: kalshiMarkets.length,
      });
    } catch (error) {
      this.log.error('Failed to refresh markets', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshMatchedPairs(): Promise<void> {
    this.log.debug('Refreshing matched pairs...');

    try {
      const polymarketMarkets = this.markets.get(PLATFORMS.POLYMARKET) ?? [];
      const kalshiMarkets = this.markets.get(PLATFORMS.KALSHI) ?? [];

      this.matchedPairs = await this.marketMatcher.findMatches(polymarketMarkets, kalshiMarkets);

      this.log.info('Matched pairs refreshed', { count: this.matchedPairs.length });
    } catch (error) {
      this.log.error('Failed to refresh matched pairs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private subscribeToTrackedMarkets(): void {
    // Subscribe to Polymarket markets
    const polymarketMarkets = this.markets.get(PLATFORMS.POLYMARKET) ?? [];
    for (const market of polymarketMarkets.slice(0, 20)) {
      // Limit to top 20 for now
      const outcomeIds = market.outcomes.map((o) => o.externalId);
      this.marketDataService.trackMarket(PLATFORMS.POLYMARKET, market.externalId, outcomeIds);
    }

    // Subscribe to Kalshi markets
    const kalshiMarkets = this.markets.get(PLATFORMS.KALSHI) ?? [];
    for (const market of kalshiMarkets.slice(0, 20)) {
      // Limit to top 20 for now
      const outcomeIds = market.outcomes.map((o) => o.externalId);
      this.marketDataService.trackMarket(PLATFORMS.KALSHI, market.externalId, outcomeIds);
    }

    this.log.info('Subscribed to tracked markets', {
      polymarket: Math.min(polymarketMarkets.length, 20),
      kalshi: Math.min(kalshiMarkets.length, 20),
    });
  }
}
