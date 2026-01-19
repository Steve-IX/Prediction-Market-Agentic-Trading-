// Drizzle schema file for migrations
// This file re-exports all schema tables for drizzle-kit compatibility
// Note: This file is only used by drizzle-kit, not by the application
import { markets, outcomes, marketPairs, priceHistory } from './schema/markets.js';
import { orders, trades, arbitrageOpportunities } from './schema/orders.js';
import { positions, dailyPnl, strategyPerformance, accountSnapshots } from './schema/positions.js';

// Re-export all tables
export {
  markets,
  outcomes,
  marketPairs,
  priceHistory,
  orders,
  trades,
  arbitrageOpportunities,
  positions,
  dailyPnl,
  strategyPerformance,
  accountSnapshots,
};
