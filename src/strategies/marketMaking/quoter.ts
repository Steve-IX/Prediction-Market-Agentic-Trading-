import type { OrderBook, OrderBookLevel } from '../../clients/shared/interfaces.js';
import { calculateSpread, type SpreadConfig, DEFAULT_SPREAD_CONFIG } from './spread.js';
import { InventoryManager } from './inventory.js';
import { calculateMidPrice } from '../../utils/math.js';

/**
 * Quote generation configuration
 */
export interface QuoterConfig {
  /**
   * Spread configuration
   */
  spread: SpreadConfig;
  /**
   * Minimum quote size in USD
   */
  minQuoteSize: number;
  /**
   * Maximum quote size in USD
   */
  maxQuoteSize: number;
  /**
   * Quote size as percentage of orderbook depth
   */
  depthPercentage: number;
}

/**
 * Quote for a market
 */
export interface Quote {
  /**
   * Market ID
   */
  marketId: string;
  /**
   * Outcome ID
   */
  outcomeId: string;
  /**
   * Bid price
   */
  bid: number;
  /**
   * Ask price
   */
  ask: number;
  /**
   * Bid size
   */
  bidSize: number;
  /**
   * Ask size
   */
  askSize: number;
  /**
   * Spread in basis points
   */
  spreadBps: number;
}

/**
 * Quote generator
 */
export class Quoter {
  private config: QuoterConfig;
  private inventoryManager: InventoryManager;

  constructor(config: Partial<QuoterConfig>, inventoryManager: InventoryManager) {
    this.config = {
      spread: config.spread || DEFAULT_SPREAD_CONFIG,
      minQuoteSize: config.minQuoteSize || 10,
      maxQuoteSize: config.maxQuoteSize || 1000,
      depthPercentage: config.depthPercentage || 0.1, // 10% of orderbook depth
    };
    this.inventoryManager = inventoryManager;
  }

  /**
   * Generate quotes for a market
   */
  generateQuote(
    marketId: string,
    outcomeId: string,
    orderBook: OrderBook | null
  ): Quote | null {
    // Get base mid price from orderbook
    let baseMidPrice = 0.5; // Default to 50/50

    if (orderBook) {
      const yesBid = orderBook.yes?.bestBid || 0;
      const yesAsk = orderBook.yes?.bestAsk || 0;
      const noBid = orderBook.no?.bestBid || 0;
      const noAsk = orderBook.no?.bestAsk || 0;

      // Use YES outcome prices if available
      if (yesBid > 0 && yesAsk > 0) {
        baseMidPrice = calculateMidPrice(yesBid, yesAsk);
      } else if (noBid > 0 && noAsk > 0) {
        // Use NO outcome prices (inverted)
        const noMid = calculateMidPrice(noBid, noAsk);
        baseMidPrice = 1 - noMid;
      }
    }

    // Get inventory skew
    const inventory = this.inventoryManager.getInventory(marketId, outcomeId);
    const inventorySize = inventory ? inventory.size : 0;
    const inventorySkew = this.inventoryManager.getInventorySkew(marketId, outcomeId);

    // Calculate volatility (simplified - could use historical data)
    const volatility = 0; // TODO: Calculate from historical prices

    // Calculate spread with inventory adjustment
    const { bid, ask, spread } = calculateSpread(
      this.config.spread,
      inventorySkew,
      volatility,
      baseMidPrice
    );

    // Adjust prices based on inventory (skew quotes to reduce inventory)
    let adjustedBid = bid;
    let adjustedAsk = ask;

    if (inventorySize > 0) {
      // Long inventory - skew to sell (lower ask)
      adjustedAsk = Math.max(bid, ask - spread * Math.abs(inventorySkew) * 0.5);
    } else if (inventorySize < 0) {
      // Short inventory - skew to buy (higher bid)
      adjustedBid = Math.min(ask, bid + spread * Math.abs(inventorySkew) * 0.5);
    }

    // Calculate quote sizes based on orderbook depth
    const bidSize = this.calculateQuoteSize(orderBook?.yes?.bids || [], adjustedBid);
    const askSize = this.calculateQuoteSize(orderBook?.yes?.asks || [], adjustedAsk);

    // Check if quote is valid
    if (bidSize < this.config.minQuoteSize && askSize < this.config.minQuoteSize) {
      return null; // Quote too small
    }

    return {
      marketId,
      outcomeId,
      bid: adjustedBid,
      ask: adjustedAsk,
      bidSize,
      askSize,
      spreadBps: spread * 10000,
    };
  }

  /**
   * Calculate quote size based on orderbook depth
   */
  private calculateQuoteSize(levels: OrderBookLevel[], price: number): number {
    if (levels.length === 0) {
      return this.config.minQuoteSize;
    }

    // Sum up depth at prices better than our quote
    let depth = 0;
    for (const level of levels) {
      if (level.price >= price) {
        depth += level.size;
      } else {
        break;
      }
    }

    // Use percentage of depth, clamped to min/max
    const quoteSize = depth * this.config.depthPercentage;
    return Math.max(
      this.config.minQuoteSize,
      Math.min(this.config.maxQuoteSize, quoteSize)
    );
  }
}
