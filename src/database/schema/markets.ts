import { pgTable, text, timestamp, boolean, numeric, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Markets table - stores normalized market data from both platforms
 */
export const markets = pgTable(
  'markets',
  {
    // Primary key: platform:externalId
    id: text('id').primaryKey(),
    // Platform identifier
    platform: text('platform').notNull(), // 'polymarket' | 'kalshi'
    // External ID on the platform
    externalId: text('external_id').notNull(),
    // Market title/question
    title: text('title').notNull(),
    // Detailed description
    description: text('description'),
    // Category or tags
    category: text('category'),
    // Current status
    status: text('status').notNull().default('active'), // 'active' | 'closed' | 'resolved' | 'suspended'
    // Resolution/expiry date
    endDate: timestamp('end_date'),
    // Resolution outcome (if resolved)
    outcome: text('outcome'), // 'yes' | 'no' | null
    // Whether the market is active for trading
    isActive: boolean('is_active').default(true),
    // 24-hour trading volume in USD
    volume24h: numeric('volume_24h', { precision: 18, scale: 2 }),
    // Current liquidity in USD
    liquidity: numeric('liquidity', { precision: 18, scale: 2 }),
    // Original platform-specific data
    metadata: jsonb('metadata'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    platformIdx: index('markets_platform_idx').on(table.platform),
    statusIdx: index('markets_status_idx').on(table.status),
    activeIdx: index('markets_active_idx').on(table.isActive),
    categoryIdx: index('markets_category_idx').on(table.category),
    endDateIdx: index('markets_end_date_idx').on(table.endDate),
    platformExternalIdx: uniqueIndex('markets_platform_external_idx').on(table.platform, table.externalId),
  })
);

/**
 * Outcomes table - stores outcome information for each market
 */
export const outcomes = pgTable(
  'outcomes',
  {
    // Primary key: platform:marketId:externalId
    id: text('id').primaryKey(),
    // Reference to market
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id, { onDelete: 'cascade' }),
    // External ID on the platform
    externalId: text('external_id').notNull(),
    // Outcome name (e.g., "Yes", "No")
    name: text('name').notNull(),
    // Outcome type
    type: text('type').notNull(), // 'yes' | 'no'
    // Current probability (0-1)
    probability: numeric('probability', { precision: 10, scale: 6 }),
    // Best bid price (0-1)
    bestBid: numeric('best_bid', { precision: 10, scale: 6 }),
    // Best ask price (0-1)
    bestAsk: numeric('best_ask', { precision: 10, scale: 6 }),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    marketIdx: index('outcomes_market_idx').on(table.marketId),
    typeIdx: index('outcomes_type_idx').on(table.type),
  })
);

/**
 * Market pairs table - stores matched markets across platforms for arbitrage
 */
export const marketPairs = pgTable(
  'market_pairs',
  {
    // Primary key
    id: text('id').primaryKey(),
    // References to markets on each platform
    polymarketId: text('polymarket_id')
      .notNull()
      .references(() => markets.id),
    kalshiId: text('kalshi_id')
      .notNull()
      .references(() => markets.id),
    // Titles for quick reference
    polymarketTitle: text('polymarket_title').notNull(),
    kalshiTitle: text('kalshi_title').notNull(),
    // Match confidence score (0-1)
    confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
    // Outcome mappings as JSON
    outcomeMapping: jsonb('outcome_mapping').notNull(),
    // Whether this pair is active for trading
    isActive: boolean('is_active').default(true),
    // When this match was verified
    verifiedAt: timestamp('verified_at').notNull(),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    polymarketIdx: index('pairs_polymarket_idx').on(table.polymarketId),
    kalshiIdx: index('pairs_kalshi_idx').on(table.kalshiId),
    activeIdx: index('pairs_active_idx').on(table.isActive),
    uniquePairIdx: uniqueIndex('pairs_unique_idx').on(table.polymarketId, table.kalshiId),
  })
);

/**
 * Price history table - time-series data for market prices
 * Note: If using TimescaleDB, convert to hypertable after creation:
 * SELECT create_hypertable('price_history', 'timestamp');
 */
export const priceHistory = pgTable(
  'price_history',
  {
    // Composite primary key will be (timestamp, marketId, outcomeId)
    id: text('id').primaryKey(),
    // Reference to market
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    // Reference to outcome
    outcomeId: text('outcome_id').notNull(),
    // Platform
    platform: text('platform').notNull(),
    // Price data
    bestBid: numeric('best_bid', { precision: 10, scale: 6 }),
    bestAsk: numeric('best_ask', { precision: 10, scale: 6 }),
    midPrice: numeric('mid_price', { precision: 10, scale: 6 }),
    spread: numeric('spread', { precision: 10, scale: 6 }),
    // Size data
    bidSize: numeric('bid_size', { precision: 18, scale: 2 }),
    askSize: numeric('ask_size', { precision: 18, scale: 2 }),
    // Volume
    volume: numeric('volume', { precision: 18, scale: 2 }),
    // Timestamp (primary for time-series)
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (table) => ({
    timestampIdx: index('price_history_timestamp_idx').on(table.timestamp),
    marketTimestampIdx: index('price_history_market_timestamp_idx').on(table.marketId, table.timestamp),
    platformIdx: index('price_history_platform_idx').on(table.platform),
  })
);

// Type exports
export type Market = typeof markets.$inferSelect;
export type NewMarket = typeof markets.$inferInsert;
export type Outcome = typeof outcomes.$inferSelect;
export type NewOutcome = typeof outcomes.$inferInsert;
export type MarketPair = typeof marketPairs.$inferSelect;
export type NewMarketPair = typeof marketPairs.$inferInsert;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type NewPriceHistory = typeof priceHistory.$inferInsert;
