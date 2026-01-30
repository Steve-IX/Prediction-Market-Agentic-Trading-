// Drizzle schema file for migrations
// This file re-exports all schema tables for drizzle-kit compatibility
// Note: This file is only used by drizzle-kit, not by the application
import { markets, outcomes, marketPairs, priceHistory } from './schema/markets.js';
import { orders, trades, arbitrageOpportunities } from './schema/orders.js';
import { positions, dailyPnl, strategyPerformance, accountSnapshots } from './schema/positions.js';
import {
  trackedTraders,
  copiedTrades,
  copyTradingPositions,
  traderDiscoveryCache,
  copySimulationResults,
  tradeAggregationGroups,
} from './schema/copyTrading.js';

// Re-export all tables
export {
  // Markets
  markets,
  outcomes,
  marketPairs,
  priceHistory,
  // Orders
  orders,
  trades,
  arbitrageOpportunities,
  // Positions
  positions,
  dailyPnl,
  strategyPerformance,
  accountSnapshots,
  // Copy Trading
  trackedTraders,
  copiedTrades,
  copyTradingPositions,
  traderDiscoveryCache,
  copySimulationResults,
  tradeAggregationGroups,
};
