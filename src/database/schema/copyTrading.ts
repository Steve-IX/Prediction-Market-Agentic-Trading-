import { pgTable, text, timestamp, boolean, numeric, jsonb, index, integer, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Tracked traders table - traders being monitored for copy trading
 */
export const trackedTraders = pgTable(
  'tracked_traders',
  {
    // Primary key: UUID
    id: text('id').primaryKey(),
    // Trader's wallet address on Polymarket
    address: text('address').notNull().unique(),
    // Display name (optional)
    name: text('name'),
    // Whether actively copying this trader
    isActive: boolean('is_active').default(true),
    // Position sizing strategy: 'PERCENTAGE' | 'FIXED' | 'ADAPTIVE'
    sizingStrategy: text('sizing_strategy').notNull().default('PERCENTAGE'),
    // Base multiplier for position sizing (default 1.0)
    baseMultiplier: numeric('base_multiplier', { precision: 10, scale: 4 }).default('1.0'),
    // Tiered multipliers as JSON array: [{ minSize: 0, maxSize: 100, multiplier: 1.0 }, ...]
    tieredMultipliers: jsonb('tiered_multipliers'),
    // Maximum position size per trade in USD
    maxPositionSize: numeric('max_position_size', { precision: 18, scale: 2 }).default('100'),
    // Minimum trade size to copy in USD
    minTradeSize: numeric('min_trade_size', { precision: 18, scale: 2 }).default('1'),
    // Copy percentage (for PERCENTAGE strategy, 0-100)
    copyPercentage: numeric('copy_percentage', { precision: 5, scale: 2 }).default('10'),
    // Fixed copy amount (for FIXED strategy)
    fixedCopyAmount: numeric('fixed_copy_amount', { precision: 18, scale: 2 }),
    // Aggregation window in milliseconds
    aggregationWindowMs: integer('aggregation_window_ms').default(30000),
    // Minimum trades to aggregate before executing
    aggregationMinTrades: integer('aggregation_min_trades').default(2),
    // Whether trade aggregation is enabled
    aggregationEnabled: boolean('aggregation_enabled').default(true),
    // Maximum positions per market
    maxPositionsPerMarket: integer('max_positions_per_market').default(10),
    // Maximum total exposure for this trader in USD
    maxExposure: numeric('max_exposure', { precision: 18, scale: 2 }).default('1000'),
    // Performance metrics (updated periodically)
    totalCopiedTrades: integer('total_copied_trades').default(0),
    totalPnl: numeric('total_pnl', { precision: 18, scale: 2 }).default('0'),
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).default('0'),
    winRate: numeric('win_rate', { precision: 5, scale: 4 }),
    // Discovery metadata
    discoveredAt: timestamp('discovered_at'),
    discoveryScore: numeric('discovery_score', { precision: 10, scale: 4 }),
    // Notes for this trader
    notes: text('notes'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    addressIdx: index('tracked_traders_address_idx').on(table.address),
    activeIdx: index('tracked_traders_active_idx').on(table.isActive),
    pnlIdx: index('tracked_traders_pnl_idx').on(table.totalPnl),
  })
);

/**
 * Copied trades table - record of all trades copied from tracked traders
 */
export const copiedTrades = pgTable(
  'copied_trades',
  {
    // Primary key: UUID
    id: text('id').primaryKey(),
    // Reference to tracked trader
    traderId: text('trader_id')
      .notNull()
      .references(() => trackedTraders.id),
    // Original trade details from the trader
    originalTradeId: text('original_trade_id'),
    originalTransactionHash: text('original_transaction_hash'),
    originalMarketId: text('original_market_id').notNull(),
    originalOutcomeId: text('original_outcome_id').notNull(),
    originalOutcomeName: text('original_outcome_name'),
    originalMarketTitle: text('original_market_title'),
    originalSide: text('original_side').notNull(), // 'BUY' | 'SELL'
    originalPrice: numeric('original_price', { precision: 10, scale: 6 }).notNull(),
    originalSize: numeric('original_size', { precision: 18, scale: 6 }).notNull(),
    originalUsdcSize: numeric('original_usdc_size', { precision: 18, scale: 2 }).notNull(),
    originalTimestamp: timestamp('original_timestamp').notNull(),
    // Our copied trade details
    copiedOrderId: text('copied_order_id'),
    copiedPrice: numeric('copied_price', { precision: 10, scale: 6 }),
    copiedSize: numeric('copied_size', { precision: 18, scale: 6 }),
    copiedUsdcSize: numeric('copied_usdc_size', { precision: 18, scale: 2 }),
    copiedTimestamp: timestamp('copied_timestamp'),
    // Status: 'pending' | 'executing' | 'executed' | 'failed' | 'skipped' | 'aggregated'
    status: text('status').notNull().default('pending'),
    failureReason: text('failure_reason'),
    skipReason: text('skip_reason'),
    // Sizing details
    sizingStrategy: text('sizing_strategy'),
    multiplierUsed: numeric('multiplier_used', { precision: 10, scale: 4 }),
    calculatedSize: numeric('calculated_size', { precision: 18, scale: 2 }),
    // Slippage tracking
    expectedPrice: numeric('expected_price', { precision: 10, scale: 6 }),
    actualSlippage: numeric('actual_slippage', { precision: 10, scale: 6 }),
    // Aggregation tracking
    isAggregated: boolean('is_aggregated').default(false),
    aggregationGroupId: text('aggregation_group_id'),
    // P&L tracking (filled when position is closed)
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }),
    // Latency tracking
    detectionLatencyMs: integer('detection_latency_ms'),
    executionLatencyMs: integer('execution_latency_ms'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    traderIdx: index('copied_trades_trader_idx').on(table.traderId),
    marketIdx: index('copied_trades_market_idx').on(table.originalMarketId),
    statusIdx: index('copied_trades_status_idx').on(table.status),
    timestampIdx: index('copied_trades_timestamp_idx').on(table.originalTimestamp),
    aggregationIdx: index('copied_trades_aggregation_idx').on(table.aggregationGroupId),
    sideIdx: index('copied_trades_side_idx').on(table.originalSide),
  })
);

/**
 * Copy trading positions table - tracks our positions from copy trading
 * Used for accurate sell calculations
 */
export const copyTradingPositions = pgTable(
  'copy_trading_positions',
  {
    // Primary key: UUID
    id: text('id').primaryKey(),
    // Reference to tracked trader
    traderId: text('trader_id')
      .notNull()
      .references(() => trackedTraders.id),
    // Market/outcome identifiers
    marketId: text('market_id').notNull(),
    outcomeId: text('outcome_id').notNull(),
    outcomeName: text('outcome_name'),
    marketTitle: text('market_title'),
    // Position details
    side: text('side').notNull(), // 'long' | 'short'
    // Number of tokens/shares held
    size: numeric('size', { precision: 18, scale: 6 }).notNull(),
    // Average entry price
    avgEntryPrice: numeric('avg_entry_price', { precision: 10, scale: 6 }).notNull(),
    // Total cost basis in USD
    totalCost: numeric('total_cost', { precision: 18, scale: 2 }).notNull(),
    // Current market price (updated periodically)
    currentPrice: numeric('current_price', { precision: 10, scale: 6 }),
    // Current value in USD
    currentValue: numeric('current_value', { precision: 18, scale: 2 }),
    // Status
    isOpen: boolean('is_open').default(true),
    // P&L
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).default('0'),
    unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 2 }),
    percentPnl: numeric('percent_pnl', { precision: 10, scale: 4 }),
    // Number of buys/sells for this position
    buyCount: integer('buy_count').default(0),
    sellCount: integer('sell_count').default(0),
    totalBought: numeric('total_bought', { precision: 18, scale: 6 }).default('0'),
    totalSold: numeric('total_sold', { precision: 18, scale: 6 }).default('0'),
    // Timestamps
    openedAt: timestamp('opened_at').defaultNow(),
    closedAt: timestamp('closed_at'),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    traderIdx: index('ctp_trader_idx').on(table.traderId),
    marketIdx: index('ctp_market_idx').on(table.marketId),
    openIdx: index('ctp_open_idx').on(table.isOpen),
    uniquePositionIdx: uniqueIndex('ctp_unique_position_idx').on(
      table.traderId,
      table.marketId,
      table.outcomeId
    ),
  })
);

/**
 * Trader discovery cache table - caches trader performance data
 */
export const traderDiscoveryCache = pgTable(
  'trader_discovery_cache',
  {
    // Primary key: UUID
    id: text('id').primaryKey(),
    // Trader address
    address: text('address').notNull().unique(),
    // Display name (if available)
    name: text('name'),
    // Basic metrics
    totalTrades: integer('total_trades').default(0),
    winningTrades: integer('winning_trades').default(0),
    losingTrades: integer('losing_trades').default(0),
    totalPnl: numeric('total_pnl', { precision: 18, scale: 2 }).default('0'),
    totalVolume: numeric('total_volume', { precision: 18, scale: 2 }).default('0'),
    avgTradeSize: numeric('avg_trade_size', { precision: 18, scale: 2 }),
    // Calculated metrics
    winRate: numeric('win_rate', { precision: 5, scale: 4 }),
    roi: numeric('roi', { precision: 10, scale: 4 }),
    profitFactor: numeric('profit_factor', { precision: 10, scale: 4 }),
    sharpeRatio: numeric('sharpe_ratio', { precision: 10, scale: 4 }),
    maxDrawdown: numeric('max_drawdown', { precision: 10, scale: 4 }),
    avgHoldingPeriodHours: numeric('avg_holding_period_hours', { precision: 10, scale: 2 }),
    // Time-based metrics
    activeDays: integer('active_days'),
    avgTradesPerDay: numeric('avg_trades_per_day', { precision: 10, scale: 2 }),
    firstTradeAt: timestamp('first_trade_at'),
    lastTradeAt: timestamp('last_trade_at'),
    // Current positions
    openPositions: integer('open_positions').default(0),
    totalExposure: numeric('total_exposure', { precision: 18, scale: 2 }),
    // Simulation results (last run)
    simulatedPnl: numeric('simulated_pnl', { precision: 18, scale: 2 }),
    simulatedRoi: numeric('simulated_roi', { precision: 10, scale: 4 }),
    simulationPeriodDays: integer('simulation_period_days'),
    // Composite rank score (0-100)
    rankScore: numeric('rank_score', { precision: 10, scale: 4 }),
    // Raw data cache (recent trades for quick analysis)
    recentTrades: jsonb('recent_trades'),
    // Polymarket profile data
    profileMetadata: jsonb('profile_metadata'),
    // Cache metadata
    cachedAt: timestamp('cached_at').defaultNow(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => ({
    addressIdx: index('tdc_address_idx').on(table.address),
    rankIdx: index('tdc_rank_idx').on(table.rankScore),
    winRateIdx: index('tdc_win_rate_idx').on(table.winRate),
    roiIdx: index('tdc_roi_idx').on(table.roi),
    pnlIdx: index('tdc_pnl_idx').on(table.totalPnl),
    volumeIdx: index('tdc_volume_idx').on(table.totalVolume),
    expiresIdx: index('tdc_expires_idx').on(table.expiresAt),
  })
);

/**
 * Copy trading simulation results table
 */
export const copySimulationResults = pgTable(
  'copy_simulation_results',
  {
    // Primary key: UUID
    id: text('id').primaryKey(),
    // Trader being simulated
    traderAddress: text('trader_address').notNull(),
    // Simulation parameters
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    periodDays: integer('period_days').notNull(),
    initialCapital: numeric('initial_capital', { precision: 18, scale: 2 }).notNull(),
    sizingStrategy: text('sizing_strategy').notNull(),
    multiplier: numeric('multiplier', { precision: 10, scale: 4 }).notNull(),
    maxPositionSize: numeric('max_position_size', { precision: 18, scale: 2 }),
    copyPercentage: numeric('copy_percentage', { precision: 5, scale: 2 }),
    includeSlippage: boolean('include_slippage').default(true),
    slippagePercent: numeric('slippage_percent', { precision: 5, scale: 2 }).default('0.5'),
    // Results
    finalCapital: numeric('final_capital', { precision: 18, scale: 2 }),
    totalPnl: numeric('total_pnl', { precision: 18, scale: 2 }),
    totalTrades: integer('total_trades'),
    copiedTrades: integer('copied_trades'),
    skippedTrades: integer('skipped_trades'),
    winningTrades: integer('winning_trades'),
    losingTrades: integer('losing_trades'),
    roi: numeric('roi', { precision: 10, scale: 4 }),
    winRate: numeric('win_rate', { precision: 5, scale: 4 }),
    maxDrawdown: numeric('max_drawdown', { precision: 10, scale: 4 }),
    sharpeRatio: numeric('sharpe_ratio', { precision: 10, scale: 4 }),
    profitFactor: numeric('profit_factor', { precision: 10, scale: 4 }),
    avgTradeProfit: numeric('avg_trade_profit', { precision: 18, scale: 2 }),
    largestWin: numeric('largest_win', { precision: 18, scale: 2 }),
    largestLoss: numeric('largest_loss', { precision: 18, scale: 2 }),
    // Detailed results (JSON for flexibility)
    tradeResults: jsonb('trade_results'),
    positionSnapshots: jsonb('position_snapshots'),
    equityCurve: jsonb('equity_curve'),
    // Timestamps
    simulatedAt: timestamp('simulated_at').defaultNow(),
  },
  (table) => ({
    traderIdx: index('csr_trader_idx').on(table.traderAddress),
    dateIdx: index('csr_date_idx').on(table.startDate, table.endDate),
    roiIdx: index('csr_roi_idx').on(table.roi),
    simulatedAtIdx: index('csr_simulated_at_idx').on(table.simulatedAt),
  })
);

/**
 * Trade aggregation groups table - tracks grouped trades for aggregation
 */
export const tradeAggregationGroups = pgTable(
  'trade_aggregation_groups',
  {
    // Primary key: UUID
    id: text('id').primaryKey(),
    // Reference to tracked trader
    traderId: text('trader_id')
      .notNull()
      .references(() => trackedTraders.id),
    // Market/outcome identifiers
    marketId: text('market_id').notNull(),
    outcomeId: text('outcome_id').notNull(),
    side: text('side').notNull(), // 'BUY' | 'SELL'
    // Aggregated values
    totalSize: numeric('total_size', { precision: 18, scale: 6 }).notNull(),
    totalUsdcSize: numeric('total_usdc_size', { precision: 18, scale: 2 }).notNull(),
    avgPrice: numeric('avg_price', { precision: 10, scale: 6 }).notNull(),
    tradeCount: integer('trade_count').notNull(),
    // Status: 'pending' | 'ready' | 'executed' | 'failed' | 'expired'
    status: text('status').notNull().default('pending'),
    // Timing
    firstTradeAt: timestamp('first_trade_at').notNull(),
    lastTradeAt: timestamp('last_trade_at').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    executedAt: timestamp('executed_at'),
    // Execution result
    executedOrderId: text('executed_order_id'),
    executionError: text('execution_error'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    traderIdx: index('tag_trader_idx').on(table.traderId),
    marketIdx: index('tag_market_idx').on(table.marketId),
    statusIdx: index('tag_status_idx').on(table.status),
    expiresIdx: index('tag_expires_idx').on(table.expiresAt),
  })
);

// Type exports
export type TrackedTrader = typeof trackedTraders.$inferSelect;
export type NewTrackedTrader = typeof trackedTraders.$inferInsert;
export type CopiedTrade = typeof copiedTrades.$inferSelect;
export type NewCopiedTrade = typeof copiedTrades.$inferInsert;
export type CopyTradingPosition = typeof copyTradingPositions.$inferSelect;
export type NewCopyTradingPosition = typeof copyTradingPositions.$inferInsert;
export type TraderDiscoveryCache = typeof traderDiscoveryCache.$inferSelect;
export type NewTraderDiscoveryCache = typeof traderDiscoveryCache.$inferInsert;
export type CopySimulationResult = typeof copySimulationResults.$inferSelect;
export type NewCopySimulationResult = typeof copySimulationResults.$inferInsert;
export type TradeAggregationGroup = typeof tradeAggregationGroups.$inferSelect;
export type NewTradeAggregationGroup = typeof tradeAggregationGroups.$inferInsert;
