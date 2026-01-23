import { EventEmitter } from 'events';
import type { Position, OrderRequest } from '../clients/shared/interfaces.js';
import { logger, type Logger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import { riskLimitUtilization } from '../utils/metrics.js';

/**
 * Position limit configuration
 */
export interface PositionLimitsConfig {
  /**
   * Maximum position size per market in USD
   */
  maxPositionSizeUsd: number;
  /**
   * Maximum total exposure across all positions in USD
   */
  maxTotalExposureUsd: number;
  /**
   * Maximum number of open positions per market
   */
  maxPositionsPerMarket?: number;
  /**
   * Maximum number of total open positions
   */
  maxTotalPositions?: number;
}

/**
 * Position limit check result
 */
export interface PositionLimitCheckResult {
  /**
   * Whether the order is allowed
   */
  allowed: boolean;
  /**
   * Reason if not allowed
   */
  reason?: string;
  /**
   * Current utilization percentage
   */
  utilization?: number;
}

/**
 * Position Limits Manager
 * Enforces position size limits and total exposure limits
 */
export class PositionLimitsManager extends EventEmitter {
  private log: Logger;
  private config: PositionLimitsConfig;
  private positions: Map<string, Position> = new Map(); // marketId:outcomeId -> Position
  private marketPositions: Map<string, Position[]> = new Map(); // marketId -> Position[]

  constructor(config?: Partial<PositionLimitsConfig>) {
    super();
    this.log = logger('PositionLimitsManager');
    const riskConfig = getConfig().risk;
    
    this.config = {
      maxPositionSizeUsd: config?.maxPositionSizeUsd ?? riskConfig.maxPositionSizeUsd,
      maxTotalExposureUsd: config?.maxTotalExposureUsd ?? riskConfig.maxTotalExposureUsd,
      ...(config?.maxPositionsPerMarket !== undefined && { maxPositionsPerMarket: config.maxPositionsPerMarket }),
      ...(config?.maxTotalPositions !== undefined && { maxTotalPositions: config.maxTotalPositions }),
    };

    this.log.info('Position limits manager initialized', { ...this.config });
  }

  /**
   * Update position (called when position changes)
   */
  updatePosition(position: Position): void {
    const key = this.getPositionKey(position.marketId, position.outcomeId);

    if (position.size === 0 || !position.isOpen) {
      // Position closed or zero size
      this.positions.delete(key);
      this.updateMarketPositions(position.marketId);
    } else {
      this.positions.set(key, position);
      this.updateMarketPositions(position.marketId);
    }

    this.updateMetrics();
  }

  /**
   * Remove position
   */
  removePosition(marketId: string, outcomeId: string): void {
    const key = this.getPositionKey(marketId, outcomeId);
    this.positions.delete(key);
    this.updateMarketPositions(marketId);
    this.updateMetrics();
  }

  /**
   * Check if an order would violate position limits
   */
  checkOrder(order: OrderRequest): PositionLimitCheckResult {
    // Check per-market position size limit
    const marketCheck = this.checkMarketPositionLimit(order);
    if (!marketCheck.allowed) {
      return marketCheck;
    }

    // Check total exposure limit
    const exposureCheck = this.checkTotalExposureLimit(order);
    if (!exposureCheck.allowed) {
      return exposureCheck;
    }

    // Check max positions per market
    const positionsPerMarketCheck = this.checkPositionsPerMarketLimit(order);
    if (!positionsPerMarketCheck.allowed) {
      return positionsPerMarketCheck;
    }

    // Check max total positions
    const totalPositionsCheck = this.checkTotalPositionsLimit();
    if (!totalPositionsCheck.allowed) {
      return totalPositionsCheck;
    }

    return { allowed: true };
  }

  /**
   * Check per-market position size limit
   * Note: order.size is in SHARES, but limits are in USD
   * We must convert shares to USD value using the order price
   */
  private checkMarketPositionLimit(order: OrderRequest): PositionLimitCheckResult {
    const key = this.getPositionKey(order.marketId, order.outcomeId);
    const existingPosition = this.positions.get(key);

    // Get order price for USD conversion (shares * price = USD value)
    const orderPrice = Number(order.price) || 0.5; // Default to 0.5 if no price

    let currentSizeUsd = 0;
    if (existingPosition) {
      // Existing position size is stored as USD value
      currentSizeUsd = Math.abs(Number(existingPosition.size));
    }

    // Convert order size from shares to USD
    const orderSizeUsd = Number(order.size) * orderPrice;

    // Calculate new position size in USD
    let newSizeUsd = currentSizeUsd;
    if (order.side === 'buy') {
      newSizeUsd += orderSizeUsd;
    } else {
      newSizeUsd = Math.max(0, newSizeUsd - orderSizeUsd);
    }

    if (newSizeUsd > this.config.maxPositionSizeUsd) {
      const utilization = (newSizeUsd / this.config.maxPositionSizeUsd) * 100;
      this.log.warn('Market position limit exceeded', {
        marketId: order.marketId,
        outcomeId: order.outcomeId,
        currentSizeUsd,
        orderSizeShares: order.size,
        orderSizeUsd,
        orderPrice,
        newSizeUsd,
        limit: this.config.maxPositionSizeUsd,
        utilization,
      });

      return {
        allowed: false,
        reason: `Position size would exceed limit: $${newSizeUsd.toFixed(2)} > $${this.config.maxPositionSizeUsd}`,
        utilization,
      };
    }

    const utilization = (newSizeUsd / this.config.maxPositionSizeUsd) * 100;
    return { allowed: true, utilization };
  }

  /**
   * Check total exposure limit
   * Note: order.size is in SHARES, but limits are in USD
   */
  private checkTotalExposureLimit(order: OrderRequest): PositionLimitCheckResult {
    const currentExposure = this.getTotalExposure();

    // Get order price for USD conversion
    const orderPrice = Number(order.price) || 0.5;
    const orderSizeUsd = Number(order.size) * orderPrice;

    // Calculate new exposure in USD
    // For buy orders, exposure increases; for sell orders, it may decrease
    let newExposure = currentExposure;
    if (order.side === 'buy') {
      newExposure += orderSizeUsd;
    } else {
      // For sell orders, check if we have existing position
      const key = this.getPositionKey(order.marketId, order.outcomeId);
      const existingPosition = this.positions.get(key);
      if (existingPosition && Number(existingPosition.size) > 0) {
        // Reducing position, exposure decreases
        newExposure = Math.max(0, newExposure - Math.min(orderSizeUsd, Number(existingPosition.size)));
      } else {
        // Opening short position, exposure increases
        newExposure += orderSizeUsd;
      }
    }

    if (newExposure > this.config.maxTotalExposureUsd) {
      const utilization = (newExposure / this.config.maxTotalExposureUsd) * 100;
      this.log.warn('Total exposure limit exceeded', {
        currentExposure,
        orderSizeShares: order.size,
        orderSizeUsd,
        orderPrice,
        newExposure,
        limit: this.config.maxTotalExposureUsd,
        utilization,
      });

      return {
        allowed: false,
        reason: `Total exposure would exceed limit: $${newExposure.toFixed(2)} > $${this.config.maxTotalExposureUsd}`,
        utilization,
      };
    }

    const utilization = (newExposure / this.config.maxTotalExposureUsd) * 100;
    return { allowed: true, utilization };
  }

  /**
   * Check max positions per market limit
   */
  private checkPositionsPerMarketLimit(order: OrderRequest): PositionLimitCheckResult {
    if (!this.config.maxPositionsPerMarket) {
      return { allowed: true };
    }

    const marketPositions = this.marketPositions.get(order.marketId) || [];
    const key = this.getPositionKey(order.marketId, order.outcomeId);
    const hasExistingPosition = this.positions.has(key);

    // If we already have a position in this outcome, count doesn't change
    if (hasExistingPosition) {
      return { allowed: true };
    }

    // Check if adding this position would exceed limit
    if (marketPositions.length >= this.config.maxPositionsPerMarket) {
      return {
        allowed: false,
        reason: `Max positions per market exceeded: ${marketPositions.length} >= ${this.config.maxPositionsPerMarket}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check max total positions limit
   */
  private checkTotalPositionsLimit(): PositionLimitCheckResult {
    if (!this.config.maxTotalPositions) {
      return { allowed: true };
    }

    const totalPositions = this.positions.size;
    if (totalPositions >= this.config.maxTotalPositions) {
      return {
        allowed: false,
        reason: `Max total positions exceeded: ${totalPositions} >= ${this.config.maxTotalPositions}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get current position for a market/outcome
   */
  getPosition(marketId: string, outcomeId: string): Position | undefined {
    const key = this.getPositionKey(marketId, outcomeId);
    return this.positions.get(key);
  }

  /**
   * Get all positions for a market
   */
  getMarketPositions(marketId: string): Position[] {
    return this.marketPositions.get(marketId) || [];
  }

  /**
   * Get all positions
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get total exposure across all positions
   */
  getTotalExposure(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      if (position.isOpen) {
        total += Math.abs(Number(position.size));
      }
    }
    return total;
  }

  /**
   * Get position size for a market/outcome
   */
  getPositionSize(marketId: string, outcomeId: string): number {
    const position = this.getPosition(marketId, outcomeId);
    if (!position || !position.isOpen) {
      return 0;
    }
    return Math.abs(Number(position.size));
  }

  /**
   * Get position limit utilization for a market
   */
  getMarketUtilization(marketId: string, outcomeId: string): number {
    const size = this.getPositionSize(marketId, outcomeId);
    return (size / this.config.maxPositionSizeUsd) * 100;
  }

  /**
   * Get total exposure utilization
   */
  getTotalExposureUtilization(): number {
    const exposure = this.getTotalExposure();
    return (exposure / this.config.maxTotalExposureUsd) * 100;
  }

  /**
   * Get position key
   */
  private getPositionKey(marketId: string, outcomeId: string): string {
    return `${marketId}:${outcomeId}`;
  }

  /**
   * Update market positions map
   */
  private updateMarketPositions(marketId: string): void {
    const positions: Position[] = [];
    for (const position of this.positions.values()) {
      if (position.marketId === marketId && position.isOpen) {
        positions.push(position);
      }
    }
    this.marketPositions.set(marketId, positions);
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    const utilization = this.getTotalExposureUtilization();
    riskLimitUtilization.labels('total_exposure').set(utilization);

    // Update per-market utilization
    for (const position of this.positions.values()) {
      if (position.isOpen) {
        const marketUtilization = this.getMarketUtilization(position.marketId, position.outcomeId);
        const marketLabel = `market_${position.marketId}`;
        riskLimitUtilization.labels(marketLabel).set(marketUtilization);
      }
    }
  }

  /**
   * Reset all positions (for testing)
   */
  reset(): void {
    this.positions.clear();
    this.marketPositions.clear();
    this.updateMetrics();
    this.log.info('Position limits manager reset');
  }

  /**
   * Get current state
   */
  getState(): {
    totalPositions: number;
    totalExposure: number;
    maxPositionSizeUsd: number;
    maxTotalExposureUsd: number;
    utilization: number;
  } {
    return {
      totalPositions: this.positions.size,
      totalExposure: this.getTotalExposure(),
      maxPositionSizeUsd: this.config.maxPositionSizeUsd,
      maxTotalExposureUsd: this.config.maxTotalExposureUsd,
      utilization: this.getTotalExposureUtilization(),
    };
  }
}
