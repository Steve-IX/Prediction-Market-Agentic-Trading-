import type { Position } from '../../clients/shared/interfaces.js';

/**
 * Inventory state for a market
 */
export interface InventoryState {
  /**
   * Market ID
   */
  marketId: string;
  /**
   * Outcome ID
   */
  outcomeId: string;
  /**
   * Current inventory size (positive = long, negative = short)
   */
  size: number;
  /**
   * Average entry price
   */
  avgEntryPrice: number;
  /**
   * Target inventory size
   */
  targetSize: number;
  /**
   * Maximum inventory size
   */
  maxSize: number;
}

/**
 * Inventory manager
 */
export class InventoryManager {
  private inventories: Map<string, InventoryState> = new Map();

  /**
   * Get inventory key
   */
  private getKey(marketId: string, outcomeId: string): string {
    return `${marketId}:${outcomeId}`;
  }

  /**
   * Update inventory from position
   */
  updateFromPosition(position: Position): void {
    const key = this.getKey(position.marketId, position.outcomeId);
    const existing = this.inventories.get(key);

    if (position.size === 0 || !position.isOpen) {
      // Position closed
      this.inventories.delete(key);
      return;
    }

    const size = position.side === 'long' ? Number(position.size) : -Number(position.size);
    const avgEntryPrice = Number(position.avgEntryPrice);

    if (existing) {
      existing.size = size;
      existing.avgEntryPrice = avgEntryPrice;
    } else {
      this.inventories.set(key, {
        marketId: position.marketId,
        outcomeId: position.outcomeId,
        size,
        avgEntryPrice,
        targetSize: 0,
        maxSize: 1000, // Default max size
      });
    }
  }

  /**
   * Get inventory for a market/outcome
   */
  getInventory(marketId: string, outcomeId: string): InventoryState | null {
    const key = this.getKey(marketId, outcomeId);
    return this.inventories.get(key) || null;
  }

  /**
   * Set target inventory
   */
  setTarget(marketId: string, outcomeId: string, targetSize: number, maxSize: number): void {
    const key = this.getKey(marketId, outcomeId);
    const existing = this.inventories.get(key);

    if (existing) {
      existing.targetSize = targetSize;
      existing.maxSize = maxSize;
    } else {
      this.inventories.set(key, {
        marketId,
        outcomeId,
        size: 0,
        avgEntryPrice: 0,
        targetSize,
        maxSize,
      });
    }
  }

  /**
   * Calculate inventory skew (how far from target)
   */
  getInventorySkew(marketId: string, outcomeId: string): number {
    const inventory = this.getInventory(marketId, outcomeId);
    if (!inventory) {
      return 0;
    }

    const deviation = inventory.size - inventory.targetSize;
    return deviation / inventory.maxSize; // Normalize to -1 to 1
  }

  /**
   * Check if inventory rebalancing is needed
   */
  needsRebalancing(marketId: string, outcomeId: string, threshold: number = 0.2): boolean {
    const skew = Math.abs(this.getInventorySkew(marketId, outcomeId));
    return skew > threshold;
  }

  /**
   * Get all inventories
   */
  getAllInventories(): InventoryState[] {
    return Array.from(this.inventories.values());
  }

  /**
   * Reset inventory (for testing)
   */
  reset(): void {
    this.inventories.clear();
  }
}
