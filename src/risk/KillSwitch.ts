import { EventEmitter } from 'events';
import type { OrderManager } from '../services/orderManager/index.js';
import { logger, type Logger } from '../utils/logger.js';
import { killSwitchActivations, drawdownPercent, dailyPnl } from '../utils/metrics.js';
import { getConfig } from '../config/index.js';

/**
 * Kill switch trigger reasons
 */
export enum KillSwitchTrigger {
  DAILY_LOSS_LIMIT = 'daily_loss_limit',
  DRAWDOWN_LIMIT = 'drawdown_limit',
  API_ERROR_RATE = 'api_error_rate',
  MANUAL = 'manual',
  POSITION_LIMIT = 'position_limit',
}

/**
 * Kill switch state
 */
export interface KillSwitchState {
  isActive: boolean;
  trigger: KillSwitchTrigger | null;
  activatedAt: Date | null;
  message: string | null;
}

/**
 * Risk metrics for monitoring
 */
export interface RiskMetrics {
  dailyPnl: number;
  peakEquity: number;
  currentEquity: number;
  drawdown: number;
  drawdownPercent: number;
  totalExposure: number;
  apiErrorRate: number;
}

/**
 * Kill Switch
 * Emergency stop system that halts all trading when risk limits are breached
 */
export class KillSwitch extends EventEmitter {
  private log: Logger;
  private orderManager: OrderManager;
  private state: KillSwitchState;
  private metrics: RiskMetrics;
  private checkIntervalMs: number;
  private checkInterval: NodeJS.Timeout | null;

  // Limits
  private dailyLossLimit: number;
  private maxDrawdownPercent: number;
  private maxApiErrorRate: number;
  private maxTotalExposure: number;

  // Tracking
  private apiErrorCount: number;
  private apiTotalCount: number;
  private errorWindowMs: number;
  private errorWindowStart: number;

  constructor(orderManager: OrderManager) {
    super();
    this.log = logger('KillSwitch');
    this.orderManager = orderManager;

    // Initial state
    this.state = {
      isActive: false,
      trigger: null,
      activatedAt: null,
      message: null,
    };

    // Initial metrics
    this.metrics = {
      dailyPnl: 0,
      peakEquity: 0,
      currentEquity: 0,
      drawdown: 0,
      drawdownPercent: 0,
      totalExposure: 0,
      apiErrorRate: 0,
    };

    // Load limits from config
    const config = getConfig();
    this.dailyLossLimit = config.risk.maxDailyLossUsd;
    this.maxDrawdownPercent = config.risk.maxDrawdownPercent;
    this.maxApiErrorRate = 0.1; // 10% error rate threshold
    this.maxTotalExposure = config.risk.maxTotalExposureUsd;

    // Error tracking
    this.apiErrorCount = 0;
    this.apiTotalCount = 0;
    this.errorWindowMs = 60000; // 1 minute window
    this.errorWindowStart = Date.now();

    // Monitoring interval
    this.checkIntervalMs = 1000; // Check every second
    this.checkInterval = null;

    this.log.info('Kill switch initialized', {
      dailyLossLimit: this.dailyLossLimit,
      maxDrawdownPercent: this.maxDrawdownPercent,
      maxApiErrorRate: this.maxApiErrorRate,
      maxTotalExposure: this.maxTotalExposure,
    });
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.checkInterval) {
      this.log.warn('Kill switch monitoring already running');
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkLimits();
    }, this.checkIntervalMs);

    this.log.info('Kill switch monitoring started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.log.info('Kill switch monitoring stopped');
  }

  /**
   * Check all limits
   */
  private checkLimits(): void {
    if (this.state.isActive) return; // Already triggered

    // Check daily loss limit
    if (this.metrics.dailyPnl < -this.dailyLossLimit) {
      this.activate(
        KillSwitchTrigger.DAILY_LOSS_LIMIT,
        `Daily loss limit exceeded: ${this.metrics.dailyPnl.toFixed(2)} < -${this.dailyLossLimit}`
      );
      return;
    }

    // Check drawdown limit
    if (this.metrics.drawdownPercent > this.maxDrawdownPercent) {
      this.activate(
        KillSwitchTrigger.DRAWDOWN_LIMIT,
        `Drawdown limit exceeded: ${this.metrics.drawdownPercent.toFixed(2)}% > ${this.maxDrawdownPercent}%`
      );
      return;
    }

    // Check API error rate
    if (this.metrics.apiErrorRate > this.maxApiErrorRate) {
      this.activate(
        KillSwitchTrigger.API_ERROR_RATE,
        `API error rate exceeded: ${(this.metrics.apiErrorRate * 100).toFixed(1)}% > ${this.maxApiErrorRate * 100}%`
      );
      return;
    }

    // Check total exposure
    if (this.metrics.totalExposure > this.maxTotalExposure) {
      this.activate(
        KillSwitchTrigger.POSITION_LIMIT,
        `Total exposure exceeded: $${this.metrics.totalExposure.toFixed(2)} > $${this.maxTotalExposure}`
      );
      return;
    }
  }

  /**
   * Activate kill switch
   */
  async activate(trigger: KillSwitchTrigger, message: string): Promise<void> {
    if (this.state.isActive) {
      this.log.warn('Kill switch already active');
      return;
    }

    this.log.error('KILL SWITCH ACTIVATED', { trigger, message });

    this.state = {
      isActive: true,
      trigger,
      activatedAt: new Date(),
      message,
    };

    // Record metrics
    killSwitchActivations.labels(trigger).inc();

    // Cancel all orders
    try {
      await this.orderManager.cancelAllOrders();
      this.log.info('All orders cancelled');
    } catch (error) {
      this.log.error('Failed to cancel orders during kill switch', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Emit event
    this.emit('activated', this.state);

    // Alert (could integrate with Slack, email, etc.)
    this.alert(message);
  }

  /**
   * Manual activation
   */
  async activateManual(reason: string = 'Manual activation'): Promise<void> {
    await this.activate(KillSwitchTrigger.MANUAL, reason);
  }

  /**
   * Deactivate kill switch (manual reset)
   */
  deactivate(): void {
    if (!this.state.isActive) {
      this.log.warn('Kill switch not active');
      return;
    }

    this.log.info('Kill switch deactivated');

    this.state = {
      isActive: false,
      trigger: null,
      activatedAt: null,
      message: null,
    };

    // Emit event
    this.emit('deactivated');
  }

  /**
   * Check if kill switch is active
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Get current state
   */
  getState(): KillSwitchState {
    return { ...this.state };
  }

  /**
   * Update daily P&L
   */
  updateDailyPnl(pnl: number): void {
    this.metrics.dailyPnl = pnl;
    dailyPnl.set(pnl);
  }

  /**
   * Update equity and calculate drawdown
   */
  updateEquity(currentEquity: number): void {
    this.metrics.currentEquity = currentEquity;

    // Update peak
    if (currentEquity > this.metrics.peakEquity) {
      this.metrics.peakEquity = currentEquity;
    }

    // Calculate drawdown
    if (this.metrics.peakEquity > 0) {
      this.metrics.drawdown = this.metrics.peakEquity - currentEquity;
      this.metrics.drawdownPercent = (this.metrics.drawdown / this.metrics.peakEquity) * 100;
      drawdownPercent.set(this.metrics.drawdownPercent);
    }
  }

  /**
   * Update total exposure
   */
  updateExposure(exposure: number): void {
    this.metrics.totalExposure = exposure;
  }

  /**
   * Record API call result for error rate tracking
   */
  recordApiCall(success: boolean): void {
    // Reset window if expired
    if (Date.now() - this.errorWindowStart > this.errorWindowMs) {
      this.apiErrorCount = 0;
      this.apiTotalCount = 0;
      this.errorWindowStart = Date.now();
    }

    this.apiTotalCount++;
    if (!success) {
      this.apiErrorCount++;
    }

    // Calculate error rate
    this.metrics.apiErrorRate = this.apiTotalCount > 0 ? this.apiErrorCount / this.apiTotalCount : 0;
  }

  /**
   * Get risk metrics
   */
  getMetrics(): RiskMetrics {
    return { ...this.metrics };
  }

  /**
   * Alert (placeholder for integration with notification services)
   */
  private alert(message: string): void {
    this.log.error('ALERT: ' + message);

    // TODO: Integrate with notification services
    // - Slack webhook
    // - Email
    // - SMS
    // - PagerDuty
  }

  /**
   * Reset daily metrics (call at start of trading day)
   */
  resetDaily(): void {
    this.metrics.dailyPnl = 0;
    this.metrics.peakEquity = this.metrics.currentEquity;
    dailyPnl.set(0);

    this.log.info('Daily metrics reset');
  }

  /**
   * Update limits
   */
  setLimits(limits: {
    dailyLossLimit?: number;
    maxDrawdownPercent?: number;
    maxApiErrorRate?: number;
    maxTotalExposure?: number;
  }): void {
    if (limits.dailyLossLimit !== undefined) {
      this.dailyLossLimit = limits.dailyLossLimit;
    }
    if (limits.maxDrawdownPercent !== undefined) {
      this.maxDrawdownPercent = limits.maxDrawdownPercent;
    }
    if (limits.maxApiErrorRate !== undefined) {
      this.maxApiErrorRate = limits.maxApiErrorRate;
    }
    if (limits.maxTotalExposure !== undefined) {
      this.maxTotalExposure = limits.maxTotalExposure;
    }

    this.log.info('Risk limits updated', {
      dailyLossLimit: this.dailyLossLimit,
      maxDrawdownPercent: this.maxDrawdownPercent,
      maxApiErrorRate: this.maxApiErrorRate,
      maxTotalExposure: this.maxTotalExposure,
    });
  }
}
