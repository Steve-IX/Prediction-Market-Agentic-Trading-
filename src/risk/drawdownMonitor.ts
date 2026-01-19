import { EventEmitter } from 'events';
import { KillSwitch, KillSwitchTrigger } from './KillSwitch.js';
import { logger, type Logger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import { drawdownPercent, dailyPnl } from '../utils/metrics.js';
// Removed unused imports
import { startOfDay } from '../utils/time.js';

/**
 * Drawdown monitor configuration
 */
export interface DrawdownMonitorConfig {
  /**
   * Maximum drawdown percentage (0-100) before alert
   */
  maxDrawdownPercent: number;
  /**
   * Alert threshold percentage (0-100) - alert when approaching limit
   */
  alertThresholdPercent?: number;
  /**
   * Check interval in milliseconds
   */
  checkIntervalMs?: number;
}

/**
 * Equity snapshot
 */
export interface EquitySnapshot {
  timestamp: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

/**
 * Drawdown metrics
 */
export interface DrawdownMetrics {
  /**
   * Current equity
   */
  currentEquity: number;
  /**
   * Peak equity
   */
  peakEquity: number;
  /**
   * Current drawdown in USD
   */
  drawdown: number;
  /**
   * Current drawdown percentage
   */
  drawdownPercent: number;
  /**
   * Maximum drawdown in USD (from peak)
   */
  maxDrawdown: number;
  /**
   * Maximum drawdown percentage
   */
  maxDrawdownPercent: number;
  /**
   * Daily P&L
   */
  dailyPnl: number;
  /**
   * Peak equity timestamp
   */
  peakEquityTimestamp: number;
}

/**
 * Drawdown Monitor
 * Tracks equity over time and monitors drawdown
 */
export class DrawdownMonitor extends EventEmitter {
  private log: Logger;
  private config: DrawdownMonitorConfig;
  private killSwitch: KillSwitch | null = null;
  private equityHistory: EquitySnapshot[] = [];
  private peakEquity: number = 0;
  private peakEquityTimestamp: number = Date.now();
  private dailyStartEquity: number = 0;
  private dailyStartTimestamp: number = startOfDay();
  private checkInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(config?: Partial<DrawdownMonitorConfig>) {
    super();
    this.log = logger('DrawdownMonitor');
    const riskConfig = getConfig().risk;

    this.config = {
      maxDrawdownPercent: config?.maxDrawdownPercent ?? riskConfig.maxDrawdownPercent,
      alertThresholdPercent: config?.alertThresholdPercent ?? riskConfig.maxDrawdownPercent * 0.8,
      checkIntervalMs: config?.checkIntervalMs ?? 1000, // Check every second
    };

    this.log.info('Drawdown monitor initialized', {
      maxDrawdownPercent: this.config.maxDrawdownPercent,
      alertThreshold: this.config.alertThresholdPercent,
    } as Record<string, unknown>);
  }

  /**
   * Set kill switch reference
   */
  setKillSwitch(killSwitch: KillSwitch): void {
    this.killSwitch = killSwitch;
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.isMonitoring) {
      this.log.warn('Drawdown monitor already running');
      return;
    }

    this.isMonitoring = true;
    this.checkInterval = setInterval(() => {
      this.checkDrawdown();
    }, this.config.checkIntervalMs);

    this.log.info('Drawdown monitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.log.info('Drawdown monitor stopped');
  }

  /**
   * Update equity (called when positions or balance change)
   */
  updateEquity(equity: number, realizedPnl: number, unrealizedPnl: number): void {
    const now = Date.now();
    const snapshot: EquitySnapshot = {
      timestamp: now,
      equity,
      realizedPnl,
      unrealizedPnl,
    };

    this.equityHistory.push(snapshot);

    // Keep only last 24 hours of history (1 snapshot per second = 86400 snapshots max)
    const maxHistory = 86400;
    if (this.equityHistory.length > maxHistory) {
      this.equityHistory = this.equityHistory.slice(-maxHistory);
    }

    // Update peak equity
    if (equity > this.peakEquity) {
      this.peakEquity = equity;
      this.peakEquityTimestamp = now;
      this.log.debug('New peak equity', { equity, timestamp: now });
    }

    // Reset daily tracking if new day
    if (now >= this.dailyStartTimestamp + 24 * 60 * 60 * 1000) {
      this.dailyStartEquity = equity;
      this.dailyStartTimestamp = startOfDay(now);
      this.log.info('Daily tracking reset', { dailyStartEquity: equity });
    }

    // Update metrics
    this.updateMetrics();

    // Check drawdown
    this.checkDrawdown();
  }

  /**
   * Check drawdown and trigger alerts if needed
   */
  private checkDrawdown(): void {
    if (this.equityHistory.length === 0) {
      return;
    }

    const metrics = this.getMetrics();

    // Update metrics
    drawdownPercent.set(metrics.drawdownPercent);
    dailyPnl.set(metrics.dailyPnl);

    // Check if drawdown exceeds limit
    if (metrics.drawdownPercent >= this.config.maxDrawdownPercent) {
      this.log.error('Drawdown limit exceeded!', metrics as unknown as Record<string, unknown>);
      this.emit('drawdownLimitExceeded', metrics);

      if (this.killSwitch) {
        this.killSwitch.activate(KillSwitchTrigger.DRAWDOWN_LIMIT, `Drawdown ${metrics.drawdownPercent.toFixed(2)}% exceeds limit ${this.config.maxDrawdownPercent}%`);
      }
      return;
    }

    // Check alert threshold
    if (this.config.alertThresholdPercent && metrics.drawdownPercent >= this.config.alertThresholdPercent) {
      this.log.warn('Drawdown approaching limit', metrics as unknown as Record<string, unknown>);
      this.emit('drawdownAlert', metrics);
    }
  }

  /**
   * Get current drawdown metrics
   */
  getMetrics(): DrawdownMetrics {
    if (this.equityHistory.length === 0) {
      return {
        currentEquity: 0,
        peakEquity: 0,
        drawdown: 0,
        drawdownPercent: 0,
        maxDrawdown: 0,
        maxDrawdownPercent: 0,
        dailyPnl: 0,
        peakEquityTimestamp: Date.now(),
      };
    }

    const latest = this.equityHistory[this.equityHistory.length - 1];
    if (!latest) {
      return {
        currentEquity: 0,
        peakEquity: 0,
        drawdown: 0,
        drawdownPercent: 0,
        maxDrawdown: 0,
        maxDrawdownPercent: 0,
        dailyPnl: 0,
        peakEquityTimestamp: Date.now(),
      };
    }
    const currentEquity = latest.equity;

    // Calculate drawdown from peak
    const drawdown = this.peakEquity - currentEquity;
    const drawdownPercent = this.peakEquity > 0 ? (drawdown / this.peakEquity) * 100 : 0;

    // Calculate max drawdown from history
    const equitySeries = this.equityHistory.map((s) => s.equity);
    const maxDrawdown = Math.max(0, this.peakEquity - Math.min(...equitySeries));
    const maxDrawdownPercent = this.peakEquity > 0 ? (maxDrawdown / this.peakEquity) * 100 : 0;

    // Calculate daily P&L
    const dailyPnl = currentEquity - this.dailyStartEquity;

    return {
      currentEquity,
      peakEquity: this.peakEquity,
      drawdown,
      drawdownPercent,
      maxDrawdown,
      maxDrawdownPercent,
      dailyPnl,
      peakEquityTimestamp: this.peakEquityTimestamp,
    };
  }

  /**
   * Get equity history
   */
  getEquityHistory(): EquitySnapshot[] {
    return [...this.equityHistory];
  }

  /**
   * Get equity history for a time range
   */
  getEquityHistoryRange(startTime: number, endTime: number): EquitySnapshot[] {
    return this.equityHistory.filter(
      (snapshot) => snapshot.timestamp >= startTime && snapshot.timestamp <= endTime
    );
  }

  /**
   * Reset peak equity (for testing or after reset)
   */
  resetPeakEquity(equity: number): void {
    this.peakEquity = equity;
    this.peakEquityTimestamp = Date.now();
    this.dailyStartEquity = equity;
    this.dailyStartTimestamp = startOfDay();
    this.equityHistory = [
      {
        timestamp: Date.now(),
        equity,
        realizedPnl: 0,
        unrealizedPnl: 0,
      },
    ];
    this.log.info('Peak equity reset', { equity });
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    const metrics = this.getMetrics();
    drawdownPercent.set(metrics.drawdownPercent);
    dailyPnl.set(metrics.dailyPnl);
  }

  /**
   * Get current state
   */
  getState(): {
    isMonitoring: boolean;
    equityHistoryLength: number;
    metrics: DrawdownMetrics;
  } {
    return {
      isMonitoring: this.isMonitoring,
      equityHistoryLength: this.equityHistory.length,
      metrics: this.getMetrics(),
    };
  }
}
