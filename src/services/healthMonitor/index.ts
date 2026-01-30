/**
 * Health Monitor Module
 *
 * Provides comprehensive health monitoring for the prediction market trading bot.
 *
 * Main Components:
 * - HealthMonitorService: Main orchestrator for health monitoring
 * - HealthChecks: Individual health check functions
 *
 * Features:
 * - Database connectivity checks
 * - RPC provider connectivity checks
 * - Wallet balance monitoring
 * - API endpoint health checks
 * - System resource monitoring
 * - Service state monitoring
 * - File-based logging with rotation
 */

// Main service
export {
  HealthMonitorService,
  healthMonitorService,
  default,
} from './HealthMonitorService.js';

// Health checks
export {
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
  runAllHealthChecks,
  getOverallHealth,
} from './HealthChecks.js';

// Types
export type { HealthCheckResult } from './HealthChecks.js';
export type {
  HealthMonitorConfig,
  HealthSnapshot,
  HealthMonitorEvents,
} from './HealthMonitorService.js';
