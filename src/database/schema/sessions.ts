import { pgTable, text, timestamp, numeric, index, jsonb } from 'drizzle-orm/pg-core';

/**
 * Trading sessions table - tracks each trading session
 */
export const sessions = pgTable(
  'trading_sessions',
  {
    // Primary key: UUID
    id: text('id').primaryKey(),
    
    // Timing
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time'),
    durationSeconds: numeric('duration_seconds', { precision: 10, scale: 2 }),
    
    // Starting state
    startBalance: numeric('start_balance', { precision: 18, scale: 2 }).notNull(),
    startTradesCount: numeric('start_trades_count', { precision: 10, scale: 0 }).default('0'),
    
    // Ending state
    endBalance: numeric('end_balance', { precision: 18, scale: 2 }),
    endTradesCount: numeric('end_trades_count', { precision: 10, scale: 0 }),
    
    // Calculated metrics
    netPnl: numeric('net_pnl', { precision: 18, scale: 2 }),
    tradesExecuted: numeric('trades_executed', { precision: 10, scale: 0 }).default('0'),
    opportunitiesDetected: numeric('opportunities_detected', { precision: 10, scale: 0 }).default('0'),
    executionsSucceeded: numeric('executions_succeeded', { precision: 10, scale: 0 }).default('0'),
    
    // Performance metrics (calculated from trades in this session)
    winRate: numeric('win_rate', { precision: 5, scale: 4 }), // 0-1
    profitFactor: numeric('profit_factor', { precision: 10, scale: 4 }),
    sharpeRatio: numeric('sharpe_ratio', { precision: 10, scale: 4 }),
    maxDrawdown: numeric('max_drawdown', { precision: 18, scale: 2 }),
    maxDrawdownPercent: numeric('max_drawdown_percent', { precision: 5, scale: 2 }),
    
    // Strategy breakdown
    strategiesUsed: jsonb('strategies_used').$type<string[]>(),
    pnlByStrategy: jsonb('pnl_by_strategy').$type<Record<string, number>>(),
    
    // Metadata
    mode: text('mode').notNull().default('paper'), // 'paper' | 'live'
    notes: text('notes'),
    
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    startTimeIdx: index('sessions_start_time_idx').on(table.startTime),
    modeIdx: index('sessions_mode_idx').on(table.mode),
    endTimeIdx: index('sessions_end_time_idx').on(table.endTime),
  })
);

/**
 * Session type for TypeScript
 */
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
