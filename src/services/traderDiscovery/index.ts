/**
 * Trader Discovery Module
 *
 * Provides trader discovery, analysis, ranking, and copy trading simulation
 * for the prediction market trading bot.
 *
 * Main Components:
 * - TraderDiscoveryService: Main orchestrator
 * - TraderCache: Caches trader performance data
 * - TraderAnalyzer: Analyzes trader performance from trade history
 * - TraderRanker: Ranks traders by configurable criteria
 * - CopySimulator: Simulates copy trading to backtest profitability
 */

// Main service
export { TraderDiscoveryService, traderDiscoveryService, default } from './TraderDiscoveryService.js';

// Sub-services
export { TraderCache, traderCache } from './TraderCache.js';
export { TraderAnalyzer, traderAnalyzer } from './TraderAnalyzer.js';
export { TraderRanker, traderRanker, DEFAULT_RANKING_CRITERIA } from './TraderRanker.js';
export { CopySimulator, copySimulator } from './CopySimulator.js';

// Types
export type {
  TraderPerformance,
  RankingCriteria,
  RankedTrader,
  SimulationParams,
  SimulationResult,
  SimulatedTradeResult,
  EquityPoint,
  PositionSnapshot,
  DiscoveryFilter,
  TraderCacheEntry,
  TraderDiscoveryState,
  TraderDiscoveryEvents,
  BatchSimulationRequest,
  BatchSimulationResult,
  TradeHistoryOptions,
  MarketCategory,
  TraderSpecialization,
} from './types.js';

// Config types
export type { TraderCacheConfig } from './TraderCache.js';
export type { TraderAnalyzerConfig } from './TraderAnalyzer.js';
export type { CopySimulatorConfig } from './CopySimulator.js';
export type { TraderDiscoveryServiceConfig } from './TraderDiscoveryService.js';
