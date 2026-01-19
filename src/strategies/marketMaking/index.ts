import { BaseStrategy, type StrategyConfig } from '../base.js';
import type { OrderManager } from '../../services/orderManager/index.js';
import { Quoter, type QuoterConfig } from './quoter.js';
import { InventoryManager } from './inventory.js';
import { PLATFORMS, ORDER_TYPES } from '../../config/constants.js';
import type { OrderBook } from '../../clients/shared/interfaces.js';

/**
 * Market making strategy configuration
 */
export interface MarketMakingConfig extends StrategyConfig {
  /**
   * Markets to make markets for
   */
  markets: Array<{
    marketId: string;
    outcomeId: string;
    platform: string;
  }>;
  /**
   * Quote generation configuration
   */
  quoter: Partial<QuoterConfig>;
  /**
   * Quote update interval in milliseconds
   */
  quoteIntervalMs: number;
  /**
   * Maximum inventory per market
   */
  maxInventory: number;
}

/**
 * Market Making Strategy
 * Provides liquidity by placing bid and ask orders
 */
export class MarketMakingStrategy extends BaseStrategy {
  private quoter: Quoter;
  private inventoryManager: InventoryManager;
  private quoteInterval: NodeJS.Timeout | null = null;
  private activeQuotes: Map<string, { bidOrderId?: string; askOrderId?: string }> = new Map();

  constructor(config: MarketMakingConfig, orderManager: OrderManager) {
    super(config, orderManager);

    this.inventoryManager = new InventoryManager();
    this.quoter = new Quoter(config.quoter || {}, this.inventoryManager);

    // Listen to position updates to track inventory
    this.on('positionUpdate', (position) => {
      this.inventoryManager.updateFromPosition(position);
    });
  }

  /**
   * Start market making
   */
  protected async onStart(): Promise<void> {
    // Load current positions to initialize inventory
    const positions = await this.getPositions();
    for (const position of positions) {
      this.inventoryManager.updateFromPosition(position);
    }

    // Start quoting
    this.quoteInterval = setInterval(() => {
      this.updateQuotes().catch((error) => {
        this.log.error('Failed to update quotes', { error });
      });
    }, (this.config as MarketMakingConfig).quoteIntervalMs || 5000);

    // Initial quote update
    await this.updateQuotes();
  }

  /**
   * Stop market making
   */
  protected async onStop(): Promise<void> {
    if (this.quoteInterval) {
      clearInterval(this.quoteInterval);
      this.quoteInterval = null;
    }

    // Cancel all open orders
    const openOrders = await this.orderManager.getOpenOrders();
    for (const order of openOrders) {
      if (order.strategyId === this.config.id) {
        try {
          await this.orderManager.cancelOrder(order.id, order.platform);
        } catch (error) {
          this.log.warn('Failed to cancel order', { orderId: order.id, error });
        }
      }
    }

    this.activeQuotes.clear();
  }

  /**
   * Update quotes for all markets
   */
  private async updateQuotes(): Promise<void> {
    const config = this.config as MarketMakingConfig;

    for (const market of config.markets) {
      try {
        // Get orderbook
        const client = this.orderManager.getClient(market.platform);
        if (!client?.isConnected()) {
          continue;
        }

        let orderBook: OrderBook | null = null;
        try {
          orderBook = await client.getOrderBook(market.marketId, market.outcomeId);
        } catch (error) {
          this.log.warn('Failed to get orderbook', { market, error });
        }

        // Generate quote
        const quote = this.quoter.generateQuote(market.marketId, market.outcomeId, orderBook);
        if (!quote) {
          continue;
        }

        // Check inventory limits
        const inventory = this.inventoryManager.getInventory(market.marketId, market.outcomeId);
        if (inventory && Math.abs(inventory.size) >= config.maxInventory) {
          // At max inventory - only quote on the side to reduce inventory
          if (inventory.size > 0) {
            // Long - only quote ask
            await this.updateQuote(market, quote, false, true);
          } else {
            // Short - only quote bid
            await this.updateQuote(market, quote, true, false);
          }
        } else {
          // Normal quoting
          await this.updateQuote(market, quote, true, true);
        }
      } catch (error) {
        this.log.error('Failed to update quote for market', { market, error });
      }
    }
  }

  /**
   * Update quote for a market
   */
  private async updateQuote(
    market: { marketId: string; outcomeId: string; platform: string },
    quote: { bid: number; ask: number; bidSize: number; askSize: number },
    updateBid: boolean,
    updateAsk: boolean
  ): Promise<void> {
    const key = `${market.marketId}:${market.outcomeId}`;
    const activeQuote = this.activeQuotes.get(key) || {};

    // Cancel existing orders if needed
    if (updateBid && activeQuote.bidOrderId) {
      try {
        await this.orderManager.cancelOrder(activeQuote.bidOrderId, market.platform);
      } catch (error) {
        this.log.warn('Failed to cancel bid order', { orderId: activeQuote.bidOrderId, error });
      }
    }

    if (updateAsk && activeQuote.askOrderId) {
      try {
        await this.orderManager.cancelOrder(activeQuote.askOrderId, market.platform);
      } catch (error) {
        this.log.warn('Failed to cancel ask order', { orderId: activeQuote.askOrderId, error });
      }
    }

    // Place new orders
    if (updateBid && quote.bidSize >= 10) {
      try {
        const order = await this.orderManager.placeOrder({
          platform: market.platform as typeof PLATFORMS[keyof typeof PLATFORMS],
          marketId: market.marketId,
          outcomeId: market.outcomeId,
          side: 'buy',
          price: quote.bid,
          size: quote.bidSize,
          type: ORDER_TYPES.GTC,
          strategyId: this.config.id,
        });
        activeQuote.bidOrderId = order.id;
      } catch (error) {
        this.log.warn('Failed to place bid order', { market, quote, error });
      }
    }

    if (updateAsk && quote.askSize >= 10) {
      try {
        const order = await this.orderManager.placeOrder({
          platform: market.platform as typeof PLATFORMS[keyof typeof PLATFORMS],
          marketId: market.marketId,
          outcomeId: market.outcomeId,
          side: 'sell',
          price: quote.ask,
          size: quote.askSize,
          type: ORDER_TYPES.GTC,
          strategyId: this.config.id,
        });
        activeQuote.askOrderId = order.id;
      } catch (error) {
        this.log.warn('Failed to place ask order', { market, quote, error });
      }
    }

    this.activeQuotes.set(key, activeQuote);
  }
}

export { Quoter } from './quoter.js';
export { InventoryManager } from './inventory.js';
export { calculateSpread } from './spread.js';
export type { QuoterConfig } from './quoter.js';
