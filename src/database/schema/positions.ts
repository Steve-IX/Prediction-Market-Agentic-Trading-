import { pgTable, text, timestamp, numeric, integer, index } from 'drizzle-orm/pg-core';
import { markets } from './markets.js';

/**
 * Positions table - current open positions
 */
export const positions = pgTable(
  'positions',
  {
    // Primary key: platform:marketId:outcomeId
    id: text('id').primaryKey(),
    // Platform
    platform: text('platform').notNull(), // 'polymarket' | 'kalshi'
    // Reference to market
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    // Outcome ID
    outcomeId: text('outcome_id').notNull(),
    // Outcome name
    outcomeName: text('outcome_name').notNull(),
    // Position side (positive for long, negative for short)
    side: text('side').notNull(), // 'long' | 'short'
    // Position size in contracts
    size: numeric('size', { precision: 18, scale: 6 }).notNull(),
    // Average entry price
    avgEntryPrice: numeric('avg_entry_price', { precision: 10, scale: 6 }).notNull(),
    // Current market price
    currentPrice: numeric('current_price', { precision: 10, scale: 6 }),
    // Unrealized P&L
    unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 2 }).default('0'),
    // Realized P&L
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).default('0'),
    // Whether position is open
    isOpen: integer('is_open').default(1), // 1 = true, 0 = false
    // When position was opened
    openedAt: timestamp('opened_at').notNull(),
    // When position was closed (if closed)
    closedAt: timestamp('closed_at'),
    // Timestamps
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    platformIdx: index('positions_platform_idx').on(table.platform),
    marketIdx: index('positions_market_idx').on(table.marketId),
    openIdx: index('positions_open_idx').on(table.isOpen),
    sideIdx: index('positions_side_idx').on(table.side),
  })
);

/**
 * Daily P&L table - aggregated daily performance metrics
 */
export const dailyPnl = pgTable(
  'daily_pnl',
  {
    // Primary key
    id: text('id').primaryKey(),
    // Date (day granularity)
    date: timestamp('date').notNull(),
    // Platform (or 'all' for aggregate)
    platform: text('platform').notNull(),
    // Strategy (or 'all' for aggregate)
    strategyId: text('strategy_id'),
    // P&L metrics
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
    unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
    totalPnl: numeric('total_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
    // Fees
    fees: numeric('fees', { precision: 18, scale: 6 }).default('0'),
    // Trade counts
    tradesCount: integer('trades_count').default(0),
    winCount: integer('win_count').default(0),
    lossCount: integer('loss_count').default(0),
    // Performance metrics
    winRate: numeric('win_rate', { precision: 5, scale: 4 }),
    avgWinSize: numeric('avg_win_size', { precision: 18, scale: 2 }),
    avgLossSize: numeric('avg_loss_size', { precision: 18, scale: 2 }),
    // Volume
    volume: numeric('volume', { precision: 18, scale: 2 }).default('0'),
    // Timestamps
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

/**
 * Strategy performance table - historical performance by strategy
 */
export const strategyPerformance = pgTable(
  'strategy_performance',
  {
    // Primary key
    id: text('id').primaryKey(),
    // Strategy identifier
    strategyId: text('strategy_id').notNull(),
    // Date
    date: timestamp('date').notNull(),
    // Trade metrics
    tradesCount: integer('trades_count').default(0),
    winCount: integer('win_count').default(0),
    lossCount: integer('loss_count').default(0),
    // P&L
    grossPnl: numeric('gross_pnl', { precision: 18, scale: 2 }).default('0'),
    fees: numeric('fees', { precision: 18, scale: 6 }).default('0'),
    netPnl: numeric('net_pnl', { precision: 18, scale: 2 }).default('0'),
    // Risk metrics
    maxDrawdown: numeric('max_drawdown', { precision: 18, scale: 2 }),
    maxDrawdownPercent: numeric('max_drawdown_percent', { precision: 5, scale: 4 }),
    // Performance ratios
    sharpeRatio: numeric('sharpe_ratio', { precision: 10, scale: 4 }),
    winRate: numeric('win_rate', { precision: 5, scale: 4 }),
    profitFactor: numeric('profit_factor', { precision: 10, scale: 4 }),
    // Volume
    volume: numeric('volume', { precision: 18, scale: 2 }).default('0'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    strategyIdx: index('perf_strategy_idx').on(table.strategyId),
    dateIdx: index('perf_date_idx').on(table.date),
    strategyDateIdx: index('perf_strategy_date_idx').on(table.strategyId, table.date),
  })
);

/**
 * Account snapshots table - periodic account state snapshots
 */
export const accountSnapshots = pgTable(
  'account_snapshots',
  {
    // Primary key
    id: text('id').primaryKey(),
    // Platform
    platform: text('platform').notNull(),
    // Balance information
    availableBalance: numeric('available_balance', { precision: 18, scale: 2 }).notNull(),
    lockedBalance: numeric('locked_balance', { precision: 18, scale: 2 }).notNull(),
    totalBalance: numeric('total_balance', { precision: 18, scale: 2 }).notNull(),
    // Position value
    positionValue: numeric('position_value', { precision: 18, scale: 2 }),
    // Total equity (balance + positions)
    totalEquity: numeric('total_equity', { precision: 18, scale: 2 }),
    // P&L
    unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 2 }),
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }),
    // Risk metrics
    totalExposure: numeric('total_exposure', { precision: 18, scale: 2 }),
    openPositionsCount: integer('open_positions_count').default(0),
    openOrdersCount: integer('open_orders_count').default(0),
    // Timestamp
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (table) => ({
    platformIdx: index('snapshots_platform_idx').on(table.platform),
    timestampIdx: index('snapshots_timestamp_idx').on(table.timestamp),
    platformTimestampIdx: index('snapshots_platform_timestamp_idx').on(table.platform, table.timestamp),
  })
);

// Type exports
export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
export type DailyPnl = typeof dailyPnl.$inferSelect;
export type NewDailyPnl = typeof dailyPnl.$inferInsert;
export type StrategyPerformance = typeof strategyPerformance.$inferSelect;
export type NewStrategyPerformance = typeof strategyPerformance.$inferInsert;
export type AccountSnapshot = typeof accountSnapshots.$inferSelect;
export type NewAccountSnapshot = typeof accountSnapshots.$inferInsert;
