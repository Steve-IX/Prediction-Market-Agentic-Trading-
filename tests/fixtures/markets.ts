/**
 * Test market fixtures
 */

import type { NormalizedMarket } from '../../src/clients/shared/interfaces.js';
import { createMockPolymarketMarket } from '../mocks/polymarket.js';
import { createMockKalshiMarket } from '../mocks/kalshi.js';

/**
 * Create a pair of matching markets for arbitrage testing
 */
export function createMatchingMarketPair(): { polymarket: NormalizedMarket; kalshi: NormalizedMarket } {
  const baseTitle = 'Will the Fed raise rates in March 2025?';
  const baseDescription = 'Federal Reserve interest rate decision';

  const polymarket = createMockPolymarketMarket({
    title: baseTitle,
    description: baseDescription,
    category: 'economics',
  });

  const kalshi = createMockKalshiMarket({
    title: baseTitle,
    description: baseDescription,
    category: 'economics',
  });

  return { polymarket, kalshi };
}

/**
 * Create multiple test markets
 */
export function createTestMarkets(count: number): NormalizedMarket[] {
  const markets: NormalizedMarket[] = [];
  for (let i = 0; i < count; i++) {
    markets.push(createMockPolymarketMarket({
      title: `Test Market ${i + 1}`,
      externalId: `test-market-${i + 1}`,
    }));
  }
  return markets;
}
