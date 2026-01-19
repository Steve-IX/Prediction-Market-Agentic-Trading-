import { pgTable, text, timestamp, numeric, jsonb, index, integer } from 'drizzle-orm/pg-core';
import { markets } from './markets.js';

/**
 * Orders table - stores all order history
 */
export const orders = pgTable(
  'orders',
  {
    // Primary key: platform:externalOrderId or generated UUID
    id: text('id').primaryKey(),
    // Platform
    platform: text('platform').notNull(), // 'polymarket' | 'kalshi'
    // External order ID on the platform
    externalOrderId: text('external_order_id'),
    // Reference to market
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    // Outcome ID
    outcomeId: text('outcome_id').notNull(),
    // Order side
    side: text('side').notNull(), // 'buy' | 'sell'
    // Order type
    type: text('type').notNull(), // 'GTC' | 'GTD' | 'FOK' | 'IOC'
    // Order price (0-1 normalized)
    price: numeric('price', { precision: 10, scale: 6 }).notNull(),
    // Original size in USD
    size: numeric('size', { precision: 18, scale: 2 }).notNull(),
    // Filled size in USD
    filledSize: numeric('filled_size', { precision: 18, scale: 2 }).default('0'),
    // Average fill price
    avgFillPrice: numeric('avg_fill_price', { precision: 10, scale: 6 }),
    // Current status
    status: text('status').notNull().default('pending'), // 'pending' | 'open' | 'filled' | 'partial' | 'cancelled' | 'rejected'
    // Strategy that placed this order
    strategyId: text('strategy_id'),
    // Expiry time for GTD orders
    expiresAt: timestamp('expires_at'),
    // Additional metadata
    metadata: jsonb('metadata'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    platformIdx: index('orders_platform_idx').on(table.platform),
    marketIdx: index('orders_market_idx').on(table.marketId),
    statusIdx: index('orders_status_idx').on(table.status),
    strategyIdx: index('orders_strategy_idx').on(table.strategyId),
    createdAtIdx: index('orders_created_at_idx').on(table.createdAt),
    externalOrderIdx: index('orders_external_order_idx').on(table.externalOrderId),
  })
);

/**
 * Trades table - stores executed trades (fills)
 */
export const trades = pgTable(
  'trades',
  {
    // Primary key
    id: text('id').primaryKey(),
    // Reference to order
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    // Platform
    platform: text('platform').notNull(),
    // External trade ID on the platform
    externalTradeId: text('external_trade_id'),
    // Market and outcome
    marketId: text('market_id').notNull(),
    outcomeId: text('outcome_id').notNull(),
    // Trade details
    side: text('side').notNull(), // 'buy' | 'sell'
    price: numeric('price', { precision: 10, scale: 6 }).notNull(),
    size: numeric('size', { precision: 18, scale: 2 }).notNull(),
    // Fee paid
    fee: numeric('fee', { precision: 18, scale: 6 }).default('0'),
    // Realized P&L from this trade
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }),
    // Strategy
    strategyId: text('strategy_id'),
    // Execution timestamp
    executedAt: timestamp('executed_at').notNull(),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    orderIdx: index('trades_order_idx').on(table.orderId),
    platformIdx: index('trades_platform_idx').on(table.platform),
    marketIdx: index('trades_market_idx').on(table.marketId),
    strategyIdx: index('trades_strategy_idx').on(table.strategyId),
    executedAtIdx: index('trades_executed_at_idx').on(table.executedAt),
  })
);

/**
 * Arbitrage opportunities table - detected arbitrage opportunities
 */
export const arbitrageOpportunities = pgTable(
  'arbitrage_opportunities',
  {
    // Primary key
    id: text('id').primaryKey(),
    // Type of arbitrage
    type: text('type').notNull(), // 'single_platform' | 'cross_platform'
    // Reference to market pair (for cross-platform)
    marketPairId: text('market_pair_id'),
    // Markets involved (JSON for flexibility)
    markets: jsonb('markets').notNull(),
    // Trade legs (JSON)
    legs: jsonb('legs').notNull(),
    // Spread percentage
    spreadPercent: numeric('spread_percent', { precision: 10, scale: 4 }).notNull(),
    // Expected profit in USD
    expectedProfit: numeric('expected_profit', { precision: 18, scale: 2 }).notNull(),
    // Expected profit in basis points
    expectedProfitBps: numeric('expected_profit_bps', { precision: 10, scale: 2 }).notNull(),
    // Maximum size for this opportunity
    maxSize: numeric('max_size', { precision: 18, scale: 2 }).notNull(),
    // Whether this opportunity was executed
    wasExecuted: integer('was_executed').default(0), // 0 = false, 1 = true
    // Execution result (JSON)
    executionResult: jsonb('execution_result'),
    // When this opportunity was detected
    detectedAt: timestamp('detected_at').notNull().defaultNow(),
    // When this opportunity expires
    expiresAt: timestamp('expires_at').notNull(),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    typeIdx: index('arb_type_idx').on(table.type),
    marketPairIdx: index('arb_market_pair_idx').on(table.marketPairId),
    detectedAtIdx: index('arb_detected_at_idx').on(table.detectedAt),
    executedIdx: index('arb_executed_idx').on(table.wasExecuted),
  })
);

// Type exports
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type ArbitrageOpportunity = typeof arbitrageOpportunities.$inferSelect;
export type NewArbitrageOpportunity = typeof arbitrageOpportunities.$inferInsert;
