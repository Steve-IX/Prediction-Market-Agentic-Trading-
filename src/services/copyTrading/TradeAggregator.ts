/**
 * Trade Aggregator
 *
 * Combines multiple small trades from the same trader into a single larger order.
 * This is useful when:
 * - A trader makes many small incremental purchases
 * - Individual trades fall below the $1 Polymarket minimum
 * - You want to reduce the number of transactions (and gas fees)
 *
 * How it works:
 * 1. Small trades (below minimum) are added to an aggregation buffer
 * 2. When the aggregation window expires OR enough trades accumulate:
 *    - If total >= minimum: Execute as a single order
 *    - If total < minimum: Mark trades as skipped
 */

import { EventEmitter } from 'events';
import type { DetectedTrade, AggregatedTrade } from './types.js';
import { createComponentLogger } from '../../utils/logger.js';
import * as metrics from '../../utils/metrics.js';

const log = createComponentLogger('TradeAggregator');

/**
 * Aggregation configuration
 */
export interface AggregationConfig {
  enabled: boolean;
  windowMs: number; // Time window to wait for more trades
  minTrades: number; // Minimum trades to aggregate before early execution
  minTotalUsd: number; // Minimum total USD to execute (Polymarket minimum)
}

const DEFAULT_CONFIG: AggregationConfig = {
  enabled: true,
  windowMs: 30000, // 30 seconds
  minTrades: 2,
  minTotalUsd: 1.0, // Polymarket minimum
};

/**
 * Trade Aggregator service
 */
export class TradeAggregator extends EventEmitter {
  // Map: aggregation key -> AggregatedTrade
  private buffer: Map<string, AggregatedTrade> = new Map();
  // Timers for expiration
  private expirationTimers: Map<string, NodeJS.Timeout> = new Map();
  // Configuration
  private config: AggregationConfig;

  constructor(config: Partial<AggregationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate aggregation key: unique per trader + market + outcome + side
   */
  private getAggregationKey(trade: DetectedTrade): string {
    return `${trade.traderAddress}:${trade.marketId}:${trade.outcomeId}:${trade.side}`;
  }

  /**
   * Generate unique group ID
   */
  private generateGroupId(): string {
    return `agg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add a trade to the aggregation buffer
   *
   * @param trade - The detected trade to aggregate
   * @returns The aggregation group (new or existing)
   */
  addTrade(trade: DetectedTrade): AggregatedTrade {
    if (!this.config.enabled) {
      throw new Error('Trade aggregation is disabled');
    }

    const key = this.getAggregationKey(trade);
    const now = new Date();
    const existing = this.buffer.get(key);

    if (existing) {
      // Add to existing aggregation
      existing.trades.push(trade);
      existing.totalSize += trade.size;
      existing.totalUsdcSize += trade.usdcSize;
      existing.lastTradeAt = now;

      // Recalculate weighted average price
      const totalValue = existing.trades.reduce((sum, t) => sum + t.usdcSize * t.price, 0);
      existing.avgPrice = totalValue / existing.totalUsdcSize;

      this.buffer.set(key, existing);

      log.debug('Trade added to aggregation', {
        groupId: existing.groupId,
        tradeCount: existing.trades.length,
        totalUsdcSize: existing.totalUsdcSize.toFixed(2),
        avgPrice: existing.avgPrice.toFixed(4),
      });

      this.emit('tradeAdded', trade, existing);

      // Check if ready for early execution
      if (this.isReadyForExecution(existing)) {
        this.executeAggregation(key, existing);
      }

      return existing;
    } else {
      // Create new aggregation
      const newGroup: AggregatedTrade = {
        groupId: this.generateGroupId(),
        traderAddress: trade.traderAddress,
        marketId: trade.marketId,
        outcomeId: trade.outcomeId,
        outcomeName: trade.outcomeName,
        side: trade.side,
        avgPrice: trade.price,
        totalSize: trade.size,
        totalUsdcSize: trade.usdcSize,
        trades: [trade],
        firstTradeAt: now,
        lastTradeAt: now,
        expiresAt: new Date(now.getTime() + this.config.windowMs),
      };

      this.buffer.set(key, newGroup);

      log.debug('New aggregation started', {
        groupId: newGroup.groupId,
        trader: trade.traderAddress.slice(0, 8),
        market: trade.marketTitle || trade.marketId,
        side: trade.side,
        expiresAt: newGroup.expiresAt.toISOString(),
      });

      // Set expiration timer
      this.setExpirationTimer(key, newGroup);

      this.emit('tradeAdded', trade, newGroup);

      // Update metrics
      metrics.copyTradingPendingAggregations.inc();

      return newGroup;
    }
  }

  /**
   * Check if aggregation is ready for early execution
   */
  private isReadyForExecution(group: AggregatedTrade): boolean {
    // Ready if we have enough trades AND enough total value
    return (
      group.trades.length >= this.config.minTrades &&
      group.totalUsdcSize >= this.config.minTotalUsd
    );
  }

  /**
   * Set expiration timer for an aggregation
   */
  private setExpirationTimer(key: string, _group: AggregatedTrade): void {
    // Clear any existing timer
    const existingTimer = this.expirationTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.handleExpiration(key);
    }, this.config.windowMs);

    this.expirationTimers.set(key, timer);
  }

  /**
   * Handle aggregation expiration
   */
  private handleExpiration(key: string): void {
    const group = this.buffer.get(key);
    if (!group) return;

    if (group.totalUsdcSize >= this.config.minTotalUsd) {
      // Execute the aggregation
      this.executeAggregation(key, group);
    } else {
      // Total too small - expire without execution
      log.info('Aggregation expired - below minimum', {
        groupId: group.groupId,
        totalUsdcSize: group.totalUsdcSize.toFixed(2),
        minRequired: this.config.minTotalUsd,
        tradeCount: group.trades.length,
      });

      // Update metrics
      metrics.copyTradingPendingAggregations.dec();
      metrics.copyTradingAggregationsExpired.labels(group.traderAddress).inc();

      this.emit('aggregationExpired', group);
      this.cleanup(key);
    }
  }

  /**
   * Execute an aggregation (emit ready event)
   */
  private executeAggregation(key: string, group: AggregatedTrade): void {
    // Clear the timer
    const timer = this.expirationTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.expirationTimers.delete(key);
    }

    log.info('Aggregation ready for execution', {
      groupId: group.groupId,
      trader: group.traderAddress.slice(0, 8),
      side: group.side,
      totalUsdcSize: group.totalUsdcSize.toFixed(2),
      avgPrice: group.avgPrice.toFixed(4),
      tradeCount: group.trades.length,
    });

    // Update metrics
    metrics.copyTradingPendingAggregations.dec();
    metrics.copyTradingAggregations.labels(group.traderAddress).inc();

    this.emit('aggregationReady', group);

    // Remove from buffer after emitting
    this.buffer.delete(key);
  }

  /**
   * Clean up an aggregation
   */
  private cleanup(key: string): void {
    this.buffer.delete(key);
    const timer = this.expirationTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.expirationTimers.delete(key);
    }
  }

  /**
   * Get all pending aggregations
   */
  getPendingAggregations(): AggregatedTrade[] {
    return Array.from(this.buffer.values());
  }

  /**
   * Get pending aggregations for a specific trader
   */
  getPendingForTrader(traderAddress: string): AggregatedTrade[] {
    return Array.from(this.buffer.values()).filter(
      (group) => group.traderAddress === traderAddress
    );
  }

  /**
   * Get a specific aggregation by key
   */
  getAggregation(traderAddress: string, marketId: string, outcomeId: string, side: string): AggregatedTrade | undefined {
    const key = `${traderAddress}:${marketId}:${outcomeId}:${side}`;
    return this.buffer.get(key);
  }

  /**
   * Force execute all pending aggregations (used during shutdown)
   */
  flushAll(): AggregatedTrade[] {
    const ready: AggregatedTrade[] = [];

    for (const [key, group] of this.buffer.entries()) {
      if (group.totalUsdcSize >= this.config.minTotalUsd) {
        ready.push(group);
        this.emit('aggregationReady', group);
      } else {
        this.emit('aggregationExpired', group);
      }
      this.cleanup(key);
    }

    metrics.copyTradingPendingAggregations.set(0);
    log.info('Flushed all aggregations', {
      executed: ready.length,
      expired: this.buffer.size - ready.length,
    });

    return ready;
  }

  /**
   * Cancel an aggregation
   */
  cancelAggregation(traderAddress: string, marketId: string, outcomeId: string, side: string): boolean {
    const key = `${traderAddress}:${marketId}:${outcomeId}:${side}`;
    const group = this.buffer.get(key);

    if (group) {
      log.info('Aggregation cancelled', {
        groupId: group.groupId,
        tradeCount: group.trades.length,
      });

      this.emit('aggregationExpired', group);
      this.cleanup(key);
      metrics.copyTradingPendingAggregations.dec();
      return true;
    }

    return false;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AggregationConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('Aggregation config updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): AggregationConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): {
    pendingGroups: number;
    totalPendingTrades: number;
    totalPendingValue: number;
    avgGroupSize: number;
  } {
    const groups = Array.from(this.buffer.values());
    const totalTrades = groups.reduce((sum, g) => sum + g.trades.length, 0);
    const totalValue = groups.reduce((sum, g) => sum + g.totalUsdcSize, 0);

    return {
      pendingGroups: groups.length,
      totalPendingTrades: totalTrades,
      totalPendingValue: totalValue,
      avgGroupSize: groups.length > 0 ? totalTrades / groups.length : 0,
    };
  }

  /**
   * Clear all pending aggregations (for testing)
   */
  clear(): void {
    for (const timer of this.expirationTimers.values()) {
      clearTimeout(timer);
    }
    this.buffer.clear();
    this.expirationTimers.clear();
    metrics.copyTradingPendingAggregations.set(0);
    log.info('Trade aggregator cleared');
  }

  /**
   * Check if aggregation is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable aggregation
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      // Flush when disabling
      this.flushAll();
    }
  }
}

// Export singleton instance
export const tradeAggregator = new TradeAggregator();
