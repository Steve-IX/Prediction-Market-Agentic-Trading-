import type { Trade } from '../../clients/shared/interfaces.js';
import { getDb } from '../index.js';
import { trades, type NewTrade } from '../schema/orders.js';
import { randomUUID } from 'crypto';

export class TradeRepository {
  async save(trade: Trade, orderId: string, strategyId?: string): Promise<string> {
    const db = getDb();
    const id = trade.id || randomUUID();
    const sizeUsd = Number(trade.size) * Number(trade.price);

    const row: NewTrade = {
      id,
      orderId,
      platform: trade.platform,
      externalTradeId: trade.id,
      marketId: trade.marketId,
      outcomeId: trade.outcomeId,
      side: trade.side,
      price: String(trade.price),
      size: String(sizeUsd),
      fee: trade.fee != null ? String(trade.fee) : '0',
      realizedPnl: trade.realizedPnl != null ? String(trade.realizedPnl) : null,
      strategyId: strategyId ?? null,
      executedAt: trade.executedAt ?? new Date(),
    };

    await db.insert(trades).values(row).onConflictDoNothing();
    return id;
  }
}
