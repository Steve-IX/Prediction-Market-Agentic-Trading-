import { EventEmitter } from 'events';
import type { ArbitrageOpportunity, ArbitrageLeg, ArbitrageType } from './ArbitrageDetector.js';
import type { OrderManager } from '../../services/orderManager/index.js';
import type { NormalizedOrder, OrderRequest } from '../../clients/shared/interfaces.js';
import { logger, type Logger } from '../../utils/logger.js';
import { arbitrageExecutions, arbitrageProfit, orderLatency } from '../../utils/metrics.js';
import { ORDER_TYPES, ORDER_SIDES, ORDER_STATUSES, type Platform } from '../../config/constants.js';

/**
 * Execution result for a single leg
 */
export interface LegExecutionResult {
  leg: ArbitrageLeg;
  order: NormalizedOrder | null;
  success: boolean;
  error?: string;
  latencyMs: number;
}

/**
 * Overall execution result
 */
export interface ExecutionResult {
  opportunity: ArbitrageOpportunity;
  legs: LegExecutionResult[];
  success: boolean;
  partialFill: boolean;
  profit: number;
  totalCost: number;
  executionTimeMs: number;
  unwindRequired: boolean;
  unwindResult?: ExecutionResult;
}

/**
 * Execution options
 */
export interface ExecutionOptions {
  timeoutMs?: number;
  maxSlippageBps?: number;
  useGtc?: boolean; // Use GTC instead of FOK for testing
}

/**
 * Arbitrage Executor
 * Executes arbitrage opportunities with parallel execution and risk management
 */
export class ArbitrageExecutor extends EventEmitter {
  private log: Logger;
  private orderManager: OrderManager;
  private defaultTimeoutMs: number;
  private isExecuting: boolean;
  private executionHistory: ExecutionResult[];
  private maxHistorySize: number;

  constructor(orderManager: OrderManager) {
    super();
    this.log = logger('ArbitrageExecutor');
    this.orderManager = orderManager;

    this.defaultTimeoutMs = 5000; // 5 second timeout per leg
    // Max slippage is half the minimum arbitrage spread
    this.isExecuting = false;
    this.executionHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Execute an arbitrage opportunity
   */
  async execute(
    opportunity: ArbitrageOpportunity,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    this.log.info('Executing arbitrage', {
      id: opportunity.id,
      type: opportunity.type,
      legs: opportunity.legs.length,
      expectedProfit: opportunity.maxProfit,
    });

    // Prevent concurrent executions
    if (this.isExecuting) {
      const result: ExecutionResult = {
        opportunity,
        legs: [],
        success: false,
        partialFill: false,
        profit: 0,
        totalCost: 0,
        executionTimeMs: Date.now() - startTime,
        unwindRequired: false,
      };
      this.log.warn('Execution rejected - already executing');
      return result;
    }

    this.isExecuting = true;

    try {
      // Execute all legs in parallel
      const legResults = await this.executeLegsParallel(opportunity.legs, timeoutMs, options);

      // Analyze results
      const successfulLegs = legResults.filter((r) => r.success);
      const failedLegs = legResults.filter((r) => !r.success);
      const allSuccess = failedLegs.length === 0;
      const partialFill = successfulLegs.length > 0 && failedLegs.length > 0;

      // Calculate costs and profit
      let totalCost = 0;
      for (const result of successfulLegs) {
        if (result.order) {
          totalCost += result.order.filledSize * result.order.avgFillPrice;
        }
      }

      // Estimate profit (actual profit depends on market outcome)
      const estimatedProfit = allSuccess ? opportunity.netSpread * opportunity.maxSize : 0;

      const result: ExecutionResult = {
        opportunity,
        legs: legResults,
        success: allSuccess,
        partialFill,
        profit: estimatedProfit,
        totalCost,
        executionTimeMs: Date.now() - startTime,
        unwindRequired: partialFill,
      };

      // Handle partial fills - unwind to avoid directional exposure
      if (partialFill) {
        this.log.warn('Partial fill detected - initiating unwind', {
          successful: successfulLegs.length,
          failed: failedLegs.length,
        });

        result.unwindResult = await this.unwindPartialFill(successfulLegs);
      }

      // Record metrics
      const status = allSuccess ? 'success' : partialFill ? 'partial' : 'failed';
      arbitrageExecutions.labels(opportunity.type, status).inc();

      if (allSuccess) {
        arbitrageProfit.observe(estimatedProfit);
      }

      // Store in history
      this.addToHistory(result);

      // Emit events
      this.emit('execution', result);
      if (!allSuccess) {
        this.emit('executionFailed', result);
      }

      this.log.info('Arbitrage execution complete', {
        id: opportunity.id,
        success: allSuccess,
        partialFill,
        profit: estimatedProfit,
        executionTimeMs: result.executionTimeMs,
      });

      return result;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Execute all legs in parallel
   */
  private async executeLegsParallel(
    legs: ArbitrageLeg[],
    timeoutMs: number,
    options?: ExecutionOptions
  ): Promise<LegExecutionResult[]> {
    const promises = legs.map((leg) => this.executeLeg(leg, timeoutMs, options));
    return Promise.all(promises);
  }

  /**
   * Execute a single leg with timeout
   */
  private async executeLeg(
    leg: ArbitrageLeg,
    timeoutMs: number,
    options?: ExecutionOptions
  ): Promise<LegExecutionResult> {
    const startTime = Date.now();

    const orderRequest: OrderRequest = {
      platform: leg.platform as Platform,
      marketId: leg.marketId,
      outcomeId: leg.outcomeId,
      side: leg.side === 'BUY' ? ORDER_SIDES.BUY : ORDER_SIDES.SELL,
      price: leg.price,
      size: leg.size,
      type: options?.useGtc ? ORDER_TYPES.GTC : ORDER_TYPES.FOK, // FOK for atomic execution
    };

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), timeoutMs);
      });

      // Race between order execution and timeout
      const order = await Promise.race([
        this.orderManager.placeOrder(orderRequest),
        timeoutPromise,
      ]);

      const latencyMs = Date.now() - startTime;
      orderLatency.labels(leg.platform).observe(latencyMs);

      // Check if order was filled (for FOK orders)
      const isFilled =
        order.status === ORDER_STATUSES.FILLED ||
        (order.status === ORDER_STATUSES.PARTIAL && order.filledSize > 0);

      if (!isFilled && orderRequest.type === ORDER_TYPES.FOK) {
        // FOK order that didn't fill
        return {
          leg,
          order,
          success: false,
          error: 'Order not filled (FOK)',
          latencyMs,
        };
      }

      this.log.debug('Leg executed', {
        platform: leg.platform,
        outcomeId: leg.outcomeId,
        orderId: order.id,
        status: order.status,
        latencyMs,
      });

      return {
        leg,
        order,
        success: true,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      this.log.error('Leg execution failed', {
        platform: leg.platform,
        outcomeId: leg.outcomeId,
        error: error instanceof Error ? error.message : String(error),
        latencyMs,
      });

      return {
        leg,
        order: null,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs,
      };
    }
  }

  /**
   * Unwind a partial fill to avoid directional exposure
   */
  private async unwindPartialFill(successfulLegs: LegExecutionResult[]): Promise<ExecutionResult> {
    this.log.info('Unwinding partial fill', { legs: successfulLegs.length });

    const unwindLegs: ArbitrageLeg[] = [];

    for (const legResult of successfulLegs) {
      if (!legResult.order) continue;

      // Create opposite leg
      const unwindLeg: ArbitrageLeg = {
        ...legResult.leg,
        side: legResult.leg.side === 'BUY' ? 'SELL' : 'BUY',
        size: legResult.order.filledSize,
        // Use market price (0.01 for sell, 0.99 for buy to ensure fill)
        price: legResult.leg.side === 'BUY' ? 0.01 : 0.99,
      };

      unwindLegs.push(unwindLeg);
    }

    // Create dummy opportunity for unwind
    const unwindOpportunity: ArbitrageOpportunity = {
      id: `unwind:${Date.now()}`,
      type: 'single_platform' as ArbitrageType,
      legs: unwindLegs,
      grossSpread: 0,
      netSpread: 0,
      spreadBps: 0,
      maxProfit: 0,
      maxSize: 0,
      confidence: 1,
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 30000),
      isValid: true,
    };

    // Execute unwind legs
    const legResults = await this.executeLegsParallel(unwindLegs, 10000, { useGtc: true });

    // Calculate loss from unwind
    let unwindLoss = 0;
    for (const result of legResults) {
      if (result.order && result.success) {
        const originalLeg = successfulLegs.find((l) => l.leg.outcomeId === result.leg.outcomeId);
        if (originalLeg?.order) {
          // Loss = buy price - sell price (if we bought) or sell price - buy price (if we sold)
          if (originalLeg.leg.side === 'BUY') {
            unwindLoss += originalLeg.order.avgFillPrice - result.order.avgFillPrice;
          } else {
            unwindLoss += result.order.avgFillPrice - originalLeg.order.avgFillPrice;
          }
        }
      }
    }

    const unwindResult: ExecutionResult = {
      opportunity: unwindOpportunity,
      legs: legResults,
      success: legResults.every((r) => r.success),
      partialFill: false,
      profit: -unwindLoss,
      totalCost: 0,
      executionTimeMs: legResults.reduce((sum, r) => sum + r.latencyMs, 0),
      unwindRequired: false,
    };

    this.log.info('Unwind complete', {
      success: unwindResult.success,
      loss: unwindLoss,
    });

    return unwindResult;
  }

  /**
   * Add result to history
   */
  private addToHistory(result: ExecutionResult): void {
    this.executionHistory.unshift(result);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.pop();
    }
  }

  /**
   * Get execution history
   */
  getHistory(): ExecutionResult[] {
    return [...this.executionHistory];
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    partialFills: number;
    totalProfit: number;
    averageExecutionTimeMs: number;
  } {
    const stats = {
      totalExecutions: this.executionHistory.length,
      successfulExecutions: 0,
      failedExecutions: 0,
      partialFills: 0,
      totalProfit: 0,
      averageExecutionTimeMs: 0,
    };

    let totalTime = 0;

    for (const result of this.executionHistory) {
      if (result.success) {
        stats.successfulExecutions++;
        stats.totalProfit += result.profit;
      } else if (result.partialFill) {
        stats.partialFills++;
        if (result.unwindResult) {
          stats.totalProfit += result.unwindResult.profit;
        }
      } else {
        stats.failedExecutions++;
      }

      totalTime += result.executionTimeMs;
    }

    stats.averageExecutionTimeMs =
      stats.totalExecutions > 0 ? totalTime / stats.totalExecutions : 0;

    return stats;
  }

  /**
   * Check if currently executing
   */
  isBusy(): boolean {
    return this.isExecuting;
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }
}
