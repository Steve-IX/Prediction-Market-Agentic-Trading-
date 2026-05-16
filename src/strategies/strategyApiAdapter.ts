import type { StrategyManager } from './StrategyManager.js';
import type { TradingEngine } from '../tradingEngine.js';
import { getConfig } from '../config/index.js';

export interface StrategyApiEntry {
  id: string;
  name: string;
  enabled: boolean;
  isRunning: boolean;
  activeSignals: number;
  description?: string;
}

/**
 * Exposes StrategyManager + feature flags for /api/strategies (replaces empty StrategyRegistry).
 */
export function getStrategyApiEntries(
  strategyManager: StrategyManager | null,
  tradingEngine: TradingEngine | null
): StrategyApiEntry[] {
  const config = getConfig();
  const engineRunning = tradingEngine?.getState().isRunning ?? false;
  const activeByStrategy = strategyManager?.getActiveSignalCounts() ?? {};

  const entries: Array<{ id: string; name: string; enabled: boolean }> = [
    { id: 'momentum', name: 'Momentum', enabled: config.features.enableMomentumStrategy },
    { id: 'mean-reversion', name: 'Mean Reversion', enabled: config.features.enableMeanReversionStrategy },
    {
      id: 'orderbook-imbalance',
      name: 'Orderbook Imbalance',
      enabled: config.features.enableOrderbookImbalanceStrategy,
    },
    { id: 'spread-hunter', name: 'Spread Hunter', enabled: config.features.enableSpreadHunterStrategy },
    {
      id: 'volatility-capture',
      name: 'Volatility Capture',
      enabled: config.features.enableVolatilityCaptureStrategy,
    },
    {
      id: 'probability-sum',
      name: 'Probability Sum',
      enabled: config.features.enableProbabilitySumStrategy,
    },
    { id: 'endgame', name: 'Endgame', enabled: config.features.enableEndgameStrategy },
    {
      id: 'cross-platform-arb',
      name: 'Cross-Platform Arbitrage',
      enabled: config.features.enableCrossPlatformArb,
    },
    {
      id: 'single-platform-arb',
      name: 'Single-Platform Arbitrage',
      enabled: config.features.enableSinglePlatformArb,
    },
  ];

  return entries.map((e) => ({
    ...e,
    isRunning: engineRunning && e.enabled,
    activeSignals: activeByStrategy[e.id] ?? 0,
  }));
}
