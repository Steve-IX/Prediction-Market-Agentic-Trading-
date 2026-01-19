export {
  ArbitrageDetector,
  ArbitrageExecutor,
  ArbitrageType,
  type ArbitrageOpportunity,
  type ArbitrageLeg,
  type ExecutionResult,
  type LegExecutionResult,
  type ExecutionOptions,
} from './arbitrage/index.js';

export {
  BaseStrategy,
  type StrategyConfig,
  type StrategyState,
} from './base.js';

import { BaseStrategy } from './base.js';

export {
  MarketMakingStrategy,
  type MarketMakingConfig,
  Quoter,
  InventoryManager,
  calculateSpread,
  type QuoterConfig,
} from './marketMaking/index.js';

export {
  FedWatchStrategy,
  type FedWatchConfig,
  type FedMeeting,
  NewsReactorStrategy,
  type NewsReactorConfig,
} from './signal/index.js';

/**
 * Strategy registry
 */
export class StrategyRegistry {
  private strategies: Map<string, BaseStrategy> = new Map();

  /**
   * Register a strategy
   */
  register(strategy: BaseStrategy): void {
    this.strategies.set(strategy.getConfig().id, strategy);
  }

  /**
   * Get a strategy by ID
   */
  get(id: string): BaseStrategy | undefined {
    return this.strategies.get(id);
  }

  /**
   * Get all strategies
   */
  getAll(): BaseStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get running strategies
   */
  getRunning(): BaseStrategy[] {
    return this.getAll().filter((s) => s.getState().isRunning);
  }

  /**
   * Start all enabled strategies
   */
  async startAll(): Promise<void> {
    const strategies = this.getAll().filter((s) => s.getConfig().enabled);
    await Promise.all(strategies.map((s) => s.start().catch((error) => {
      console.error(`Failed to start strategy ${s.getConfig().id}:`, error);
    })));
  }

  /**
   * Stop all strategies
   */
  async stopAll(): Promise<void> {
    await Promise.all(this.getRunning().map((s) => s.stop().catch((error) => {
      console.error(`Failed to stop strategy ${s.getConfig().id}:`, error);
    })));
  }
}
