/**
 * Position Tracker
 *
 * Tracks positions opened from copy trading for accurate sell calculations.
 * When a trader sells a portion of their position, we need to know how much
 * WE bought (not our current position size) to sell proportionally.
 *
 * This solves the problem where:
 * - Trader buys 100 shares at $0.50 ($50 invested)
 * - We copy with 10% = 10 shares at $0.50 ($5 invested)
 * - Trader sells 50% of position (50 shares)
 * - We should sell 50% of OUR position (5 shares), not 50% of trader's sell
 */

import { EventEmitter } from 'events';
import type { CopyPosition, DetectedTrade } from './types.js';
import { createComponentLogger } from '../../utils/logger.js';
import * as metrics from '../../utils/metrics.js';

const log = createComponentLogger('PositionTracker');

/**
 * Position update event data
 */
interface PositionUpdate {
  position: CopyPosition;
  previousSize: number;
  previousAvgPrice: number;
  trade: DetectedTrade;
}

/**
 * In-memory position tracker for copy trading
 * Can be extended to persist to database
 */
export class PositionTracker extends EventEmitter {
  // Map: traderId:marketId:outcomeId -> CopyPosition
  private positions: Map<string, CopyPosition> = new Map();

  constructor() {
    super();
  }

  /**
   * Generate a unique key for a position
   */
  private getPositionKey(traderId: string, marketId: string, outcomeId: string): string {
    return `${traderId}:${marketId}:${outcomeId}`;
  }

  /**
   * Get all open positions
   */
  getOpenPositions(): CopyPosition[] {
    return Array.from(this.positions.values()).filter((p) => p.isOpen);
  }

  /**
   * Get all positions for a specific trader
   */
  getPositionsForTrader(traderId: string): CopyPosition[] {
    return Array.from(this.positions.values()).filter((p) => p.traderId === traderId);
  }

  /**
   * Get open positions for a specific trader
   */
  getOpenPositionsForTrader(traderId: string): CopyPosition[] {
    return Array.from(this.positions.values()).filter(
      (p) => p.traderId === traderId && p.isOpen
    );
  }

  /**
   * Get position by market and outcome for a trader
   */
  getPosition(
    traderId: string,
    marketId: string,
    outcomeId: string
  ): CopyPosition | undefined {
    const key = this.getPositionKey(traderId, marketId, outcomeId);
    return this.positions.get(key);
  }

  /**
   * Get position by ID
   */
  getPositionById(positionId: string): CopyPosition | undefined {
    return Array.from(this.positions.values()).find((p) => p.id === positionId);
  }

  /**
   * Record a BUY trade - opens or adds to position
   *
   * @param traderId - Tracked trader ID
   * @param traderAddress - Tracked trader wallet address
   * @param trade - The original detected trade
   * @param copiedSize - Number of tokens we bought
   * @param copiedPrice - Price we paid
   * @param copiedUsdcSize - USD amount we spent
   */
  recordBuy(
    traderId: string,
    traderAddress: string,
    trade: DetectedTrade,
    copiedSize: number,
    copiedPrice: number,
    copiedUsdcSize: number
  ): CopyPosition {
    const key = this.getPositionKey(traderId, trade.marketId, trade.outcomeId);
    const existing = this.positions.get(key);

    if (existing && existing.isOpen) {
      // Update existing position - calculate new average entry price
      const previousSize = existing.size;
      const previousAvgPrice = existing.avgEntryPrice;
      const previousCost = existing.totalCost;

      const newSize = previousSize + copiedSize;
      const newCost = previousCost + copiedUsdcSize;
      const newAvgPrice = newCost / newSize;

      const updatedPosition: CopyPosition = {
        ...existing,
        size: newSize,
        avgEntryPrice: newAvgPrice,
        totalCost: newCost,
        totalBought: existing.totalBought + copiedSize,
        buyCount: existing.buyCount + 1,
        updatedAt: new Date(),
      };

      this.positions.set(key, updatedPosition);

      log.debug('Position updated (buy)', {
        positionId: updatedPosition.id,
        market: trade.marketTitle || trade.marketId,
        previousSize,
        newSize,
        previousAvgPrice: previousAvgPrice.toFixed(4),
        newAvgPrice: newAvgPrice.toFixed(4),
      });

      this.emit('positionUpdated', {
        position: updatedPosition,
        previousSize,
        previousAvgPrice,
        trade,
      } as PositionUpdate);

      return updatedPosition;
    } else {
      // Open new position
      const newPosition: CopyPosition = {
        id: `cp_${traderId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        traderId,
        traderAddress,
        marketId: trade.marketId,
        outcomeId: trade.outcomeId,
        outcomeName: trade.outcomeName,
        ...(trade.marketTitle && { marketTitle: trade.marketTitle }),
        side: 'long',
        size: copiedSize,
        avgEntryPrice: copiedPrice,
        totalCost: copiedUsdcSize,
        isOpen: true,
        realizedPnl: 0,
        buyCount: 1,
        sellCount: 0,
        totalBought: copiedSize,
        totalSold: 0,
        openedAt: new Date(),
        updatedAt: new Date(),
      };

      this.positions.set(key, newPosition);

      log.info('Position opened', {
        positionId: newPosition.id,
        market: trade.marketTitle || trade.marketId,
        outcome: trade.outcomeName,
        size: copiedSize.toFixed(4),
        price: copiedPrice.toFixed(4),
        cost: copiedUsdcSize.toFixed(2),
      });

      // Update metrics
      metrics.copyTradingOpenPositions.labels(traderAddress).inc();
      metrics.copyTradingPositionValue.labels(traderAddress).inc(copiedUsdcSize);

      this.emit('positionOpened', newPosition);

      return newPosition;
    }
  }

  /**
   * Record a SELL trade - reduces or closes position
   *
   * @param traderId - Tracked trader ID
   * @param trade - The original detected trade
   * @param soldSize - Number of tokens we sold
   * @param soldPrice - Price we sold at
   * @param soldUsdcSize - USD amount we received
   * @returns Updated position and realized P&L from this sale
   */
  recordSell(
    traderId: string,
    trade: DetectedTrade,
    soldSize: number,
    _soldPrice: number,
    soldUsdcSize: number
  ): { position: CopyPosition; realizedPnl: number } | null {
    const key = this.getPositionKey(traderId, trade.marketId, trade.outcomeId);
    const existing = this.positions.get(key);

    if (!existing || !existing.isOpen) {
      log.warn('Cannot record sell - no open position', {
        traderId,
        marketId: trade.marketId,
        outcomeId: trade.outcomeId,
      });
      return null;
    }

    const previousSize = existing.size;
    const previousAvgPrice = existing.avgEntryPrice;

    // Calculate realized P&L for this sale
    const costBasis = soldSize * existing.avgEntryPrice;
    const saleProceeds = soldUsdcSize;
    const realizedPnl = saleProceeds - costBasis;

    // Update position
    const newSize = Math.max(0, previousSize - soldSize);
    const positionClosed = newSize < 0.0001; // Consider closed if less than 0.01 cents worth

    const updatedPosition: CopyPosition = {
      ...existing,
      size: newSize,
      totalSold: existing.totalSold + soldSize,
      sellCount: existing.sellCount + 1,
      realizedPnl: existing.realizedPnl + realizedPnl,
      isOpen: !positionClosed,
      ...(positionClosed && { closedAt: new Date() }),
      updatedAt: new Date(),
    };

    // Update total cost proportionally if not fully closed
    if (!positionClosed) {
      updatedPosition.totalCost = newSize * existing.avgEntryPrice;
    }

    this.positions.set(key, updatedPosition);

    if (positionClosed) {
      log.info('Position closed', {
        positionId: updatedPosition.id,
        market: trade.marketTitle || trade.marketId,
        outcome: trade.outcomeName,
        totalRealizedPnl: updatedPosition.realizedPnl.toFixed(2),
        totalBought: existing.totalBought.toFixed(4),
        totalSold: updatedPosition.totalSold.toFixed(4),
      });

      // Update metrics
      metrics.copyTradingOpenPositions.labels(existing.traderAddress).dec();
      metrics.copyTradingRealizedPnl.labels(existing.traderAddress).inc(updatedPosition.realizedPnl);

      this.emit('positionClosed', updatedPosition, updatedPosition.realizedPnl);
    } else {
      log.debug('Position reduced (sell)', {
        positionId: updatedPosition.id,
        market: trade.marketTitle || trade.marketId,
        previousSize: previousSize.toFixed(4),
        newSize: newSize.toFixed(4),
        realizedPnl: realizedPnl.toFixed(2),
      });

      this.emit('positionUpdated', {
        position: updatedPosition,
        previousSize,
        previousAvgPrice,
        trade,
      } as PositionUpdate);
    }

    return { position: updatedPosition, realizedPnl };
  }

  /**
   * Calculate how much to sell when the trader sells a portion of their position
   *
   * @param traderId - Tracked trader ID
   * @param marketId - Market ID
   * @param outcomeId - Outcome ID
   * @param traderSellPercent - Percentage of position the trader is selling (0-1)
   * @returns Amount of tokens we should sell, or null if no position
   */
  calculateSellAmount(
    traderId: string,
    marketId: string,
    outcomeId: string,
    traderSellPercent: number
  ): number | null {
    const position = this.getPosition(traderId, marketId, outcomeId);

    if (!position || !position.isOpen) {
      return null;
    }

    // Sell the same percentage of OUR position
    const sellAmount = position.size * traderSellPercent;

    log.debug('Calculated sell amount', {
      positionId: position.id,
      currentSize: position.size.toFixed(4),
      traderSellPercent: (traderSellPercent * 100).toFixed(2) + '%',
      sellAmount: sellAmount.toFixed(4),
    });

    return sellAmount;
  }

  /**
   * Update current price and unrealized P&L for all positions
   *
   * @param prices - Map of marketId:outcomeId -> current price
   */
  updatePrices(prices: Map<string, number>): void {
    for (const [key, position] of this.positions.entries()) {
      if (!position.isOpen) continue;

      const priceKey = `${position.marketId}:${position.outcomeId}`;
      const currentPrice = prices.get(priceKey);

      if (currentPrice !== undefined) {
        const currentValue = position.size * currentPrice;
        const unrealizedPnl = currentValue - position.totalCost;
        const percentPnl = position.totalCost > 0 ? (unrealizedPnl / position.totalCost) * 100 : 0;

        position.currentPrice = currentPrice;
        position.currentValue = currentValue;
        position.unrealizedPnl = unrealizedPnl;
        position.percentPnl = percentPnl;
        position.updatedAt = new Date();

        this.positions.set(key, position);
      }
    }
  }

  /**
   * Get total exposure across all positions for a trader
   */
  getTotalExposure(traderId: string): number {
    return this.getOpenPositionsForTrader(traderId).reduce(
      (total, position) => total + (position.currentValue ?? position.totalCost),
      0
    );
  }

  /**
   * Get total unrealized P&L across all positions for a trader
   */
  getTotalUnrealizedPnl(traderId: string): number {
    return this.getOpenPositionsForTrader(traderId).reduce(
      (total, position) => total + (position.unrealizedPnl ?? 0),
      0
    );
  }

  /**
   * Get total realized P&L across all positions (open and closed) for a trader
   */
  getTotalRealizedPnl(traderId: string): number {
    return this.getPositionsForTrader(traderId).reduce(
      (total, position) => total + position.realizedPnl,
      0
    );
  }

  /**
   * Get overall statistics
   */
  getStats(): {
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalValue: number;
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
  } {
    const positions = Array.from(this.positions.values());
    const openPositions = positions.filter((p) => p.isOpen);
    const closedPositions = positions.filter((p) => !p.isOpen);

    return {
      totalPositions: positions.length,
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      totalValue: openPositions.reduce((sum, p) => sum + (p.currentValue ?? p.totalCost), 0),
      totalUnrealizedPnl: openPositions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0),
      totalRealizedPnl: positions.reduce((sum, p) => sum + p.realizedPnl, 0),
    };
  }

  /**
   * Clear all positions (for testing or reset)
   */
  clear(): void {
    this.positions.clear();
    log.info('Position tracker cleared');
  }

  /**
   * Load positions from database or external source
   */
  loadPositions(positions: CopyPosition[]): void {
    for (const position of positions) {
      const key = this.getPositionKey(position.traderId, position.marketId, position.outcomeId);
      this.positions.set(key, position);
    }
    log.info('Loaded positions', { count: positions.length });
  }

  /**
   * Export all positions (for persistence)
   */
  exportPositions(): CopyPosition[] {
    return Array.from(this.positions.values());
  }
}

// Export singleton instance
export const positionTracker = new PositionTracker();
