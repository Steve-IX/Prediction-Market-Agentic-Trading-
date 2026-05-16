import { eq } from 'drizzle-orm';
import type { NormalizedOrder } from '../../clients/shared/interfaces.js';
import { getDb } from '../index.js';
import { orders, type NewOrder } from '../schema/orders.js';
import { MarketRepository } from './marketRepository.js';

export class OrderRepository {
  private marketRepo = new MarketRepository();

  async save(order: NormalizedOrder, strategyId?: string): Promise<void> {
    const db = getDb();
    const price = Number(order.price);
    const sizeUsd = Number(order.size) * price;
    const marketDbId = order.marketId.includes(':')
      ? order.marketId
      : this.marketRepo.marketDbId(order.platform, order.marketId);

    const row: NewOrder = {
      id: order.id,
      platform: order.platform,
      externalOrderId: order.externalOrderId ?? null,
      marketId: marketDbId,
      outcomeId: order.outcomeId,
      side: order.side,
      type: order.type,
      price: String(price),
      size: String(sizeUsd),
      filledSize: String(Number(order.filledSize) * price),
      avgFillPrice: order.avgFillPrice != null ? String(order.avgFillPrice) : null,
      status: order.status,
      strategyId: strategyId ?? null,
      metadata: order.metadata ?? null,
      updatedAt: new Date(),
    };

    await db.insert(orders).values(row).onConflictDoUpdate({
      target: orders.id,
      set: {
        status: row.status ?? 'open',
        filledSize: row.filledSize ?? '0',
        avgFillPrice: row.avgFillPrice ?? null,
        updatedAt: new Date(),
      },
    });
  }

  async updateStatus(
    orderId: string,
    status: string,
    filledSize?: number,
    avgFillPrice?: number
  ): Promise<void> {
    const db = getDb();
    await db
      .update(orders)
      .set({
        status,
        ...(filledSize !== undefined ? { filledSize: String(filledSize) } : {}),
        ...(avgFillPrice !== undefined ? { avgFillPrice: String(avgFillPrice) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
  }
}
