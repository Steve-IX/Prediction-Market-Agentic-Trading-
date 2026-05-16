import type { NormalizedMarket } from '../../clients/shared/interfaces.js';
import { getDb } from '../index.js';
import { markets, type NewMarket } from '../schema/markets.js';

export class MarketRepository {
  marketDbId(platform: string, externalId: string): string {
    return `${platform}:${externalId}`;
  }

  async upsert(market: NormalizedMarket): Promise<string> {
    const db = getDb();
    const id = this.marketDbId(market.platform, market.externalId);

    const row: NewMarket = {
      id,
      platform: market.platform,
      externalId: market.externalId,
      title: market.title,
      description: market.description ?? null,
      category: market.category ?? null,
      status: market.isActive ? 'active' : 'closed',
      endDate: market.endDate ?? null,
      isActive: market.isActive,
      volume24h: market.volume24h != null ? String(market.volume24h) : null,
      liquidity: market.liquidity != null ? String(market.liquidity) : null,
      updatedAt: new Date(),
    };

    await db.insert(markets).values(row).onConflictDoUpdate({
      target: markets.id,
      set: {
        title: row.title,
        status: row.status ?? 'active',
        isActive: row.isActive ?? true,
        volume24h: row.volume24h ?? null,
        liquidity: row.liquidity ?? null,
        updatedAt: new Date(),
      },
    });

    return id;
  }

  async upsertBatch(marketList: NormalizedMarket[]): Promise<void> {
    for (const market of marketList) {
      await this.upsert(market);
    }
  }
}
