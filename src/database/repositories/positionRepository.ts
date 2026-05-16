import { eq } from 'drizzle-orm';
import type { Position } from '../../clients/shared/interfaces.js';
import { getDb } from '../index.js';
import { positions, type NewPosition } from '../schema/positions.js';
import { MarketRepository } from './marketRepository.js';

export class PositionRepository {
  private marketRepo = new MarketRepository();

  async upsert(position: Position): Promise<void> {
    const db = getDb();
    const marketDbId = this.marketRepo.marketDbId(position.platform, position.marketId);
    const id = `${position.platform}:${position.marketId}:${position.outcomeId}`;

    const row: NewPosition = {
      id,
      platform: position.platform,
      marketId: marketDbId,
      outcomeId: position.outcomeId,
      outcomeName: position.outcomeName,
      side: position.side,
      size: String(Math.abs(position.size)),
      avgEntryPrice: String(position.avgEntryPrice),
      currentPrice: String(position.currentPrice ?? position.avgEntryPrice),
      unrealizedPnl: String(position.unrealizedPnl ?? 0),
      realizedPnl: String(position.realizedPnl ?? 0),
      isOpen: Math.abs(position.size) > 0 ? 1 : 0,
      openedAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(positions).values(row).onConflictDoUpdate({
      target: positions.id,
      set: {
        size: row.size,
        avgEntryPrice: row.avgEntryPrice,
        currentPrice: row.currentPrice ?? row.avgEntryPrice,
        unrealizedPnl: row.unrealizedPnl ?? '0',
        realizedPnl: row.realizedPnl ?? '0',
        updatedAt: new Date(),
      },
    });
  }

  async findByPlatform(platform: string): Promise<Position[]> {
    const db = getDb();
    const rows = await db.select().from(positions).where(eq(positions.platform, platform));

    return rows.map((row) => ({
      id: row.id,
      platform: row.platform as Position['platform'],
      marketId: row.marketId,
      outcomeId: row.outcomeId,
      outcomeName: row.outcomeName,
      side: row.side as Position['side'],
      size: Number(row.size),
      avgEntryPrice: Number(row.avgEntryPrice),
      currentPrice: Number(row.currentPrice ?? row.avgEntryPrice),
      unrealizedPnl: Number(row.unrealizedPnl ?? 0),
      realizedPnl: Number(row.realizedPnl ?? 0),
      isOpen: row.isOpen === 1,
    }));
  }

  async remove(platform: string, marketId: string, outcomeId: string): Promise<void> {
    const db = getDb();
    const id = `${platform}:${marketId}:${outcomeId}`;
    await db.delete(positions).where(eq(positions.id, id));
  }
}
