/**
 * Copy Trading Service
 *
 * Main orchestrator for copy trading functionality.
 * Coordinates between:
 * - TraderMonitor: Detects new trades from tracked traders
 * - PositionSizingStrategy: Calculates appropriate copy sizes
 * - TradeAggregator: Combines small trades into larger orders
 * - PositionTracker: Tracks positions for accurate sell calculations
 * - OrderManager: Executes the copy trades
 */

import { EventEmitter } from 'events';
import type { OrderManager } from '../orderManager/index.js';
import type { PolymarketClient } from '../../clients/polymarket/index.js';
import type {
  TraderCopyConfig,
  DetectedTrade,
  CopyTradeResult,
  CopyTradingState,
  CopyPosition,
  AggregatedTrade,
  PolymarketPosition,
} from './types.js';
import type { CopyTradingConfig } from '../../config/schema.js';
import { TraderMonitor } from './TraderMonitor.js';
import { PositionTracker } from './PositionTracker.js';
import { TradeAggregator } from './TradeAggregator.js';
import { calculateOrderSizeForTrader } from './PositionSizingStrategy.js';
import { createComponentLogger } from '../../utils/logger.js';
import * as metrics from '../../utils/metrics.js';
import { PLATFORMS, ORDER_SIDES, ORDER_TYPES } from '../../config/constants.js';

const log = createComponentLogger('CopyTradingService');

/**
 * Copy Trading Service
 */
export class CopyTradingService extends EventEmitter {
  private config: CopyTradingConfig;
  private orderManager: OrderManager;
  // polymarketClient reserved for future use - passed via constructor

  // Sub-services
  private traderMonitor: TraderMonitor;
  private positionTracker: PositionTracker;
  private tradeAggregator: TradeAggregator;

  // State
  private isRunning: boolean = false;
  private trackedTraders: Map<string, TraderCopyConfig> = new Map();
  private totalCopiedTrades: number = 0;
  private lastTradeAt?: Date;
  private lastError?: Error;
  private lastErrorAt?: Date;

  // Copy delay queue
  private pendingCopies: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    polymarketClient: PolymarketClient,
    orderManager: OrderManager,
    config: CopyTradingConfig
  ) {
    super();
    this.config = config;
    this.orderManager = orderManager;
    // polymarketClient stored for future use
    void polymarketClient;

    // Initialize sub-services
    this.traderMonitor = new TraderMonitor({
      pollIntervalMs: config.pollIntervalMs,
      maxAgeHours: 1, // Only process trades from last hour
    });

    this.positionTracker = new PositionTracker();

    this.tradeAggregator = new TradeAggregator({
      enabled: config.aggregationEnabled,
      windowMs: config.aggregationWindowMs,
      minTrades: config.aggregationMinTrades,
      minTotalUsd: 1.0, // Polymarket minimum
    });

    // Wire up events
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for sub-services
   */
  private setupEventHandlers(): void {
    // Handle detected trades from monitor
    this.traderMonitor.on('tradeDetected', (trade: DetectedTrade) => {
      this.handleDetectedTrade(trade);
    });

    // Handle position updates
    this.traderMonitor.on('traderPositionsUpdated', (address: string, positions: PolymarketPosition[]) => {
      this.handlePositionsUpdate(address, positions);
    });

    // Handle monitor errors
    this.traderMonitor.on('error', (error: Error, traderAddress?: string) => {
      this.handleError(error, { traderAddress });
    });

    // Handle aggregation ready
    this.tradeAggregator.on('aggregationReady', (group: AggregatedTrade) => {
      this.executeAggregatedTrade(group);
    });

    // Handle aggregation expired
    this.tradeAggregator.on('aggregationExpired', (group: AggregatedTrade) => {
      // Mark all trades in group as skipped
      for (const trade of group.trades) {
        this.emit('tradeSkipped', trade, 'Aggregation expired - below minimum');
        metrics.copyTradingTradesSkipped.labels(trade.traderAddress, 'aggregation_expired').inc();
      }
    });

    // Forward position events
    this.positionTracker.on('positionOpened', (position: CopyPosition) => {
      this.emit('positionOpened', position);
    });

    this.positionTracker.on('positionClosed', (position: CopyPosition, pnl: number) => {
      this.emit('positionClosed', position, pnl);
    });
  }

  /**
   * Handle a newly detected trade
   */
  private async handleDetectedTrade(trade: DetectedTrade): Promise<void> {
    this.emit('tradeDetected', trade);

    const traderConfig = this.trackedTraders.get(trade.traderAddress.toLowerCase());
    if (!traderConfig || !traderConfig.isActive) {
      log.debug('Ignoring trade from inactive/unknown trader', {
        trader: trade.traderAddress.slice(0, 10),
      });
      return;
    }

    // Calculate the copy size
    const balance = await this.getAvailableBalance();
    const currentExposure = this.positionTracker.getTotalExposure(traderConfig.id || traderConfig.address);

    const sizing = calculateOrderSizeForTrader(
      traderConfig,
      trade.usdcSize,
      balance,
      currentExposure
    );

    log.info('Copy size calculated', {
      trader: trade.traderAddress.slice(0, 10),
      traderSize: trade.usdcSize.toFixed(2),
      copySize: sizing.finalAmount.toFixed(2),
      reasoning: sizing.reasoning,
    });

    // Check if below minimum - add to aggregation buffer
    if (sizing.belowMinimum && this.tradeAggregator.isEnabled()) {
      log.debug('Adding small trade to aggregation', {
        tradeId: trade.id,
        size: sizing.finalAmount.toFixed(2),
      });

      this.tradeAggregator.addTrade(trade);
      return;
    }

    // Skip if below minimum and aggregation disabled
    if (sizing.belowMinimum) {
      log.info('Trade skipped - below minimum', {
        tradeId: trade.id,
        calculatedSize: sizing.finalAmount.toFixed(2),
        minSize: traderConfig.minTradeSize,
      });

      this.emit('tradeSkipped', trade, 'Below minimum size');
      metrics.copyTradingTradesSkipped.labels(trade.traderAddress, 'below_minimum').inc();
      return;
    }

    // Apply copy delay to avoid front-running detection
    if (this.config.copyDelayMs > 0) {
      const delayKey = `${trade.traderAddress}:${trade.id}`;
      const timer = setTimeout(() => {
        this.pendingCopies.delete(delayKey);
        this.executeCopyTrade(trade, sizing.finalAmount, sizing.multiplierUsed, traderConfig);
      }, this.config.copyDelayMs);

      this.pendingCopies.set(delayKey, timer);
    } else {
      await this.executeCopyTrade(trade, sizing.finalAmount, sizing.multiplierUsed, traderConfig);
    }
  }

  /**
   * Execute a copy trade
   */
  private async executeCopyTrade(
    trade: DetectedTrade,
    copySize: number,
    multiplierUsed: number,
    traderConfig: TraderCopyConfig
  ): Promise<CopyTradeResult> {
    const startTime = Date.now();

    try {
      log.info('Executing copy trade', {
        trader: trade.traderAddress.slice(0, 10),
        side: trade.side,
        market: trade.marketTitle?.slice(0, 40) || trade.marketId,
        originalSize: trade.usdcSize.toFixed(2),
        copySize: copySize.toFixed(2),
      });

      // Calculate token amount
      const tokenAmount = copySize / trade.price;

      // Place order via OrderManager
      const order = await this.orderManager.placeOrder({
        platform: PLATFORMS.POLYMARKET,
        marketId: trade.marketId,
        outcomeId: trade.outcomeId,
        side: trade.side === 'BUY' ? ORDER_SIDES.BUY : ORDER_SIDES.SELL,
        price: trade.price,
        size: copySize,
        type: ORDER_TYPES.GTC,
        metadata: {
          copyTrading: true,
          originalTradeId: trade.id,
          traderAddress: trade.traderAddress,
          originalSize: trade.usdcSize,
          multiplierUsed,
        },
      });

      const executionLatencyMs = Date.now() - startTime;

      // Record position
      const traderId = traderConfig.id || traderConfig.address;
      if (trade.side === 'BUY') {
        this.positionTracker.recordBuy(
          traderId,
          traderConfig.address,
          trade,
          tokenAmount,
          trade.price,
          copySize
        );
      } else {
        this.positionTracker.recordSell(
          traderId,
          trade,
          tokenAmount,
          trade.price,
          copySize
        );
      }

      // Update state
      this.totalCopiedTrades++;
      this.lastTradeAt = new Date();

      // Update metrics
      metrics.copyTradingTradesCopied
        .labels(trade.traderAddress, traderConfig.sizingStrategy, trade.side)
        .inc();
      metrics.copyTradingCopyLatency.labels(trade.traderAddress).observe(executionLatencyMs);

      const result: CopyTradeResult = {
        success: true,
        originalTrade: trade,
        copiedOrderId: order.id,
        copiedPrice: trade.price,
        copiedSize: tokenAmount,
        copiedUsdcSize: copySize,
        multiplierUsed,
        executionLatencyMs,
      };

      this.emit('tradeCopied', result);

      log.info('Copy trade executed', {
        orderId: order.id,
        side: trade.side,
        copySize: copySize.toFixed(2),
        latencyMs: executionLatencyMs,
      });

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      log.error('Copy trade failed', {
        trader: trade.traderAddress.slice(0, 10),
        error: err.message,
      });

      // Update metrics
      metrics.copyTradingTradesFailed.labels(trade.traderAddress, err.name).inc();

      const result: CopyTradeResult = {
        success: false,
        originalTrade: trade,
        error: err.message,
      };

      this.emit('tradeFailed', trade, err);
      this.handleError(err, { trade });

      return result;
    }
  }

  /**
   * Execute an aggregated trade
   */
  private async executeAggregatedTrade(group: AggregatedTrade): Promise<void> {
    const traderConfig = this.trackedTraders.get(group.traderAddress.toLowerCase());
    if (!traderConfig || !traderConfig.isActive) {
      log.warn('Skipping aggregated trade - trader not active', {
        trader: group.traderAddress.slice(0, 10),
      });
      return;
    }

    log.info('Executing aggregated trade', {
      groupId: group.groupId,
      trades: group.trades.length,
      totalSize: group.totalUsdcSize.toFixed(2),
      avgPrice: group.avgPrice.toFixed(4),
    });

    // Create synthetic trade for execution
    const syntheticTrade: DetectedTrade = {
      id: group.groupId,
      traderAddress: group.traderAddress,
      marketId: group.marketId,
      outcomeId: group.outcomeId,
      outcomeName: group.outcomeName,
      side: group.side,
      price: group.avgPrice,
      size: group.totalSize,
      usdcSize: group.totalUsdcSize,
      timestamp: group.lastTradeAt,
    };

    // Calculate copy size
    const balance = await this.getAvailableBalance();
    const currentExposure = this.positionTracker.getTotalExposure(traderConfig.id || traderConfig.address);

    const sizing = calculateOrderSizeForTrader(
      traderConfig,
      group.totalUsdcSize,
      balance,
      currentExposure
    );

    if (sizing.belowMinimum) {
      log.warn('Aggregated trade still below minimum', {
        groupId: group.groupId,
        calculatedSize: sizing.finalAmount.toFixed(2),
      });
      return;
    }

    await this.executeCopyTrade(
      syntheticTrade,
      sizing.finalAmount,
      sizing.multiplierUsed,
      traderConfig
    );
  }

  /**
   * Handle positions update from trader
   */
  private handlePositionsUpdate(_traderAddress: string, positions: PolymarketPosition[]): void {
    // Update position prices in tracker
    const prices = new Map<string, number>();
    for (const pos of positions) {
      prices.set(`${pos.conditionId}:${pos.asset}`, pos.curPrice);
    }
    this.positionTracker.updatePrices(prices);
  }

  /**
   * Handle errors
   */
  private handleError(error: Error, context?: Record<string, unknown>): void {
    this.lastError = error;
    this.lastErrorAt = new Date();
    this.emit('error', error, context);
  }

  /**
   * Get available balance for copy trading
   */
  private async getAvailableBalance(): Promise<number> {
    try {
      const balances = await this.orderManager.getBalance(PLATFORMS.POLYMARKET);
      return balances.available;
    } catch {
      return 0;
    }
  }

  // ========================================
  // Public API
  // ========================================

  /**
   * Start copy trading service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Copy trading service already running');
      return;
    }

    if (!this.config.enabled) {
      log.warn('Copy trading is disabled in config');
      return;
    }

    log.info('Starting copy trading service', {
      trackedTraders: this.trackedTraders.size,
      pollInterval: this.config.pollIntervalMs,
      aggregationEnabled: this.config.aggregationEnabled,
    });

    this.isRunning = true;

    // Add tracked traders to monitor
    for (const [_address, config] of this.trackedTraders.entries()) {
      this.traderMonitor.addTrader(config);
    }

    // Start monitoring
    await this.traderMonitor.start();

    this.emit('started');
  }

  /**
   * Stop copy trading service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    log.info('Stopping copy trading service');

    this.isRunning = false;

    // Stop monitor
    this.traderMonitor.stop();

    // Cancel pending copies
    for (const timer of this.pendingCopies.values()) {
      clearTimeout(timer);
    }
    this.pendingCopies.clear();

    // Flush aggregations
    this.tradeAggregator.flushAll();

    this.emit('stopped');
  }

  /**
   * Add a trader to copy
   */
  async addTrader(config: TraderCopyConfig): Promise<void> {
    const address = config.address.toLowerCase();

    // Generate ID if not provided
    const fullConfig: TraderCopyConfig = {
      ...config,
      id: config.id || `trader_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      address,
      sizingStrategy: config.sizingStrategy || this.config.defaultSizingStrategy,
      defaultMultiplier: config.defaultMultiplier ?? this.config.defaultMultiplier,
      copyPercentage: config.copyPercentage ?? this.config.defaultCopyPercentage,
      maxPositionSize: config.maxPositionSize ?? this.config.defaultMaxPositionSize,
      minTradeSize: config.minTradeSize ?? this.config.defaultMinTradeSize,
      maxExposure: config.maxExposure ?? this.config.maxTotalCopyExposure,
      maxPositionsPerMarket: config.maxPositionsPerMarket ?? this.config.maxPositionsPerTrader,
    };

    this.trackedTraders.set(address, fullConfig);

    if (this.isRunning) {
      this.traderMonitor.addTrader(fullConfig);
    }

    this.emit('traderAdded', fullConfig);
    log.info('Trader added', {
      address: address.slice(0, 10),
      name: fullConfig.name || 'unnamed',
      strategy: fullConfig.sizingStrategy,
    });
  }

  /**
   * Remove a trader
   */
  async removeTrader(address: string): Promise<void> {
    const normalizedAddress = address.toLowerCase();
    this.trackedTraders.delete(normalizedAddress);

    if (this.isRunning) {
      this.traderMonitor.removeTrader(normalizedAddress);
    }

    this.emit('traderRemoved', normalizedAddress);
    log.info('Trader removed', { address: normalizedAddress.slice(0, 10) });
  }

  /**
   * Update trader configuration
   */
  async updateTrader(address: string, updates: Partial<TraderCopyConfig>): Promise<void> {
    const normalizedAddress = address.toLowerCase();
    const existing = this.trackedTraders.get(normalizedAddress);

    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: new Date() };
      this.trackedTraders.set(normalizedAddress, updated);

      if (this.isRunning) {
        this.traderMonitor.updateTrader(normalizedAddress, updates);
      }

      this.emit('traderUpdated', updated);
    }
  }

  /**
   * Get all tracked traders
   */
  getTrackedTraders(): TraderCopyConfig[] {
    return Array.from(this.trackedTraders.values());
  }

  /**
   * Get a specific trader's config
   */
  getTrader(address: string): TraderCopyConfig | null {
    return this.trackedTraders.get(address.toLowerCase()) || null;
  }

  /**
   * Get all positions
   */
  getPositions(traderId?: string): CopyPosition[] {
    if (traderId) {
      return this.positionTracker.getPositionsForTrader(traderId);
    }
    return this.positionTracker.getOpenPositions();
  }

  /**
   * Get position by ID
   */
  getPosition(id: string): CopyPosition | null {
    return this.positionTracker.getPositionById(id) || null;
  }

  /**
   * Get service state
   */
  getState(): CopyTradingState {
    const stats = this.positionTracker.getStats();
    const aggStats = this.tradeAggregator.getStats();
    const activeTraders = Array.from(this.trackedTraders.values()).filter((t) => t.isActive).length;

    const state: CopyTradingState = {
      isRunning: this.isRunning,
      isMonitoring: this.traderMonitor.isMonitoring(),
      tradersMonitored: this.trackedTraders.size,
      activeTraders,
      openPositions: stats.openPositions,
      trackedTradersCount: this.trackedTraders.size,
      activePositionsCount: stats.openPositions,
      totalCopiedTrades: this.totalCopiedTrades,
      totalPnl: stats.totalRealizedPnl + stats.totalUnrealizedPnl,
      realizedPnl: stats.totalRealizedPnl,
      unrealizedPnl: stats.totalUnrealizedPnl,
      totalExposure: stats.totalValue,
      pendingAggregationsCount: aggStats.pendingGroups,
      monitoringHealthy: this.traderMonitor.isMonitoring(),
      executionHealthy: !this.lastError || (this.lastErrorAt !== undefined && Date.now() - this.lastErrorAt.getTime() > 60000),
    };
    if (this.lastTradeAt) {
      state.lastTradeAt = this.lastTradeAt;
    }
    if (this.lastErrorAt) {
      state.lastErrorAt = this.lastErrorAt;
    }
    if (this.lastError) {
      state.lastError = this.lastError.message;
    }
    return state;
  }

  /**
   * Check if service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get positions for a specific trader
   */
  getPositionsForTrader(traderAddress: string): CopyPosition[] {
    const trader = this.trackedTraders.get(traderAddress.toLowerCase());
    if (trader) {
      const traderId = trader.id || trader.address;
      return this.positionTracker.getPositionsForTrader(traderId);
    }
    return [];
  }

  /**
   * Get copy trading statistics
   */
  getStats(): {
    tradersMonitored: number;
    activeTraders: number;
    openPositions: number;
    totalCopiedTrades: number;
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalExposure: number;
    pendingAggregations: number;
  } {
    const posStats = this.positionTracker.getStats();
    const aggStats = this.tradeAggregator.getStats();
    const activeTraders = Array.from(this.trackedTraders.values()).filter((t) => t.isActive).length;

    return {
      tradersMonitored: this.trackedTraders.size,
      activeTraders,
      openPositions: posStats.openPositions,
      totalCopiedTrades: this.totalCopiedTrades,
      totalPnl: posStats.totalRealizedPnl + posStats.totalUnrealizedPnl,
      realizedPnl: posStats.totalRealizedPnl,
      unrealizedPnl: posStats.totalUnrealizedPnl,
      totalExposure: posStats.totalValue,
      pendingAggregations: aggStats.pendingGroups,
    };
  }

  /**
   * Close a copy trading position
   */
  async closePosition(positionId: string, _slippagePercent: number = 2): Promise<CopyTradeResult | null> {
    const position = this.positionTracker.getPositionById(positionId);

    if (!position || !position.isOpen) {
      log.warn('Cannot close position - not found or already closed', { positionId });
      return null;
    }

    try {
      log.info('Closing position', {
        positionId,
        market: position.marketTitle || position.marketId,
        size: position.size,
      });

      // Place sell order
      const order = await this.orderManager.placeOrder({
        platform: PLATFORMS.POLYMARKET,
        marketId: position.marketId,
        outcomeId: position.outcomeId,
        side: ORDER_SIDES.SELL,
        price: position.currentPrice || position.avgEntryPrice,
        size: position.size * (position.currentPrice || position.avgEntryPrice),
        type: ORDER_TYPES.GTC,
        metadata: {
          copyTrading: true,
          closingPosition: positionId,
        },
      });

      // Create synthetic trade for tracking
      const syntheticTrade: DetectedTrade = {
        id: `close_${positionId}`,
        traderAddress: position.traderAddress,
        marketId: position.marketId,
        outcomeId: position.outcomeId,
        outcomeName: position.outcomeName,
        ...(position.marketTitle && { marketTitle: position.marketTitle }),
        side: 'SELL',
        price: position.currentPrice || position.avgEntryPrice,
        size: position.size,
        usdcSize: position.size * (position.currentPrice || position.avgEntryPrice),
        timestamp: new Date(),
      };

      // Record the sell
      this.positionTracker.recordSell(
        position.traderId,
        syntheticTrade,
        position.size,
        position.currentPrice || position.avgEntryPrice,
        position.size * (position.currentPrice || position.avgEntryPrice)
      );

      return {
        success: true,
        originalTrade: syntheticTrade,
        copiedOrderId: order.id,
        copiedPrice: position.currentPrice || position.avgEntryPrice,
        copiedSize: position.size,
        copiedUsdcSize: position.size * (position.currentPrice || position.avgEntryPrice),
      };
    } catch (error) {
      log.error('Failed to close position', {
        positionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get copied trades history
   */
  async getCopiedTrades(_filter: {
    traderAddress?: string;
    status?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    limit?: number;
  }): Promise<Array<{
    id: string;
    traderAddress: string;
    originalTrade?: DetectedTrade;
    marketId: string;
    outcomeId: string;
    outcomeName?: string;
    marketTitle?: string;
    side: 'BUY' | 'SELL';
    originalSize: number;
    copiedSize: number;
    price: number;
    status: string;
    orderId?: string;
    errorMessage?: string;
    pnl?: number;
    copiedAt: Date;
  }>> {
    // This would normally fetch from database
    // For now, return empty array - trades are tracked via events
    // TODO: Implement database persistence for copied trades
    return [];
  }

  /**
   * Get pending aggregations
   */
  getPendingAggregations(): AggregatedTrade[] {
    return this.tradeAggregator.getPendingAggregations();
  }

  /**
   * Flush all pending aggregations
   */
  flushAggregations(): AggregatedTrade[] {
    return this.tradeAggregator.flushAll();
  }
}

export default CopyTradingService;
