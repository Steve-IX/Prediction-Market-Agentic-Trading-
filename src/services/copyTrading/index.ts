/**
 * Copy Trading Module
 *
 * Provides copy trading functionality for the prediction market trading bot.
 * Allows users to automatically copy trades from successful Polymarket traders.
 *
 * Main Components:
 * - CopyTradingService: Main orchestrator
 * - TraderMonitor: Detects new trades from tracked traders
 * - PositionTracker: Tracks positions for accurate sell calculations
 * - TradeAggregator: Combines small trades into larger orders
 * - PositionSizingStrategy: Calculates copy sizes (PERCENTAGE, FIXED, ADAPTIVE)
 */

// Main service
export { CopyTradingService, default } from './CopyTradingService.js';

// Sub-services
export { TraderMonitor, traderMonitor } from './TraderMonitor.js';
export { PositionTracker, positionTracker } from './PositionTracker.js';
export { TradeAggregator, tradeAggregator } from './TradeAggregator.js';

// Position sizing
export {
  calculateOrderSize,
  calculateOrderSizeForTrader,
  calculateOrderSizeFromGlobalConfig,
  getTieredMultiplier,
  calculateAdaptivePercent,
  validateTieredMultipliers,
  getRecommendedConfig,
} from './PositionSizingStrategy.js';

// Types
export type {
  SizingStrategy,
  TieredMultiplier,
  AdaptiveParams,
  TraderCopyConfig,
  DetectedTrade,
  AggregatedTrade,
  SizingCalculation,
  CopyTradeResult,
  CopyPosition,
  CopyTradingState,
  CopyTradingStats,
  CopyTradingEvents,
  PolymarketActivity,
  PolymarketPosition,
  CopiedTradesFilter,
  CopyPositionsFilter,
} from './types.js';

// Config types
export type { AggregationConfig } from './TradeAggregator.js';
export type { TraderMonitorConfig } from './TraderMonitor.js';
