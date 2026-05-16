import { describe, it, expect } from 'vitest';
import { StrategyManager } from '../../src/strategies/StrategyManager.js';
import type { TradingSignal } from '../../src/strategies/momentum/MomentumStrategy.js';
import { PLATFORMS } from '../../src/config/constants.js';

describe('StrategyManager', () => {
  it('clears spread-hunter signals on markSignalExecuted', () => {
    const manager = new StrategyManager({
      enableMomentum: false,
      enableMeanReversion: false,
      enableOrderbookImbalance: false,
      enableSpreadHunter: true,
      enableVolatilityCapture: false,
      enableProbabilitySum: false,
      enableEndgame: false,
    });

    const spreadHunter = (
      manager as unknown as { spreadHunterStrategy: { activeSignals: Map<string, TradingSignal> } }
    ).spreadHunterStrategy;

    const signal: TradingSignal = {
      id: 'test-1',
      marketId: 'market-1',
      market: {
        platform: PLATFORMS.POLYMARKET,
        externalId: 'market-1',
        title: 'Test',
        outcomes: [],
        isActive: true,
      },
      outcomeId: 'out-1',
      outcomeName: 'Yes',
      side: 'BUY',
      price: 0.5,
      size: 10,
      confidence: 0.8,
      reason: 'test',
      strategy: 'spread-hunter',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
    };

    spreadHunter.activeSignals.set('market-1', signal);
    expect(spreadHunter.activeSignals.has('market-1')).toBe(true);

    manager.markSignalExecuted(signal);
    expect(spreadHunter.activeSignals.has('market-1')).toBe(false);
  });
});
