import { EventEmitter } from 'events';
import type { TradingSignal } from './momentum/MomentumStrategy.js';
import type { OrderManager } from '../services/orderManager/OrderManager.js';
import { ORDER_SIDES, ORDER_TYPES } from '../config/constants.js';
import { logger, type Logger } from '../utils/logger.js';

/**
 * Signal execution result
 */
export interface SignalExecutionResult {
  signal: TradingSignal;
  success: boolean;
  orderId?: string;
  filledSize: number;
  filledPrice: number;
  fee: number;
  profit: number;
  executionTimeMs: number;
  error?: string;
}

/**
 * Signal Executor Configuration
 */
export interface SignalExecutorConfig {
  maxSlippage: number; // Maximum slippage allowed (e.g., 0.02 = 2%)
  executionTimeoutMs: number;
  minConfidence: number; // Minimum confidence to execute
}

const DEFAULT_CONFIG: SignalExecutorConfig = {
  maxSlippage: 0.02,
  executionTimeoutMs: 5000,
  minConfidence: 0.5,
};

/**
 * Signal Executor
 * Executes trading signals by placing orders
 */
export class SignalExecutor extends EventEmitter {
  private log: Logger;
  private config: SignalExecutorConfig;
  private orderManager: OrderManager;
  private pendingExecutions: Set<string> = new Set();

  constructor(orderManager: OrderManager, config?: Partial<SignalExecutorConfig>) {
    super();
    this.log = logger('SignalExecutor');
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.orderManager = orderManager;
  }

  /**
   * Execute a trading signal
   */
  async execute(signal: TradingSignal): Promise<SignalExecutionResult> {
    const startTime = Date.now();

    // Check if already executing this signal
    if (this.pendingExecutions.has(signal.id)) {
      return this.createFailedResult(signal, 'Already executing', startTime);
    }

    // Check minimum confidence
    if (signal.confidence < this.config.minConfidence) {
      return this.createFailedResult(
        signal,
        `Confidence ${signal.confidence.toFixed(2)} below minimum ${this.config.minConfidence}`,
        startTime
      );
    }

    // Check if signal expired
    if (new Date() > signal.expiresAt) {
      return this.createFailedResult(signal, 'Signal expired', startTime);
    }

    this.pendingExecutions.add(signal.id);

    try {
      this.log.info('Executing signal', {
        id: signal.id,
        strategy: signal.strategy,
        market: signal.market.title,
        side: signal.side,
        price: signal.price,
        size: signal.size,
        confidence: signal.confidence.toFixed(2),
      });

      // Place the order
      const order = await this.orderManager.placeOrder({
        platform: signal.market.platform,
        marketId: signal.marketId,
        outcomeId: signal.outcomeId,
        side: signal.side === 'BUY' ? ORDER_SIDES.BUY : ORDER_SIDES.SELL,
        type: ORDER_TYPES.GTC, // Good-til-cancelled limit order
        price: this.calculateLimitPrice(signal),
        size: signal.size,
        strategyId: signal.strategy, // Pass strategy ID from signal
      });

      const executionTimeMs = Date.now() - startTime;

      // Calculate results
      const result: SignalExecutionResult = {
        signal,
        success: true,
        orderId: order.id,
        filledSize: order.filledSize,
        filledPrice: order.avgFillPrice || signal.price,
        fee: 0, // Fee calculated separately
        profit: 0, // Will be calculated when position closes
        executionTimeMs,
      };

      this.log.info('Signal executed successfully', {
        id: signal.id,
        orderId: order.id,
        filledSize: order.filledSize,
        executionTimeMs,
      });

      this.emit('executed', result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log.error('Signal execution failed', {
        id: signal.id,
        error: errorMessage,
      });

      return this.createFailedResult(signal, errorMessage, startTime);
    } finally {
      this.pendingExecutions.delete(signal.id);
    }
  }

  /**
   * Execute multiple signals
   */
  async executeBatch(signals: TradingSignal[]): Promise<SignalExecutionResult[]> {
    const results: SignalExecutionResult[] = [];

    // Execute sequentially to manage risk
    for (const signal of signals) {
      const result = await this.execute(signal);
      results.push(result);

      // Stop if we had a failure (could indicate market issues)
      if (!result.success) {
        this.log.warn('Stopping batch execution due to failure', {
          failedSignal: signal.id,
          remainingSignals: signals.length - results.length,
        });
        break;
      }
    }

    return results;
  }

  /**
   * Calculate limit price with slippage buffer
   */
  private calculateLimitPrice(signal: TradingSignal): number {
    if (signal.side === 'BUY') {
      // For buys, add slippage buffer to price
      return Math.min(0.99, signal.price * (1 + this.config.maxSlippage));
    } else {
      // For sells, subtract slippage buffer from price
      return Math.max(0.01, signal.price * (1 - this.config.maxSlippage));
    }
  }

  /**
   * Create a failed result
   */
  private createFailedResult(
    signal: TradingSignal,
    error: string,
    startTime: number
  ): SignalExecutionResult {
    const result: SignalExecutionResult = {
      signal,
      success: false,
      filledSize: 0,
      filledPrice: 0,
      fee: 0,
      profit: 0,
      executionTimeMs: Date.now() - startTime,
      error,
    };

    this.emit('executionFailed', { signal, error });
    return result;
  }

  /**
   * Check if there are pending executions
   */
  hasPendingExecutions(): boolean {
    return this.pendingExecutions.size > 0;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SignalExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
