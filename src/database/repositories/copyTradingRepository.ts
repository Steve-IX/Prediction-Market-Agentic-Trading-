import { desc, eq } from 'drizzle-orm';
import { getDb } from '../index.js';
import { copiedTrades, type NewCopiedTrade } from '../schema/copyTrading.js';

export interface CopiedTradeRecord {
  id: string;
  traderId: string;
  originalMarketId: string;
  originalOutcomeId: string;
  originalSide: string;
  originalPrice: number;
  originalSize: number;
  originalUsdcSize: number;
  originalTimestamp: Date;
  status: string;
  copiedOrderId?: string;
}

export class CopyTradingRepository {
  async save(record: CopiedTradeRecord): Promise<void> {
    const db = getDb();

    const row: NewCopiedTrade = {
      id: record.id,
      traderId: record.traderId,
      originalMarketId: record.originalMarketId,
      originalOutcomeId: record.originalOutcomeId,
      originalSide: record.originalSide,
      originalPrice: String(record.originalPrice),
      originalSize: String(record.originalSize),
      originalUsdcSize: String(record.originalUsdcSize),
      originalTimestamp: record.originalTimestamp,
      status: record.status,
      copiedOrderId: record.copiedOrderId ?? null,
    };

    await db.insert(copiedTrades).values(row).onConflictDoUpdate({
      target: copiedTrades.id,
      set: {
        status: row.status ?? 'pending',
        copiedOrderId: row.copiedOrderId ?? null,
        copiedTimestamp: new Date(),
      },
    });
  }

  async listByTrader(traderId: string, limit = 100): Promise<typeof copiedTrades.$inferSelect[]> {
    const db = getDb();
    return db
      .select()
      .from(copiedTrades)
      .where(eq(copiedTrades.traderId, traderId))
      .orderBy(desc(copiedTrades.originalTimestamp))
      .limit(limit);
  }
}
