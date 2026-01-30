/**
 * Health Checks
 *
 * Individual health check functions for various system components.
 * Each check returns a standardized HealthCheckResult.
 *
 * Checks include:
 * - Database connectivity
 * - RPC provider connectivity
 * - Wallet balance
 * - API endpoints
 * - Service states
 * - System resources
 */

import { createComponentLogger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';

const log = createComponentLogger('HealthChecks');

/**
 * Health check result
 */
export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Check database connectivity
 */
export async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const name = 'database';

  try {
    // Dynamic import to avoid circular dependencies
    const { checkHealth } = await import('../../database/index.js');

    // Execute a simple health check
    const health = await checkHealth();

    if (!health.connected) {
      throw new Error('Database not connected');
    }

    return {
      name,
      status: 'healthy',
      message: 'Database connection successful',
      latencyMs: health.latencyMs,
      timestamp: new Date(),
    };
  } catch (error) {
    log.error('Database health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      name,
      status: 'unhealthy',
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      latencyMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

/**
 * Check RPC provider connectivity
 * Uses Polygon mainnet RPC for chain ID 137
 */
export async function checkRpcProvider(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const name = 'rpc_provider';

  try {
    const config = getConfig();
    // Use default Polygon RPC for health checks
    const rpcUrl = config.polymarket.chainId === 137
      ? 'https://polygon-rpc.com'
      : 'https://rpc.ankr.com/polygon';

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as { result: string };
    const blockNumber = parseInt(data.result, 16);

    return {
      name,
      status: 'healthy',
      message: 'RPC provider connected',
      latencyMs: Date.now() - startTime,
      details: {
        blockNumber,
        chainId: config.polymarket.chainId,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    log.error('RPC health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      name,
      status: 'unhealthy',
      message: `RPC provider check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      latencyMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

/**
 * Check wallet balance
 */
export async function checkWalletBalance(_minBalanceUsdc: number = 1): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const name = 'wallet_balance';

  try {
    const config = getConfig();
    const walletAddress = config.polymarket.funderAddress;

    if (!walletAddress) {
      return {
        name,
        status: 'healthy',
        message: 'No wallet configured (paper trading mode)',
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    }

    // Use default Polygon RPC for balance check
    const rpcUrl = 'https://polygon-rpc.com';

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as { result: string };
    const balanceWei = BigInt(data.result);
    const balanceEth = Number(balanceWei) / 1e18;

    // Determine status based on balance thresholds
    let status: HealthCheckResult['status'];
    let message: string;

    if (balanceEth < 0.001) {
      status = 'unhealthy';
      message = 'ETH balance critically low for gas';
    } else if (balanceEth < 0.01) {
      status = 'degraded';
      message = 'ETH balance low for gas';
    } else {
      status = 'healthy';
      message = 'Wallet balance sufficient';
    }

    return {
      name,
      status,
      message,
      latencyMs: Date.now() - startTime,
      details: {
        balanceEth: balanceEth.toFixed(6),
        walletAddress: walletAddress.slice(0, 10) + '...',
      },
      timestamp: new Date(),
    };
  } catch (error) {
    log.error('Wallet balance check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      name,
      status: 'unhealthy',
      message: `Wallet balance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      latencyMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

/**
 * Check Polymarket CLOB API
 */
export async function checkPolymarketClobApi(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const name = 'polymarket_clob_api';

  try {
    const config = getConfig();
    const clobApiUrl = config.polymarket.host;
    const response = await fetch(`${clobApiUrl}/markets?limit=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    await response.json();

    return {
      name,
      status: 'healthy',
      message: 'Polymarket CLOB API accessible',
      latencyMs: Date.now() - startTime,
      details: {
        endpoint: clobApiUrl,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    log.error('Polymarket CLOB API check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      name,
      status: 'unhealthy',
      message: `CLOB API check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      latencyMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

/**
 * Check Polymarket Data API
 */
export async function checkPolymarketDataApi(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const name = 'polymarket_data_api';

  try {
    const response = await fetch('https://data-api.polymarket.com/markets?limit=1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    await response.json();

    return {
      name,
      status: 'healthy',
      message: 'Polymarket Data API accessible',
      latencyMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  } catch (error) {
    log.error('Polymarket Data API check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      name,
      status: 'unhealthy',
      message: `Data API check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      latencyMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

/**
 * Check system memory usage
 */
export function checkMemoryUsage(maxUsagePercent: number = 90): HealthCheckResult {
  const name = 'memory';

  try {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const rssMB = Math.round(used.rss / 1024 / 1024);
    const usagePercent = (used.heapUsed / used.heapTotal) * 100;

    let status: HealthCheckResult['status'];
    let message: string;

    if (usagePercent >= maxUsagePercent) {
      status = 'unhealthy';
      message = 'Memory usage critical';
    } else if (usagePercent >= maxUsagePercent * 0.8) {
      status = 'degraded';
      message = 'Memory usage high';
    } else {
      status = 'healthy';
      message = 'Memory usage normal';
    }

    return {
      name,
      status,
      message,
      details: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        usagePercent: Math.round(usagePercent * 10) / 10,
        externalMB: Math.round(used.external / 1024 / 1024),
      },
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      name,
      status: 'unhealthy',
      message: `Memory check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Check process uptime
 */
export function checkUptime(): HealthCheckResult {
  const name = 'uptime';

  const uptimeSeconds = process.uptime();
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const uptimeDays = Math.floor(uptimeHours / 24);

  let uptimeString: string;
  if (uptimeDays > 0) {
    uptimeString = `${uptimeDays}d ${uptimeHours % 24}h ${uptimeMinutes % 60}m`;
  } else if (uptimeHours > 0) {
    uptimeString = `${uptimeHours}h ${uptimeMinutes % 60}m`;
  } else {
    uptimeString = `${uptimeMinutes}m ${Math.floor(uptimeSeconds % 60)}s`;
  }

  return {
    name,
    status: 'healthy',
    message: `Uptime: ${uptimeString}`,
    details: {
      uptimeSeconds: Math.floor(uptimeSeconds),
      uptimeFormatted: uptimeString,
      startedAt: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
    },
    timestamp: new Date(),
  };
}

/**
 * Check event loop lag
 */
export async function checkEventLoopLag(
  maxLagMs: number = 100
): Promise<HealthCheckResult> {
  const name = 'event_loop';

  return new Promise((resolve) => {
    const start = Date.now();

    setImmediate(() => {
      const lag = Date.now() - start;

      let status: HealthCheckResult['status'];
      let message: string;

      if (lag >= maxLagMs) {
        status = 'unhealthy';
        message = 'Event loop lag critical';
      } else if (lag >= maxLagMs * 0.5) {
        status = 'degraded';
        message = 'Event loop lag elevated';
      } else {
        status = 'healthy';
        message = 'Event loop responsive';
      }

      resolve({
        name,
        status,
        message,
        latencyMs: lag,
        details: {
          lagMs: lag,
          threshold: maxLagMs,
        },
        timestamp: new Date(),
      });
    });
  });
}

// Store reference to copy trading service if it's registered
let copyTradingServiceInstance: { getState: () => CopyTradingState } | null = null;

interface CopyTradingState {
  isRunning: boolean;
  tradersMonitored: number;
  activeTraders: number;
  openPositions: number;
}

/**
 * Register copy trading service for health checks
 */
export function registerCopyTradingService(service: { getState: () => CopyTradingState }): void {
  copyTradingServiceInstance = service;
}

/**
 * Check copy trading service (if available)
 */
export async function checkCopyTradingService(): Promise<HealthCheckResult> {
  const name = 'copy_trading_service';

  if (!copyTradingServiceInstance) {
    return {
      name,
      status: 'healthy',
      message: 'Copy trading service not loaded',
      timestamp: new Date(),
    };
  }

  try {
    const state = copyTradingServiceInstance.getState();

    let status: HealthCheckResult['status'];
    let message: string;

    if (state.isRunning && state.tradersMonitored > 0) {
      status = 'healthy';
      message = `Copy trading active with ${state.tradersMonitored} traders`;
    } else if (state.isRunning) {
      status = 'degraded';
      message = 'Copy trading running but no traders monitored';
    } else {
      status = 'healthy';
      message = 'Copy trading service stopped';
    }

    return {
      name,
      status,
      message,
      details: {
        isRunning: state.isRunning,
        tradersMonitored: state.tradersMonitored,
        activeTraders: state.activeTraders,
        openPositions: state.openPositions,
      },
      timestamp: new Date(),
    };
  } catch {
    return {
      name,
      status: 'healthy',
      message: 'Copy trading service not available',
      timestamp: new Date(),
    };
  }
}

/**
 * Check trader discovery service (if available)
 */
export async function checkTraderDiscoveryService(): Promise<HealthCheckResult> {
  const name = 'trader_discovery_service';

  try {
    const { traderDiscoveryService } = await import('../traderDiscovery/TraderDiscoveryService.js');

    const state = traderDiscoveryService.getState();
    const cacheStats = traderDiscoveryService.getCacheStats();

    let status: HealthCheckResult['status'];
    let message: string;

    if (state.isScanning) {
      status = 'healthy';
      message = `Scanning traders: ${state.scanProgress?.current}/${state.scanProgress?.total}`;
    } else {
      status = 'healthy';
      message = `Trader discovery idle, ${cacheStats.size} traders cached`;
    }

    return {
      name,
      status,
      message,
      details: {
        isScanning: state.isScanning,
        tradersAnalyzed: state.tradersAnalyzed,
        tradersInCache: cacheStats.size,
        lastScanAt: state.lastScanAt?.toISOString(),
      },
      timestamp: new Date(),
    };
  } catch {
    return {
      name,
      status: 'healthy',
      message: 'Trader discovery service not loaded',
      timestamp: new Date(),
    };
  }
}

/**
 * Run all health checks
 */
export async function runAllHealthChecks(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];

  // Parallel checks for independent services
  const [
    dbCheck,
    rpcCheck,
    walletCheck,
    clobCheck,
    dataApiCheck,
    eventLoopCheck,
    copyTradingCheck,
    discoveryCheck,
  ] = await Promise.all([
    checkDatabase(),
    checkRpcProvider(),
    checkWalletBalance(),
    checkPolymarketClobApi(),
    checkPolymarketDataApi(),
    checkEventLoopLag(),
    checkCopyTradingService(),
    checkTraderDiscoveryService(),
  ]);

  results.push(
    dbCheck,
    rpcCheck,
    walletCheck,
    clobCheck,
    dataApiCheck,
    eventLoopCheck,
    copyTradingCheck,
    discoveryCheck
  );

  // Sync checks
  results.push(checkMemoryUsage());
  results.push(checkUptime());

  return results;
}

/**
 * Get overall system health from individual checks
 */
export function getOverallHealth(
  results: HealthCheckResult[]
): 'healthy' | 'degraded' | 'unhealthy' {
  const hasUnhealthy = results.some((r) => r.status === 'unhealthy');
  const hasDegraded = results.some((r) => r.status === 'degraded');

  if (hasUnhealthy) return 'unhealthy';
  if (hasDegraded) return 'degraded';
  return 'healthy';
}
