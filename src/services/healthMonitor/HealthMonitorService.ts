/**
 * Health Monitor Service
 *
 * Main orchestrator for system health monitoring.
 * Runs periodic health checks, tracks health history, and emits alerts.
 *
 * Features:
 * - Configurable check intervals
 * - Health history tracking
 * - Alert thresholds and notifications
 * - Prometheus metrics integration
 * - File logging integration
 */

import { EventEmitter } from 'events';
import {
  HealthCheckResult,
  runAllHealthChecks,
  getOverallHealth,
  checkDatabase,
  checkRpcProvider,
  checkWalletBalance,
  checkPolymarketClobApi,
  checkPolymarketDataApi,
  checkMemoryUsage,
  checkUptime,
  checkEventLoopLag,
  checkCopyTradingService,
  checkTraderDiscoveryService,
} from './HealthChecks.js';
import { createComponentLogger } from '../../utils/logger.js';
import { initializeFileLogging, getLogStats } from '../../utils/fileLogger.js';
import * as metrics from '../../utils/metrics.js';

const log = createComponentLogger('HealthMonitor');

/**
 * Health monitor configuration
 */
export interface HealthMonitorConfig {
  enabled: boolean;
  checkIntervalMs: number;
  historySize: number; // Number of check results to keep
  alertOnUnhealthy: boolean;
  alertOnDegraded: boolean;
  consecutiveFailuresForAlert: number;
  fileLogging: {
    enabled: boolean;
    directory: string;
    maxFiles: string;
    maxSize: string;
  };
}

const DEFAULT_CONFIG: HealthMonitorConfig = {
  enabled: true,
  checkIntervalMs: 60000, // 1 minute
  historySize: 100,
  alertOnUnhealthy: true,
  alertOnDegraded: false,
  consecutiveFailuresForAlert: 3,
  fileLogging: {
    enabled: true,
    directory: './logs',
    maxFiles: '7d',
    maxSize: '20m',
  },
};

/**
 * Health status snapshot
 */
export interface HealthSnapshot {
  timestamp: Date;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheckResult[];
  metrics: {
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
    totalLatencyMs: number;
    avgLatencyMs: number;
  };
}

/**
 * Health Monitor events
 */
export interface HealthMonitorEvents {
  healthCheck: (snapshot: HealthSnapshot) => void;
  statusChange: (
    newStatus: HealthSnapshot['overallStatus'],
    previousStatus: HealthSnapshot['overallStatus']
  ) => void;
  alert: (check: HealthCheckResult, consecutiveFailures: number) => void;
  recovered: (check: HealthCheckResult) => void;
}

/**
 * Health Monitor Service
 */
export class HealthMonitorService extends EventEmitter {
  private config: HealthMonitorConfig;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private history: HealthSnapshot[] = [];
  private previousStatus: HealthSnapshot['overallStatus'] = 'healthy';
  private consecutiveFailures: Map<string, number> = new Map();

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the health monitor
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      log.warn('Health monitor is disabled');
      return;
    }

    if (this.isRunning) {
      log.warn('Health monitor already running');
      return;
    }

    // Initialize file logging
    if (this.config.fileLogging.enabled) {
      initializeFileLogging({
        enabled: true,
        logDirectory: this.config.fileLogging.directory,
        maxFiles: this.config.fileLogging.maxFiles,
        maxSize: this.config.fileLogging.maxSize,
      });
    }

    this.isRunning = true;

    log.info('Starting health monitor', {
      checkIntervalMs: this.config.checkIntervalMs,
      fileLogging: this.config.fileLogging.enabled,
    });

    // Run initial check
    await this.runHealthCheck();

    // Start periodic checks
    this.checkInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.runHealthCheck();
      }
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the health monitor
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    log.info('Health monitor stopped');
  }

  /**
   * Run a health check
   */
  async runHealthCheck(): Promise<HealthSnapshot> {
    const startTime = Date.now();

    try {
      const checks = await runAllHealthChecks();
      const overallStatus = getOverallHealth(checks);

      // Calculate metrics
      const healthyCount = checks.filter((c) => c.status === 'healthy').length;
      const degradedCount = checks.filter((c) => c.status === 'degraded').length;
      const unhealthyCount = checks.filter((c) => c.status === 'unhealthy').length;

      const latencies = checks.filter((c) => c.latencyMs !== undefined).map((c) => c.latencyMs!);
      const totalLatencyMs = latencies.reduce((sum, l) => sum + l, 0);
      const avgLatencyMs = latencies.length > 0 ? totalLatencyMs / latencies.length : 0;

      const snapshot: HealthSnapshot = {
        timestamp: new Date(),
        overallStatus,
        checks,
        metrics: {
          healthyCount,
          degradedCount,
          unhealthyCount,
          totalLatencyMs,
          avgLatencyMs,
        },
      };

      // Add to history
      this.history.push(snapshot);
      if (this.history.length > this.config.historySize) {
        this.history.shift();
      }

      // Update Prometheus metrics
      this.updateMetrics(snapshot);

      // Check for status changes
      if (overallStatus !== this.previousStatus) {
        log.warn('Health status changed', {
          from: this.previousStatus,
          to: overallStatus,
        });
        this.emit('statusChange', overallStatus, this.previousStatus);
        this.previousStatus = overallStatus;
      }

      // Check for alerts
      this.processAlerts(checks);

      // Emit health check event
      this.emit('healthCheck', snapshot);

      // Log summary
      if (overallStatus !== 'healthy') {
        const unhealthyChecks = checks.filter((c) => c.status !== 'healthy');
        log.warn('Health check completed with issues', {
          overallStatus,
          issues: unhealthyChecks.map((c) => ({ name: c.name, status: c.status, message: c.message })),
        });
      } else {
        log.debug('Health check completed', {
          overallStatus,
          checksRun: checks.length,
          durationMs: Date.now() - startTime,
        });
      }

      return snapshot;
    } catch (error) {
      log.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return error snapshot
      const errorSnapshot: HealthSnapshot = {
        timestamp: new Date(),
        overallStatus: 'unhealthy',
        checks: [
          {
            name: 'health_check_error',
            status: 'unhealthy',
            message: error instanceof Error ? error.message : 'Health check failed',
            timestamp: new Date(),
          },
        ],
        metrics: {
          healthyCount: 0,
          degradedCount: 0,
          unhealthyCount: 1,
          totalLatencyMs: 0,
          avgLatencyMs: 0,
        },
      };

      return errorSnapshot;
    }
  }

  /**
   * Update Prometheus metrics
   */
  private updateMetrics(snapshot: HealthSnapshot): void {
    // Update health status gauge
    const statusValue = snapshot.overallStatus === 'healthy' ? 1 : snapshot.overallStatus === 'degraded' ? 0.5 : 0;
    metrics.healthCheckStatus.set(statusValue);

    // Update check duration histogram
    for (const check of snapshot.checks) {
      if (check.latencyMs !== undefined) {
        metrics.healthCheckLatency.labels(check.name).observe(check.latencyMs);
      }
    }
  }

  /**
   * Process alerts for unhealthy checks
   */
  private processAlerts(checks: HealthCheckResult[]): void {
    for (const check of checks) {
      const failures = this.consecutiveFailures.get(check.name) || 0;

      if (check.status === 'unhealthy' || (this.config.alertOnDegraded && check.status === 'degraded')) {
        const newFailures = failures + 1;
        this.consecutiveFailures.set(check.name, newFailures);

        if (newFailures >= this.config.consecutiveFailuresForAlert) {
          log.error('Health alert triggered', {
            check: check.name,
            status: check.status,
            message: check.message,
            consecutiveFailures: newFailures,
          });
          this.emit('alert', check, newFailures);
        }
      } else {
        // Check recovered
        if (failures >= this.config.consecutiveFailuresForAlert) {
          log.info('Health check recovered', {
            check: check.name,
            previousFailures: failures,
          });
          this.emit('recovered', check);
        }
        this.consecutiveFailures.set(check.name, 0);
      }
    }
  }

  /**
   * Get current health status
   */
  getCurrentStatus(): HealthSnapshot | null {
    return this.history[this.history.length - 1] || null;
  }

  /**
   * Get health history
   */
  getHistory(limit?: number): HealthSnapshot[] {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  /**
   * Get uptime percentage
   */
  getUptimePercentage(): number {
    if (this.history.length === 0) {
      return 100;
    }

    const healthyCount = this.history.filter((s) => s.overallStatus === 'healthy').length;
    return (healthyCount / this.history.length) * 100;
  }

  /**
   * Get average response time
   */
  getAverageResponseTime(): number {
    if (this.history.length === 0) {
      return 0;
    }

    const totalAvg = this.history.reduce((sum, s) => sum + s.metrics.avgLatencyMs, 0);
    return totalAvg / this.history.length;
  }

  /**
   * Run a specific health check
   */
  async runSpecificCheck(checkName: string): Promise<HealthCheckResult | null> {
    switch (checkName) {
      case 'database':
        return checkDatabase();
      case 'rpc_provider':
        return checkRpcProvider();
      case 'wallet_balance':
        return checkWalletBalance();
      case 'polymarket_clob_api':
        return checkPolymarketClobApi();
      case 'polymarket_data_api':
        return checkPolymarketDataApi();
      case 'memory':
        return checkMemoryUsage();
      case 'uptime':
        return checkUptime();
      case 'event_loop':
        return checkEventLoopLag();
      case 'copy_trading_service':
        return checkCopyTradingService();
      case 'trader_discovery_service':
        return checkTraderDiscoveryService();
      default:
        log.warn('Unknown health check', { checkName });
        return null;
    }
  }

  /**
   * Get log statistics
   */
  getLogStats() {
    return getLogStats({
      logDirectory: this.config.fileLogging.directory,
    });
  }

  /**
   * Get service state
   */
  getState(): {
    isRunning: boolean;
    currentStatus: HealthSnapshot['overallStatus'] | null;
    checksInHistory: number;
    uptimePercent: number;
    avgResponseTime: number;
    consecutiveFailures: Record<string, number>;
  } {
    const current = this.getCurrentStatus();

    return {
      isRunning: this.isRunning,
      currentStatus: current?.overallStatus || null,
      checksInHistory: this.history.length,
      uptimePercent: this.getUptimePercentage(),
      avgResponseTime: this.getAverageResponseTime(),
      consecutiveFailures: Object.fromEntries(this.consecutiveFailures),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthMonitorConfig>): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...config };

    if (wasRunning) {
      this.start();
    }

    log.info('Health monitor config updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): HealthMonitorConfig {
    return { ...this.config };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
    this.consecutiveFailures.clear();
    log.info('Health history cleared');
  }

  /**
   * Check if running
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const healthMonitorService = new HealthMonitorService();

// Default export
export default HealthMonitorService;
