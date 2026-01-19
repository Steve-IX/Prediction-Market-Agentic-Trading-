// Standalone schema file for drizzle-kit migrations
// This file contains all schema definitions without external imports
import { pgTable, text, timestamp, boolean, numeric, jsonb, index, uniqueIndex, integer } from 'drizzle-orm/pg-core';

// Markets table
export const markets = pgTable(
  'markets',
  {
    id: text('id').primaryKey(),
    platform: text('platform').notNull(),
    externalId: text('external_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category'),
    status: text('status').notNull().default('active'),
    endDate: timestamp('end_date'),
    outcome: text('outcome'),
    isActive: boolean('is_active').default(true),
    volume24h: numeric('volume_24h', { precision: 18, scale: 2 }),
    liquidity: numeric('liquidity', { precision: 18, scale: 2 }),
    metadata: jsonb('metadata'),
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

// Outcomes table
export const outcomes = pgTable(
  'outcomes',
  {
    id: text('id').primaryKey(),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    probability: numeric('probability', { precision: 10, scale: 6 }),
    bestBid: numeric('best_bid', { precision: 10, scale: 6 }),
    bestAsk: numeric('best_ask', { precision: 10, scale: 6 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    marketIdx: index('outcomes_market_idx').on(table.marketId),
    typeIdx: index('outcomes_type_idx').on(table.type),
  })
);

// Market pairs table
export const marketPairs = pgTable(
  'market_pairs',
  {
    id: text('id').primaryKey(),
    polymarketId: text('polymarket_id')
      .notNull()
      .references(() => markets.id),
    kalshiId: text('kalshi_id')
      .notNull()
      .references(() => markets.id),
    polymarketTitle: text('polymarket_title').notNull(),
    kalshiTitle: text('kalshi_title').notNull(),
    confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
    outcomeMapping: jsonb('outcome_mapping').notNull(),
    isActive: boolean('is_active').default(true),
    verifiedAt: timestamp('verified_at').notNull(),
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

// Price history table
export const priceHistory = pgTable(
  'price_history',
  {
    id: text('id').primaryKey(),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    outcomeId: text('outcome_id').notNull(),
    platform: text('platform').notNull(),
    bestBid: numeric('best_bid', { precision: 10, scale: 6 }),
    bestAsk: numeric('best_ask', { precision: 10, scale: 6 }),
    midPrice: numeric('mid_price', { precision: 10, scale: 6 }),
    spread: numeric('spread', { precision: 10, scale: 6 }),
    bidSize: numeric('bid_size', { precision: 18, scale: 2 }),
    askSize: numeric('ask_size', { precision: 18, scale: 2 }),
    volume: numeric('volume', { precision: 18, scale: 2 }),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (table) => ({
    timestampIdx: index('price_history_timestamp_idx').on(table.timestamp),
    marketTimestampIdx: index('price_history_market_timestamp_idx').on(table.marketId, table.timestamp),
    platformIdx: index('price_history_platform_idx').on(table.platform),
  })
);

// Orders table
export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    platform: text('platform').notNull(),
    externalOrderId: text('external_order_id'),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    outcomeId: text('outcome_id').notNull(),
    side: text('side').notNull(),
    type: text('type').notNull(),
    price: numeric('price', { precision: 10, scale: 6 }).notNull(),
    size: numeric('size', { precision: 18, scale: 2 }).notNull(),
    filledSize: numeric('filled_size', { precision: 18, scale: 2 }).default('0'),
    avgFillPrice: numeric('avg_fill_price', { precision: 10, scale: 6 }),
    status: text('status').notNull().default('pending'),
    strategyId: text('strategy_id'),
    expiresAt: timestamp('expires_at'),
    metadata: jsonb('metadata'),
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

// Trades table
export const trades = pgTable(
  'trades',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    platform: text('platform').notNull(),
    externalTradeId: text('external_trade_id'),
    marketId: text('market_id').notNull(),
    outcomeId: text('outcome_id').notNull(),
    side: text('side').notNull(),
    price: numeric('price', { precision: 10, scale: 6 }).notNull(),
    size: numeric('size', { precision: 18, scale: 2 }).notNull(),
    fee: numeric('fee', { precision: 18, scale: 6 }).default('0'),
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }),
    strategyId: text('strategy_id'),
    executedAt: timestamp('executed_at').notNull(),
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

// Arbitrage opportunities table
export const arbitrageOpportunities = pgTable(
  'arbitrage_opportunities',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    marketPairId: text('market_pair_id'),
    markets: jsonb('markets').notNull(),
    legs: jsonb('legs').notNull(),
    spreadPercent: numeric('spread_percent', { precision: 10, scale: 4 }).notNull(),
    expectedProfit: numeric('expected_profit', { precision: 18, scale: 2 }).notNull(),
    expectedProfitBps: numeric('expected_profit_bps', { precision: 10, scale: 2 }).notNull(),
    maxSize: numeric('max_size', { precision: 18, scale: 2 }).notNull(),
    wasExecuted: integer('was_executed').default(0),
    executionResult: jsonb('execution_result'),
    detectedAt: timestamp('detected_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    typeIdx: index('arb_type_idx').on(table.type),
    marketPairIdx: index('arb_market_pair_idx').on(table.marketPairId),
    detectedAtIdx: index('arb_detected_at_idx').on(table.detectedAt),
    executedIdx: index('arb_executed_idx').on(table.wasExecuted),
  })
);

// Positions table
export const positions = pgTable(
  'positions',
  {
    id: text('id').primaryKey(),
    platform: text('platform').notNull(),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    outcomeId: text('outcome_id').notNull(),
    outcomeName: text('outcome_name').notNull(),
    side: text('side').notNull(),
    size: numeric('size', { precision: 18, scale: 6 }).notNull(),
    avgEntryPrice: numeric('avg_entry_price', { precision: 10, scale: 6 }).notNull(),
    currentPrice: numeric('current_price', { precision: 10, scale: 6 }),
    unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 2 }).default('0'),
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).default('0'),
    isOpen: integer('is_open').default(1),
    openedAt: timestamp('opened_at').notNull(),
    closedAt: timestamp('closed_at'),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    platformIdx: index('positions_platform_idx').on(table.platform),
    marketIdx: index('positions_market_idx').on(table.marketId),
    openIdx: index('positions_open_idx').on(table.isOpen),
    sideIdx: index('positions_side_idx').on(table.side),
  })
);

// Daily P&L table
export const dailyPnl = pgTable(
  'daily_pnl',
  {
    id: text('id').primaryKey(),
    date: timestamp('date').notNull(),
    platform: text('platform').notNull(),
    strategyId: text('strategy_id'),
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
    unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
    totalPnl: numeric('total_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
    fees: numeric('fees', { precision: 18, scale: 6 }).default('0'),
    tradesCount: integer('trades_count').default(0),
    winCount: integer('win_count').default(0),
    lossCount: integer('loss_count').default(0),
    winRate: numeric('win_rate', { precision: 5, scale: 4 }),
    avgWinSize: numeric('avg_win_size', { precision: 18, scale: 2 }),
    avgLossSize: numeric('avg_loss_size', { precision: 18, scale: 2 }),
    volume: numeric('volume', { precision: 18, scale: 2 }).default('0'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    dateIdx: index('daily_pnl_date_idx').on(table.date),
    platformIdx: index('daily_pnl_platform_idx').on(table.platform),
    strategyIdx: index('daily_pnl_strategy_idx').on(table.strategyId),
    datePlatformIdx: index('daily_pnl_date_platform_idx').on(table.date, table.platform),
  })
);

// Strategy performance table
export const strategyPerformance = pgTable(
  'strategy_performance',
  {
    id: text('id').primaryKey(),
    strategyId: text('strategy_id').notNull(),
    date: timestamp('date').notNull(),
    tradesCount: integer('trades_count').default(0),
    winCount: integer('win_count').default(0),
    lossCount: integer('loss_count').default(0),
    grossPnl: numeric('gross_pnl', { precision: 18, scale: 2 }).default('0'),
    fees: numeric('fees', { precision: 18, scale: 6 }).default('0'),
    netPnl: numeric('net_pnl', { precision: 18, scale: 2 }).default('0'),
    maxDrawdown: numeric('max_drawdown', { precision: 18, scale: 2 }),
    maxDrawdownPercent: numeric('max_drawdown_percent', { precision: 5, scale: 4 }),
    sharpeRatio: numeric('sharpe_ratio', { precision: 10, scale: 4 }),
    winRate: numeric('win_rate', { precision: 5, scale: 4 }),
    profitFactor: numeric('profit_factor', { precision: 10, scale: 4 }),
    volume: numeric('volume', { precision: 18, scale: 2 }).default('0'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    strategyIdx: index('perf_strategy_idx').on(table.strategyId),
    dateIdx: index('perf_date_idx').on(table.date),
    strategyDateIdx: index('perf_strategy_date_idx').on(table.strategyId, table.date),
  })
);

// Account snapshots table
export const accountSnapshots = pgTable(
  'account_snapshots',
  {
    id: text('id').primaryKey(),
    platform: text('platform').notNull(),
    availableBalance: numeric('available_balance', { precision: 18, scale: 2 }).notNull(),
    lockedBalance: numeric('locked_balance', { precision: 18, scale: 2 }).notNull(),
    totalBalance: numeric('total_balance', { precision: 18, scale: 2 }).notNull(),
    positionValue: numeric('position_value', { precision: 18, scale: 2 }),
    totalEquity: numeric('total_equity', { precision: 18, scale: 2 }),
    unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 2 }),
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }),
    totalExposure: numeric('total_exposure', { precision: 18, scale: 2 }),
    openPositionsCount: integer('open_positions_count').default(0),
    openOrdersCount: integer('open_orders_count').default(0),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (table) => ({
    platformIdx: index('snapshots_platform_idx').on(table.platform),
    timestampIdx: index('snapshots_timestamp_idx').on(table.timestamp),
    platformTimestampIdx: index('snapshots_platform_timestamp_idx').on(table.platform, table.timestamp),
  })
);
