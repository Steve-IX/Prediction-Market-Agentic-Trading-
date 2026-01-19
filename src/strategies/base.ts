import { EventEmitter } from 'events';
import type { OrderRequest, Position, Trade } from '../clients/shared/interfaces.js';
import type { OrderManager } from '../services/orderManager/index.js';
import { logger, type Logger } from '../utils/logger.js';

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  /**
   * Strategy identifier
   */
  id: string;
  /**
   * Strategy name
   */
  name: string;
  /**
   * Whether the strategy is enabled
   */
  enabled: boolean;
  /**
   * Additional strategy-specific configuration
   */
  [key: string]: unknown;
}

/**
 * Strategy state
 */
export interface StrategyState {
  /**
   * Whether the strategy is running
   */
  isRunning: boolean;
  /**
   * Number of orders placed
   */
  ordersPlaced: number;
  /**
   * Number of trades executed
   */
  tradesExecuted: number;
  /**
   * Total P&L
   */
  totalPnl: number;
  /**
   * Last error message
   */
  lastError: string | null;
  /**
   * Started at timestamp
   */
  startedAt: Date | null;
}

/**
 * Base Strategy Class
 * All trading strategies should extend this class
 */
export abstract class BaseStrategy extends EventEmitter {
  protected log: Logger;
  protected config: StrategyConfig;
  protected orderManager: OrderManager;
  protected state: StrategyState;

  constructor(config: StrategyConfig, orderManager: OrderManager) {
    super();
    this.config = config;
    this.orderManager = orderManager;
    this.log = logger(`Strategy:${config.id}`);

    this.state = {
      isRunning: false,
      ordersPlaced: 0,
      tradesExecuted: 0,
      totalPnl: 0,
      lastError: null,
      startedAt: null,
    };

    // Listen to order manager events
    this.orderManager.on('fill', (data) => this.onFill(data));
    this.orderManager.on('trade', (data) => this.onTrade(data));
    this.orderManager.on('positionUpdate', (data) => this.onPositionUpdate(data));
  }

  /**
   * Start the strategy
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      this.log.warn('Strategy already running');
      return;
    }

    if (!this.config.enabled) {
      throw new Error(`Strategy ${this.config.id} is not enabled`);
    }

    try {
      await this.onStart();
      this.state.isRunning = true;
      this.state.startedAt = new Date();
      this.state.lastError = null;
      this.log.info('Strategy started');
      this.emit('started');
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to start strategy', { error });
      throw error;
    }
  }

  /**
   * Stop the strategy
   */
  async stop(): Promise<void> {
    if (!this.state.isRunning) {
      return;
    }

    try {
      await this.onStop();
      this.state.isRunning = false;
      this.log.info('Strategy stopped');
      this.emit('stopped');
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to stop strategy', { error });
      throw error;
    }
  }

  /**
   * Get strategy state
   */
  getState(): StrategyState {
    return { ...this.state };
  }

  /**
   * Get strategy configuration
   */
  getConfig(): StrategyConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...updates };
    this.log.info('Configuration updated', { updates });
    this.emit('configUpdated', this.config);
  }

  /**
   * Place an order through the order manager
   */
  protected async placeOrder(order: OrderRequest): Promise<void> {
    try {
      await this.orderManager.placeOrder({
        ...order,
        strategyId: this.config.id,
      });
      this.state.ordersPlaced++;
      this.emit('orderPlaced', order);
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to place order', { order, error });
      this.emit('orderError', { order, error });
      throw error;
    }
  }

  /**
   * Get positions for this strategy
   */
  protected async getPositions(platform?: string): Promise<Position[]> {
    const allPositions = await this.orderManager.getPositions(platform);
    return allPositions.filter((p) => p.strategyId === this.config.id);
  }

  /**
   * Calculate P&L for this strategy
   */
  protected async calculatePnl(): Promise<number> {
    const positions = await this.getPositions();
    let totalPnl = 0;

    for (const position of positions) {
      if (position.realizedPnl !== undefined) {
        totalPnl += Number(position.realizedPnl);
      }
      if (position.unrealizedPnl !== undefined) {
        totalPnl += Number(position.unrealizedPnl);
      }
    }

    this.state.totalPnl = totalPnl;
    return totalPnl;
  }

  /**
   * Abstract method: Strategy-specific start logic
   */
  protected abstract onStart(): Promise<void>;

  /**
   * Abstract method: Strategy-specific stop logic
   */
  protected abstract onStop(): Promise<void>;

  /**
   * Handle order fill
   */
  protected onFill(_data: { orderId: string; filledSize: number; avgPrice: number }): void {
    // Override in subclasses if needed
  }

  /**
   * Handle trade execution
   */
  protected onTrade(trade: Trade): void {
    if (trade.strategyId === this.config.id) {
      this.state.tradesExecuted++;
      this.emit('trade', trade);
    }
  }

  /**
   * Handle position update
   */
  protected onPositionUpdate(position: Position): void {
    if (position.strategyId === this.config.id) {
      this.emit('positionUpdate', position);
      // Recalculate P&L
      this.calculatePnl().catch((error) => {
        this.log.error('Failed to calculate P&L', { error });
      });
    }
  }

  /**
   * Reset strategy state (for testing)
   */
  reset(): void {
    this.state = {
      isRunning: false,
      ordersPlaced: 0,
      tradesExecuted: 0,
      totalPnl: 0,
      lastError: null,
      startedAt: null,
    };
    this.log.info('Strategy state reset');
  }
}
