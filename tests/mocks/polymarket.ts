/**
 * Polymarket API mocks for testing
 */

import type { NormalizedMarket, NormalizedOrder, OrderBook, Position, Trade } from '../../src/clients/shared/interfaces.js';
import { PLATFORMS, ORDER_STATUSES, OUTCOMES } from '../../src/config/constants.js';

/**
 * Mock Polymarket market
 */
export function createMockPolymarketMarket(overrides?: Partial<NormalizedMarket>): NormalizedMarket {
  return {
    id: `polymarket:test-market-${Date.now()}`,
    platform: PLATFORMS.POLYMARKET,
    externalId: `test-market-${Date.now()}`,
    title: 'Test Market',
    description: 'A test market for unit testing',
    category: 'test',
    endDate: new Date(Date.now() + 86400000), // Tomorrow
    outcomes: [
      {
        id: 'polymarket:test-market:yes',
        externalId: 'yes',
        name: 'Yes',
        type: OUTCOMES.YES,
        probability: 0.5,
        bestBid: 0.49,
        bestAsk: 0.51,
        bidSize: 1000,
        askSize: 1000,
      },
      {
        id: 'polymarket:test-market:no',
        externalId: 'no',
        name: 'No',
        type: OUTCOMES.NO,
        probability: 0.5,
        bestBid: 0.49,
        bestAsk: 0.51,
        bidSize: 1000,
        askSize: 1000,
      },
    ],
    volume24h: 10000,
    liquidity: 5000,
    isActive: true,
    status: 'active',
    raw: {},
    ...overrides,
  };
}

/**
 * Mock order book
 */
export function createMockOrderBook(overrides?: Partial<OrderBook>): OrderBook {
  return {
    marketId: 'test-market',
    outcomeId: 'yes',
    yes: {
      bestBid: 0.49,
      bestAsk: 0.51,
      bids: [{ price: 0.49, size: 1000 }],
      asks: [{ price: 0.51, size: 1000 }],
    },
    no: {
      bestBid: 0.49,
      bestAsk: 0.51,
      bids: [{ price: 0.49, size: 1000 }],
      asks: [{ price: 0.51, size: 1000 }],
    },
    timestamp: new Date(),
    ...overrides,
  };
}

/**
 * Mock order
 */
export function createMockOrder(overrides?: Partial<NormalizedOrder>): NormalizedOrder {
  return {
    id: `polymarket:order-${Date.now()}`,
    platform: PLATFORMS.POLYMARKET,
    marketId: 'test-market',
    outcomeId: 'yes',
    side: 'buy',
    price: 0.5,
    size: 100,
    filledSize: 0,
    avgFillPrice: 0,
    type: 'GTC',
    status: ORDER_STATUSES.OPEN,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Mock position
 */
export function createMockPosition(overrides?: Partial<Position>): Position {
  return {
    id: `polymarket:position-${Date.now()}`,
    platform: PLATFORMS.POLYMARKET,
    marketId: 'test-market',
    outcomeId: 'yes',
    outcomeName: 'Yes',
    side: 'long',
    size: 100,
    avgEntryPrice: 0.5,
    currentPrice: 0.51,
    realizedPnl: 0,
    unrealizedPnl: 1,
    isOpen: true,
    openedAt: new Date(),
    ...overrides,
  };
}

/**
 * Mock trade
 */
export function createMockTrade(overrides?: Partial<Trade>): Trade {
  return {
    id: `polymarket:trade-${Date.now()}`,
    platform: PLATFORMS.POLYMARKET,
    marketId: 'test-market',
    outcomeId: 'yes',
    side: 'buy',
    price: 0.5,
    size: 100,
    fee: 0.5,
    realizedPnl: 0,
    strategyId: 'test-strategy',
    executedAt: new Date(),
    ...overrides,
  };
}
