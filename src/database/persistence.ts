import { logger } from '../utils/logger.js';
import { getRepositories } from './repositories/index.js';
import type { NormalizedOrder, Position, Trade } from '../clients/shared/interfaces.js';
import type { ArbitrageOpportunity } from '../strategies/arbitrage/ArbitrageDetector.js';

const log = logger('Persistence');

let persistenceEnabled = false;

export function setPersistenceEnabled(enabled: boolean): void {
  persistenceEnabled = enabled;
}

export function isPersistenceEnabled(): boolean {
  return persistenceEnabled;
}

export async function persistOrder(order: NormalizedOrder, strategyId?: string): Promise<void> {
  if (!persistenceEnabled) return;
  try {
    await getRepositories().orders.save(order, strategyId);
  } catch (error) {
    log.warn('Failed to persist order', {
      orderId: order.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function persistTrade(trade: Trade, orderId: string, strategyId?: string): Promise<void> {
  if (!persistenceEnabled) return;
  try {
    await getRepositories().trades.save(trade, orderId, strategyId);
  } catch (error) {
    log.warn('Failed to persist trade', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function persistPosition(position: Position): Promise<void> {
  if (!persistenceEnabled) return;
  try {
    await getRepositories().positions.upsert(position);
  } catch (error) {
    log.warn('Failed to persist position', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function persistArbitrageOpportunity(
  opportunity: ArbitrageOpportunity,
  wasExecuted = false
): Promise<void> {
  if (!persistenceEnabled) return;
  try {
    await getRepositories().arbitrage.save(opportunity, wasExecuted);
  } catch (error) {
    log.warn('Failed to persist arbitrage opportunity', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
