import type { ArbitrageOpportunity } from '../../strategies/arbitrage/ArbitrageDetector.js';
import { getDb } from '../index.js';
import { arbitrageOpportunities, type NewArbitrageOpportunity } from '../schema/orders.js';

export class ArbitrageRepository {
  async save(opportunity: ArbitrageOpportunity, wasExecuted = false): Promise<void> {
    const db = getDb();

    const row: NewArbitrageOpportunity = {
      id: opportunity.id,
      type: opportunity.type,
      marketPairId: null,
      markets: opportunity.legs.map((l) => ({ platform: l.platform, marketId: l.marketId })),
      legs: opportunity.legs,
      spreadPercent: String(opportunity.spreadBps / 100),
      expectedProfit: String(opportunity.maxProfit),
      expectedProfitBps: String(opportunity.spreadBps),
      maxSize: String(opportunity.maxSize),
      wasExecuted: wasExecuted ? 1 : 0,
      detectedAt: new Date(),
      expiresAt: opportunity.expiresAt,
    };

    await db.insert(arbitrageOpportunities).values(row).onConflictDoNothing();
  }
}
