import { EventEmitter } from 'events';
import { PLATFORMS, ORDER_SIDES, ORDER_STATUSES, ORDER_TYPES, type Platform } from '../../config/constants.js';
import type {
  OrderRequest,
  NormalizedOrder,
  Position,
  Trade,
  AccountBalance,
  OrderBook,
} from '../../clients/shared/interfaces.js';
import { logger, type Logger } from '../../utils/logger.js';
import { paperTradingBalance, ordersPlaced, ordersFilled, tradesExecuted, tradeVolume } from '../../utils/metrics.js';

/**
 * Paper trade configuration
 */
interface PaperTradingConfig {
  initialBalance: number;
  slippage: {
    baseSlippage: number; // Base slippage in decimal (0.001 = 0.1%)
    sizeImpact: number; // Additional slippage per $1000 size
    volatilityMultiplier: number; // Multiplier for volatile markets
  };
  fills: {
    fillRate: number; // Base probability of fill (0.95 = 95%)
    partialFillRate: number; // Probability of partial fill (0.1 = 10%)
    minPartialFillPercent: number; // Minimum partial fill percentage
    maxPartialFillPercent: number; // Maximum partial fill percentage
  };
  latency: {
    minLatencyMs: number;
    maxLatencyMs: number;
  };
  fees: {
    polymarket: number; // Fee in decimal (0 = 0%)
    kalshi: number; // Fee in decimal (0.01 = 1%)
  };
}

/**
 * Paper trade position tracking
 */
interface PaperPosition {
  marketId: string;
  outcomeId: string;
  outcomeName: string;
  platform: string;
  size: number;
  avgEntryPrice: number;
  realizedPnl: number;
}

/**
 * Paper trade order tracking
 */
interface PaperOrder {
  order: NormalizedOrder;
  expiresAt?: Date;
}

/**
 * Paper Trading Engine
 * Simulates order execution for testing without real money
 */
export class PaperTradingEngine extends EventEmitter {
  private log: Logger;
  private config: PaperTradingConfig;
  private balances: Map<string, AccountBalance>;
  private positions: Map<string, PaperPosition>;
  private openOrders: Map<string, PaperOrder>;
  private trades: Trade[];
  private orderCounter: number;
  private tradeCounter: number;

  constructor(config?: Partial<PaperTradingConfig>) {
    super();
    this.log = logger('PaperTradingEngine');

    // Merge with defaults
    this.config = {
      initialBalance: config?.initialBalance ?? 10000,
      slippage: {
        baseSlippage: config?.slippage?.baseSlippage ?? 0.001,
        sizeImpact: config?.slippage?.sizeImpact ?? 0.0001,
        volatilityMultiplier: config?.slippage?.volatilityMultiplier ?? 1.5,
      },
      fills: {
        fillRate: config?.fills?.fillRate ?? 0.95,
        partialFillRate: config?.fills?.partialFillRate ?? 0.1,
        minPartialFillPercent: config?.fills?.minPartialFillPercent ?? 0.25,
        maxPartialFillPercent: config?.fills?.maxPartialFillPercent ?? 0.75,
      },
      latency: {
        minLatencyMs: config?.latency?.minLatencyMs ?? 50,
        maxLatencyMs: config?.latency?.maxLatencyMs ?? 500,
      },
      fees: {
        polymarket: config?.fees?.polymarket ?? 0,
        kalshi: config?.fees?.kalshi ?? 0.01,
      },
    };

    this.balances = new Map();
    this.positions = new Map();
    this.openOrders = new Map();
    this.trades = [];
    this.orderCounter = 0;
    this.tradeCounter = 0;

    // Initialize balances for both platforms
    this.initializeBalances();
  }

  /**
   * Initialize balances for all platforms
   */
  private initializeBalances(): void {
    const platforms = [PLATFORMS.POLYMARKET, PLATFORMS.KALSHI];

    for (const platform of platforms) {
      this.balances.set(platform, {
        available: this.config.initialBalance,
        locked: 0,
        total: this.config.initialBalance,
        currency: platform === PLATFORMS.POLYMARKET ? 'USDC' : 'USD',
      });

      // Update metrics
      paperTradingBalance.labels(platform).set(this.config.initialBalance);
    }

    this.log.info('Paper trading initialized', {
      initialBalance: this.config.initialBalance,
      platforms,
    });
  }

  /**
   * Place a paper trade order
   */
  async placeOrder(order: OrderRequest, orderBook?: OrderBook): Promise<NormalizedOrder> {
    // Simulate latency
    await this.simulateLatency();

    // Validate balance
    const balance = this.balances.get(order.platform);
    if (!balance) {
      throw new Error(`Unknown platform: ${order.platform}`);
    }

    const orderValue = order.size * order.price;
    if (order.side === ORDER_SIDES.BUY && balance.available < orderValue) {
      throw new Error(`Insufficient balance. Available: ${balance.available}, Required: ${orderValue}`);
    }

    // Create order
    this.orderCounter++;
    const orderId = `paper:${order.platform}:${this.orderCounter}`;

    const normalizedOrder: NormalizedOrder = {
      id: orderId,
      platform: order.platform,
      externalOrderId: orderId,
      marketId: order.marketId,
      outcomeId: order.outcomeId,
      side: order.side,
      price: order.price,
      size: order.size,
      filledSize: 0,
      avgFillPrice: 0,
      type: order.type,
      status: ORDER_STATUSES.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Copy strategyId if present
    if (order.strategyId) {
      normalizedOrder.strategyId = order.strategyId;
    }

    // Lock funds for buy orders
    if (order.side === ORDER_SIDES.BUY) {
      balance.available -= orderValue;
      balance.locked += orderValue;
    }

    // Record metrics
    ordersPlaced.labels(order.platform, order.side, order.type, ORDER_STATUSES.PENDING).inc();

    // Store order
    const paperOrder: PaperOrder = {
      order: normalizedOrder,
    };
    if (order.expiresAt) {
      paperOrder.expiresAt = order.expiresAt;
    }
    this.openOrders.set(orderId, paperOrder);

    this.log.info('Paper order placed', {
      orderId,
      marketId: order.marketId,
      side: order.side,
      price: order.price,
      size: order.size,
    });

    // Attempt to fill order
    const filledOrder = await this.attemptFill(normalizedOrder, orderBook);

    return filledOrder;
  }

  /**
   * Attempt to fill an order
   */
  private async attemptFill(order: NormalizedOrder, orderBook?: OrderBook): Promise<NormalizedOrder> {
    // Determine if order should fill
    const shouldFill = Math.random() < this.config.fills.fillRate;

    if (!shouldFill) {
      // Order remains open
      order.status = ORDER_STATUSES.OPEN;
      order.updatedAt = new Date();

      if (order.type === ORDER_TYPES.FOK || order.type === ORDER_TYPES.IOC) {
        // FOK/IOC orders should be cancelled if not filled
        return this.cancelOrderInternal(order);
      }

      return order;
    }

    // Determine fill amount
    const isPartialFill = Math.random() < this.config.fills.partialFillRate;
    let fillPercent = 1;

    if (isPartialFill && order.type !== ORDER_TYPES.FOK) {
      fillPercent =
        this.config.fills.minPartialFillPercent +
        Math.random() * (this.config.fills.maxPartialFillPercent - this.config.fills.minPartialFillPercent);
    }

    // Calculate fill price with slippage
    const fillPrice = this.calculateFillPrice(order, orderBook);
    const fillSize = order.size * fillPercent;

    // Execute the fill
    return this.executeFill(order, fillSize, fillPrice);
  }

  /**
   * Calculate fill price with slippage
   */
  private calculateFillPrice(order: NormalizedOrder, orderBook?: OrderBook): number {
    let basePrice = order.price;

    // Use order book prices if available
    if (orderBook) {
      if (order.side === ORDER_SIDES.BUY && orderBook.asks.length > 0) {
        basePrice = orderBook.asks[0]!.price;
      } else if (order.side === ORDER_SIDES.SELL && orderBook.bids.length > 0) {
        basePrice = orderBook.bids[0]!.price;
      }
    }

    // Calculate slippage
    const sizeSlippage = (order.size / 1000) * this.config.slippage.sizeImpact;
    const totalSlippage = this.config.slippage.baseSlippage + sizeSlippage;

    // Apply slippage based on order side
    if (order.side === ORDER_SIDES.BUY) {
      // Buy orders fill at higher price (worse for buyer)
      return Math.min(0.99, basePrice * (1 + totalSlippage));
    } else {
      // Sell orders fill at lower price (worse for seller)
      return Math.max(0.01, basePrice * (1 - totalSlippage));
    }
  }

  /**
   * Execute a fill
   */
  private executeFill(order: NormalizedOrder, fillSize: number, fillPrice: number): NormalizedOrder {
    const balance = this.balances.get(order.platform)!;
    const fee = this.calculateFee(order.platform, fillSize, fillPrice);

    // Calculate trade value
    const tradeValue = fillSize * fillPrice;

    // Update order
    order.filledSize += fillSize;
    order.avgFillPrice =
      order.filledSize > 0
        ? (order.avgFillPrice * (order.filledSize - fillSize) + fillPrice * fillSize) / order.filledSize
        : fillPrice;

    if (order.filledSize >= order.size) {
      order.status = ORDER_STATUSES.FILLED;
    } else {
      order.status = ORDER_STATUSES.PARTIAL;
    }
    order.updatedAt = new Date();

    // Update balance
    const orderValue = order.size * order.price;
    if (order.side === ORDER_SIDES.BUY) {
      // Unlock remaining locked funds and deduct actual cost
      const lockedForThisFill = (fillSize / order.size) * orderValue;
      balance.locked -= lockedForThisFill;

      // If we got a better price, return the difference
      const refund = lockedForThisFill - tradeValue;
      balance.available += refund;
      balance.total -= fee;
    } else {
      // Selling - add proceeds minus fee
      balance.available += tradeValue - fee;
      balance.total = balance.available + balance.locked;
    }

    // Update metrics
    paperTradingBalance.labels(order.platform).set(balance.total);

    // Update position and get realized P&L (for SELL trades)
    const realizedPnl = this.updatePosition(order, fillSize, fillPrice);

    // Create trade record with strategyId and realizedPnl
    this.createTradeRecord(order, fillSize, fillPrice, fee, realizedPnl);

    // Remove from open orders if fully filled
    if (order.status === ORDER_STATUSES.FILLED) {
      this.openOrders.delete(order.id);
    }

    // Record metrics
    ordersFilled.labels(order.platform, order.side).inc();

    this.log.info('Paper order filled', {
      orderId: order.id,
      fillSize,
      fillPrice,
      fee,
      status: order.status,
    });

    // Emit fill event
    this.emit('fill', {
      order,
      fillSize,
      fillPrice,
      fee,
    });

    return order;
  }

  /**
   * Calculate trading fee
   */
  private calculateFee(platform: string, size: number, price: number): number {
    const tradeValue = size * price;
    const feeRate = platform === PLATFORMS.POLYMARKET ? this.config.fees.polymarket : this.config.fees.kalshi;
    return tradeValue * feeRate;
  }

  /**
   * Update position after a fill
   * Returns realized P&L for SELL trades, 0 for BUY trades
   */
  private updatePosition(order: NormalizedOrder, fillSize: number, fillPrice: number): number {
    const positionKey = `${order.platform}:${order.marketId}:${order.outcomeId}`;
    let position = this.positions.get(positionKey);

    if (!position) {
      position = {
        marketId: order.marketId,
        outcomeId: order.outcomeId,
        outcomeName: 'Unknown',
        platform: order.platform,
        size: 0,
        avgEntryPrice: 0,
        realizedPnl: 0,
      };
      this.positions.set(positionKey, position);
    }

    if (order.side === ORDER_SIDES.BUY) {
      // Buying increases position - no realized P&L yet
      const newSize = position.size + fillSize;
      if (newSize > 0) {
        position.avgEntryPrice = (position.avgEntryPrice * position.size + fillPrice * fillSize) / newSize;
      }
      position.size = newSize;
      return 0; // No realized P&L for buy trades
    } else {
      // Selling decreases position
      let realizedPnl = 0;
      if (position.size > 0) {
        // Realize P&L
        realizedPnl = fillSize * (fillPrice - position.avgEntryPrice);
        position.realizedPnl += realizedPnl;
      }
      position.size -= fillSize;

      // If position is closed, reset average entry price
      if (position.size <= 0) {
        position.avgEntryPrice = 0;
        position.size = 0;
      }
      return realizedPnl; // Return realized P&L for this trade
    }
  }

  /**
   * Create trade record
   */
  private createTradeRecord(
    order: NormalizedOrder,
    fillSize: number,
    fillPrice: number,
    fee: number,
    realizedPnl: number
  ): void {
    this.tradeCounter++;
    const tradeId = `paper:${order.platform}:${this.tradeCounter}`;

    // Build trade object conditionally to handle optional properties
    const trade: Trade = {
      id: tradeId,
      platform: order.platform,
      orderId: order.id,
      marketId: order.marketId,
      outcomeId: order.outcomeId,
      side: order.side,
      price: fillPrice,
      size: fillSize,
      fee,
      executedAt: new Date(),
    };

    // Only set realizedPnl if non-zero (for SELL trades that close positions)
    if (realizedPnl !== 0) {
      trade.realizedPnl = realizedPnl;
    }

    // Copy strategyId from order if present
    if (order.strategyId) {
      trade.strategyId = order.strategyId;
    }

    this.trades.push(trade);

    // Record metrics
    tradesExecuted.labels(order.platform, order.side, 'paper').inc();
    tradeVolume.labels(order.platform, order.side).inc(fillSize * fillPrice);

    // Emit trade event
    this.emit('trade', trade);
  }

  /**
   * Cancel an order internally
   */
  private cancelOrderInternal(order: NormalizedOrder): NormalizedOrder {
    const balance = this.balances.get(order.platform);

    // Unlock funds for unfilled portion of buy orders
    if (balance && order.side === ORDER_SIDES.BUY) {
      const unfilledSize = order.size - order.filledSize;
      const lockedAmount = unfilledSize * order.price;
      balance.locked -= lockedAmount;
      balance.available += lockedAmount;
    }

    order.status = ORDER_STATUSES.CANCELLED;
    order.updatedAt = new Date();

    this.openOrders.delete(order.id);

    this.log.info('Paper order cancelled', { orderId: order.id });

    return order;
  }

  /**
   * Cancel an order by ID
   */
  async cancelOrder(orderId: string): Promise<void> {
    await this.simulateLatency();

    const paperOrder = this.openOrders.get(orderId);
    if (!paperOrder) {
      throw new Error(`Order not found: ${orderId}`);
    }

    this.cancelOrderInternal(paperOrder.order);
  }

  /**
   * Cancel all orders
   */
  async cancelAllOrders(platform?: string, marketId?: string): Promise<void> {
    await this.simulateLatency();

    for (const [_orderId, paperOrder] of this.openOrders) {
      if (platform && paperOrder.order.platform !== platform) continue;
      if (marketId && paperOrder.order.marketId !== marketId) continue;

      this.cancelOrderInternal(paperOrder.order);
    }

    this.log.info('All paper orders cancelled', { platform, marketId });
  }

  /**
   * Get open orders
   */
  getOpenOrders(platform?: string): NormalizedOrder[] {
    const orders: NormalizedOrder[] = [];

    for (const paperOrder of this.openOrders.values()) {
      if (!platform || paperOrder.order.platform === platform) {
        orders.push(paperOrder.order);
      }
    }

    return orders;
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): NormalizedOrder | null {
    const paperOrder = this.openOrders.get(orderId);
    return paperOrder?.order ?? null;
  }

  /**
   * Get balance for a platform
   */
  getBalance(platform: string): AccountBalance {
    const balance = this.balances.get(platform);
    if (!balance) {
      throw new Error(`Unknown platform: ${platform}`);
    }
    return { ...balance };
  }

  /**
   * Get all positions
   */
  getPositions(platform?: string): Position[] {
    const positions: Position[] = [];

    for (const position of this.positions.values()) {
      if (position.size === 0) continue;
      if (platform && position.platform !== platform) continue;

      positions.push({
        id: `${position.platform}:${position.marketId}:${position.outcomeId}`,
        platform: position.platform as Platform,
        marketId: position.marketId,
        outcomeId: position.outcomeId,
        outcomeName: position.outcomeName,
        side: position.size >= 0 ? 'long' : 'short',
        size: position.size,
        avgEntryPrice: position.avgEntryPrice,
        currentPrice: position.avgEntryPrice, // Would need real-time price feed
        unrealizedPnl: 0, // Would need real-time price feed
        realizedPnl: position.realizedPnl,
        isOpen: position.size !== 0,
      });
    }

    return positions;
  }

  /**
   * Get position for a specific market
   */
  getPosition(platform: string, marketId: string, outcomeId: string): Position | null {
    const positionKey = `${platform}:${marketId}:${outcomeId}`;
    const position = this.positions.get(positionKey);

    if (!position || position.size === 0) {
      return null;
    }

    return {
      id: positionKey,
      platform: position.platform as Platform,
      marketId: position.marketId,
      outcomeId: position.outcomeId,
      outcomeName: position.outcomeName,
      side: position.size >= 0 ? 'long' : 'short',
      size: position.size,
      avgEntryPrice: position.avgEntryPrice,
      currentPrice: position.avgEntryPrice,
      unrealizedPnl: 0,
      realizedPnl: position.realizedPnl,
      isOpen: position.size !== 0,
    };
  }

  /**
   * Get trade history
   */
  getTrades(limit?: number, platform?: string): Trade[] {
    let trades = platform ? this.trades.filter((t) => t.platform === platform) : [...this.trades];

    // Sort by most recent first
    trades.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());

    if (limit) {
      trades = trades.slice(0, limit);
    }

    return trades;
  }

  /**
   * Reset the paper trading engine
   */
  reset(): void {
    this.balances.clear();
    this.positions.clear();
    this.openOrders.clear();
    this.trades = [];
    this.orderCounter = 0;
    this.tradeCounter = 0;

    this.initializeBalances();

    this.log.info('Paper trading engine reset');
  }

  /**
   * Update position with current market price (for P&L calculation)
   */
  updatePositionPrice(platform: string, marketId: string, outcomeId: string, currentPrice: number): void {
    const positionKey = `${platform}:${marketId}:${outcomeId}`;
    const position = this.positions.get(positionKey);

    if (position && position.size > 0) {
      // This would be used to update unrealized P&L when we get real-time prices
      this.emit('positionUpdate', {
        ...position,
        currentPrice,
        unrealizedPnl: position.size * (currentPrice - position.avgEntryPrice),
      });
    }
  }

  /**
   * Simulate network latency
   */
  private async simulateLatency(): Promise<void> {
    const latency =
      this.config.latency.minLatencyMs +
      Math.random() * (this.config.latency.maxLatencyMs - this.config.latency.minLatencyMs);

    await new Promise((resolve) => setTimeout(resolve, latency));
  }

  /**
   * Get engine statistics
   */
  getStats(): {
    totalTrades: number;
    totalVolume: number;
    totalFees: number;
    winRate: number;
    pnl: { polymarket: number; kalshi: number; total: number };
  } {
    let totalVolume = 0;
    let totalFees = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    // Calculate from trades
    for (const trade of this.trades) {
      totalVolume += trade.size * trade.price;
      totalFees += trade.fee;
    }

    // Calculate P&L from positions
    let polymarketPnl = 0;
    let kalshiPnl = 0;

    for (const position of this.positions.values()) {
      if (position.realizedPnl > 0) winningTrades++;
      if (position.realizedPnl < 0) losingTrades++;

      if (position.platform === PLATFORMS.POLYMARKET) {
        polymarketPnl += position.realizedPnl;
      } else {
        kalshiPnl += position.realizedPnl;
      }
    }

    const totalPnl = polymarketPnl + kalshiPnl - totalFees;
    const totalClosedPositions = winningTrades + losingTrades;
    const winRate = totalClosedPositions > 0 ? winningTrades / totalClosedPositions : 0;

    return {
      totalTrades: this.trades.length,
      totalVolume,
      totalFees,
      winRate,
      pnl: {
        polymarket: polymarketPnl,
        kalshi: kalshiPnl,
        total: totalPnl,
      },
    };
  }
}
