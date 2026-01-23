import { EventEmitter } from 'events';
import type {
  IPlatformClient,
  OrderRequest,
  NormalizedOrder,
  Position,
  Trade,
  AccountBalance,
} from '../../clients/shared/interfaces.js';
import { PaperTradingEngine } from './PaperTradingEngine.js';
import { logger, type Logger } from '../../utils/logger.js';
import { isPaperTrading, getConfig } from '../../config/index.js';
import { PLATFORMS } from '../../config/constants.js';
import {
  PositionLimitsManager,
  ExposureTracker,
  type KillSwitch,
} from '../../risk/index.js';

/**
 * Order Manager
 * Routes orders to appropriate platform client or paper trading engine
 */
export class OrderManager extends EventEmitter {
  private log: Logger;
  private clients: Map<string, IPlatformClient>;
  private paperEngine: PaperTradingEngine | null;
  private usePaperTrading: boolean;
  private positionLimits: PositionLimitsManager;
  private exposureTracker: ExposureTracker;
  private killSwitch: KillSwitch | null = null;

  constructor() {
    super();
    this.log = logger('OrderManager');
    this.clients = new Map();
    this.usePaperTrading = isPaperTrading();

    // Initialize risk management
    this.positionLimits = new PositionLimitsManager();
    this.exposureTracker = new ExposureTracker();

    // Listen to position updates from risk managers
    this.positionLimits.on('positionUpdate', (position) => {
      this.exposureTracker.updatePosition(position);
    });

    if (this.usePaperTrading) {
      const config = getConfig();
      this.paperEngine = new PaperTradingEngine({
        initialBalance: config.trading.paperTradingBalance,
      });

      // Forward events from paper engine
      this.paperEngine.on('fill', (data) => this.emit('fill', data));
      this.paperEngine.on('trade', (data) => this.emit('trade', data));
      this.paperEngine.on('positionUpdate', (data) => {
        this.positionLimits.updatePosition(data);
        this.emit('positionUpdate', data);
      });

      this.log.info('Order manager initialized in paper trading mode', {
        balance: config.trading.paperTradingBalance,
      });
    } else {
      this.paperEngine = null;
      this.log.info('Order manager initialized in live trading mode');
    }
  }

  /**
   * Set kill switch reference
   */
  setKillSwitch(killSwitch: KillSwitch): void {
    this.killSwitch = killSwitch;
  }

  /**
   * Get position limits manager
   */
  getPositionLimits(): PositionLimitsManager {
    return this.positionLimits;
  }

  /**
   * Get exposure tracker
   */
  getExposureTracker(): ExposureTracker {
    return this.exposureTracker;
  }

  /**
   * Register a platform client
   */
  registerClient(client: IPlatformClient): void {
    this.clients.set(client.platform, client);
    this.log.info(`Registered client for ${client.platform}`);
  }

  /**
   * Get a platform client
   */
  getClient(platform: string): IPlatformClient | undefined {
    return this.clients.get(platform);
  }

  /**
   * Place an order
   */
  async placeOrder(order: OrderRequest): Promise<NormalizedOrder> {
    this.log.debug('Placing order', { order, usePaperTrading: this.usePaperTrading });

    // Check kill switch
    if (this.killSwitch?.isActive()) {
      throw new Error('Kill switch is active - trading is disabled');
    }

    // Convert order size from shares to USD
    // order.size is in SHARES, multiply by price to get USD value
    const orderPrice = Number(order.price) || 0.5;
    const orderSizeUsd = Number(order.size) * orderPrice;

    // Check minimum trade size (platform-specific)
    // Polymarket requires $1 minimum, Kalshi requires $5 minimum
    const minTradeSize = order.platform === PLATFORMS.POLYMARKET ? 1.0 : order.platform === PLATFORMS.KALSHI ? 5.0 : 1.0;

    if (orderSizeUsd < minTradeSize) {
      const errorMsg = `Order size $${orderSizeUsd.toFixed(2)} below minimum trade size of $${minTradeSize} for ${order.platform}`;
      this.log.warn('Order rejected - below minimum trade size', {
        orderSizeShares: order.size,
        orderSizeUsd,
        orderPrice,
        minTradeSize,
        platform: order.platform,
      });
      throw new Error(errorMsg);
    }

    // Risk checks
    const positionLimitCheck = this.positionLimits.checkOrder(order);
    if (!positionLimitCheck.allowed) {
      this.log.warn('Order rejected by position limits', {
        order,
        reason: positionLimitCheck.reason,
      });
      throw new Error(`Position limit check failed: ${positionLimitCheck.reason}`);
    }

    // Check exposure limit (using USD value calculated above)
    const exposureCheck = this.exposureTracker.checkExposure(orderSizeUsd, order.platform);
    if (!exposureCheck.allowed) {
      this.log.warn('Order rejected by exposure tracker', {
        order,
        orderSizeUsd,
        reason: exposureCheck.reason,
      });
      throw new Error(`Exposure check failed: ${exposureCheck.reason}`);
    }

    if (this.usePaperTrading && this.paperEngine) {
      // Get order book from real client if available for realistic fills
      const client = this.clients.get(order.platform);
      let orderBook;

      if (client?.isConnected()) {
        try {
          orderBook = await client.getOrderBook(order.marketId, order.outcomeId);
        } catch (error) {
          this.log.warn('Failed to get order book for paper trading', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return this.paperEngine.placeOrder(order, orderBook);
    }

    // Live trading
    const client = this.clients.get(order.platform);
    if (!client) {
      throw new Error(`No client registered for platform: ${order.platform}`);
    }

    if (!client.isConnected()) {
      throw new Error(`Client not connected for platform: ${order.platform}`);
    }

    return client.placeOrder(order);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, platform?: string): Promise<void> {
    if (this.usePaperTrading && this.paperEngine) {
      return this.paperEngine.cancelOrder(orderId);
    }

    // Determine platform from order ID if not provided
    let targetPlatform = platform;
    if (!targetPlatform) {
      if (orderId.startsWith(PLATFORMS.POLYMARKET)) {
        targetPlatform = PLATFORMS.POLYMARKET;
      } else if (orderId.startsWith(PLATFORMS.KALSHI)) {
        targetPlatform = PLATFORMS.KALSHI;
      }
    }

    if (!targetPlatform) {
      throw new Error(`Cannot determine platform for order: ${orderId}`);
    }

    const client = this.clients.get(targetPlatform);
    if (!client) {
      throw new Error(`No client registered for platform: ${targetPlatform}`);
    }

    return client.cancelOrder(orderId);
  }

  /**
   * Cancel all orders
   */
  async cancelAllOrders(platform?: string, marketId?: string): Promise<void> {
    if (this.usePaperTrading && this.paperEngine) {
      return this.paperEngine.cancelAllOrders(platform, marketId);
    }

    const platforms = platform ? [platform] : Array.from(this.clients.keys());

    await Promise.all(
      platforms.map(async (p) => {
        const client = this.clients.get(p);
        if (client?.isConnected()) {
          await client.cancelAllOrders(marketId);
        }
      })
    );
  }

  /**
   * Get open orders
   */
  async getOpenOrders(platform?: string): Promise<NormalizedOrder[]> {
    if (this.usePaperTrading && this.paperEngine) {
      return this.paperEngine.getOpenOrders(platform);
    }

    const platforms = platform ? [platform] : Array.from(this.clients.keys());
    const allOrders: NormalizedOrder[] = [];

    await Promise.all(
      platforms.map(async (p) => {
        const client = this.clients.get(p);
        if (client?.isConnected()) {
          const orders = await client.getOpenOrders();
          allOrders.push(...orders);
        }
      })
    );

    return allOrders;
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string, platform?: string): Promise<NormalizedOrder | null> {
    if (this.usePaperTrading && this.paperEngine) {
      return this.paperEngine.getOrder(orderId);
    }

    // Determine platform from order ID if not provided
    let targetPlatform = platform;
    if (!targetPlatform) {
      if (orderId.startsWith(PLATFORMS.POLYMARKET)) {
        targetPlatform = PLATFORMS.POLYMARKET;
      } else if (orderId.startsWith(PLATFORMS.KALSHI)) {
        targetPlatform = PLATFORMS.KALSHI;
      }
    }

    if (!targetPlatform) {
      return null;
    }

    const client = this.clients.get(targetPlatform);
    if (!client?.isConnected()) {
      return null;
    }

    try {
      return await client.getOrder(orderId);
    } catch {
      return null;
    }
  }

  /**
   * Get balance
   */
  async getBalance(platform: string): Promise<AccountBalance> {
    if (this.usePaperTrading && this.paperEngine) {
      return this.paperEngine.getBalance(platform);
    }

    const client = this.clients.get(platform);
    if (!client) {
      throw new Error(`No client registered for platform: ${platform}`);
    }

    if (!client.isConnected()) {
      return { available: 0, locked: 0, total: 0, currency: 'USD' };
    }

    return client.getBalance();
  }

  /**
   * Get all balances
   */
  async getAllBalances(): Promise<Map<string, AccountBalance>> {
    const balances = new Map<string, AccountBalance>();

    for (const platform of [PLATFORMS.POLYMARKET, PLATFORMS.KALSHI]) {
      try {
        balances.set(platform, await this.getBalance(platform));
      } catch (error) {
        this.log.warn(`Failed to get balance for ${platform}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return balances;
  }

  /**
   * Get positions
   */
  async getPositions(platform?: string): Promise<Position[]> {
    let positions: Position[] = [];

    if (this.usePaperTrading && this.paperEngine) {
      positions = await this.paperEngine.getPositions(platform);
    } else {
      const platforms = platform ? [platform] : Array.from(this.clients.keys());
      const allPositions: Position[] = [];

      await Promise.all(
        platforms.map(async (p) => {
          const client = this.clients.get(p);
          if (client?.isConnected()) {
            try {
              const clientPositions = await client.getPositions();
              allPositions.push(...clientPositions);
            } catch (error) {
              this.log.warn(`Failed to get positions for ${p}`, {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        })
      );

      positions = allPositions;
    }

    // Update risk managers with current positions
    for (const position of positions) {
      this.positionLimits.updatePosition(position);
    }

    return positions;
  }

  /**
   * Get trades
   */
  async getTrades(limit?: number, platform?: string): Promise<Trade[]> {
    if (this.usePaperTrading && this.paperEngine) {
      return this.paperEngine.getTrades(limit, platform);
    }

    const platforms = platform ? [platform] : Array.from(this.clients.keys());
    const allTrades: Trade[] = [];

    await Promise.all(
      platforms.map(async (p) => {
        const client = this.clients.get(p);
        if (client?.isConnected()) {
          try {
            const trades = await client.getTrades(limit);
            allTrades.push(...trades);
          } catch (error) {
            this.log.warn(`Failed to get trades for ${p}`, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })
    );

    // Sort by most recent first and limit
    allTrades.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());
    return limit ? allTrades.slice(0, limit) : allTrades;
  }

  /**
   * Get paper trading stats
   */
  getPaperStats(): ReturnType<PaperTradingEngine['getStats']> | null {
    if (!this.paperEngine) {
      return null;
    }
    return this.paperEngine.getStats();
  }

  /**
   * Reset paper trading
   */
  resetPaperTrading(): void {
    if (this.paperEngine) {
      this.paperEngine.reset();
      this.log.info('Paper trading reset');
    }
  }

  /**
   * Check if using paper trading
   */
  isPaperTrading(): boolean {
    return this.usePaperTrading;
  }
}
