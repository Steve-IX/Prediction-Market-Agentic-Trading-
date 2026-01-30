import client, { Counter, Gauge, Histogram, Registry } from 'prom-client';

// Create a custom registry
const registry = new Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register: registry });

// ============================================
// Trading Metrics
// ============================================

// Orders
export const ordersPlaced = new Counter({
  name: 'trading_orders_placed_total',
  help: 'Total number of orders placed',
  labelNames: ['platform', 'side', 'type', 'status'] as const,
  registers: [registry],
});

export const ordersFilled = new Counter({
  name: 'trading_orders_filled_total',
  help: 'Total number of orders filled',
  labelNames: ['platform', 'side'] as const,
  registers: [registry],
});

export const orderLatency = new Histogram({
  name: 'trading_order_latency_ms',
  help: 'Order placement latency in milliseconds',
  labelNames: ['platform'] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [registry],
});

// Trades
export const tradesExecuted = new Counter({
  name: 'trading_trades_executed_total',
  help: 'Total number of trades executed',
  labelNames: ['platform', 'side', 'strategy'] as const,
  registers: [registry],
});

export const tradeVolume = new Counter({
  name: 'trading_trade_volume_usd_total',
  help: 'Total trade volume in USD',
  labelNames: ['platform', 'side'] as const,
  registers: [registry],
});

// ============================================
// Arbitrage Metrics
// ============================================

export const arbitrageOpportunities = new Counter({
  name: 'arbitrage_opportunities_detected_total',
  help: 'Total number of arbitrage opportunities detected',
  labelNames: ['type'] as const,
  registers: [registry],
});

export const arbitrageExecutions = new Counter({
  name: 'arbitrage_executions_total',
  help: 'Total number of arbitrage executions',
  labelNames: ['type', 'result'] as const,
  registers: [registry],
});

export const arbitrageProfit = new Histogram({
  name: 'arbitrage_profit_usd',
  help: 'Profit from arbitrage trades in USD',
  buckets: [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [registry],
});

export const arbitrageSpread = new Histogram({
  name: 'arbitrage_spread_bps',
  help: 'Arbitrage spread in basis points',
  buckets: [1, 2, 5, 10, 20, 50, 100, 200, 500],
  registers: [registry],
});

// ============================================
// Position Metrics
// ============================================

export const openPositions = new Gauge({
  name: 'trading_open_positions',
  help: 'Current number of open positions',
  labelNames: ['platform'] as const,
  registers: [registry],
});

export const positionValue = new Gauge({
  name: 'trading_position_value_usd',
  help: 'Current position value in USD',
  labelNames: ['platform'] as const,
  registers: [registry],
});

export const totalExposure = new Gauge({
  name: 'trading_total_exposure_usd',
  help: 'Total exposure across all positions in USD',
  registers: [registry],
});

// ============================================
// P&L Metrics
// ============================================

export const realizedPnl = new Gauge({
  name: 'trading_realized_pnl_usd',
  help: 'Realized P&L in USD',
  labelNames: ['platform', 'strategy'] as const,
  registers: [registry],
});

export const unrealizedPnl = new Gauge({
  name: 'trading_unrealized_pnl_usd',
  help: 'Unrealized P&L in USD',
  labelNames: ['platform'] as const,
  registers: [registry],
});

export const dailyPnl = new Gauge({
  name: 'trading_daily_pnl_usd',
  help: 'Daily P&L in USD',
  registers: [registry],
});

export const totalPnl = new Gauge({
  name: 'trading_total_pnl_usd',
  help: 'Total P&L in USD',
  registers: [registry],
});

// ============================================
// Risk Metrics
// ============================================

export const killSwitchActivations = new Counter({
  name: 'risk_kill_switch_activations_total',
  help: 'Total number of kill switch activations',
  labelNames: ['trigger'] as const,
  registers: [registry],
});

export const drawdownPercent = new Gauge({
  name: 'risk_drawdown_percent',
  help: 'Current drawdown percentage from peak',
  registers: [registry],
});

export const riskLimitUtilization = new Gauge({
  name: 'risk_limit_utilization_percent',
  help: 'Risk limit utilization percentage',
  labelNames: ['limit_type'] as const,
  registers: [registry],
});

// ============================================
// API & WebSocket Metrics
// ============================================

export const apiRequests = new Counter({
  name: 'api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['platform', 'endpoint', 'status'] as const,
  registers: [registry],
});

export const apiLatency = new Histogram({
  name: 'api_latency_ms',
  help: 'API request latency in milliseconds',
  labelNames: ['platform', 'endpoint'] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [registry],
});

export const apiErrors = new Counter({
  name: 'api_errors_total',
  help: 'Total number of API errors',
  labelNames: ['platform', 'error_type'] as const,
  registers: [registry],
});

export const rateLimitHits = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['limiter'] as const,
  registers: [registry],
});

export const rateLimitWaits = new Histogram({
  name: 'rate_limit_wait_ms',
  help: 'Time spent waiting for rate limit tokens in milliseconds',
  labelNames: ['limiter'] as const,
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [registry],
});

export const wsConnections = new Gauge({
  name: 'ws_connections',
  help: 'Current number of WebSocket connections',
  labelNames: ['platform', 'state'] as const,
  registers: [registry],
});

export const wsMessages = new Counter({
  name: 'ws_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['platform', 'direction', 'type'] as const,
  registers: [registry],
});

export const wsReconnections = new Counter({
  name: 'ws_reconnections_total',
  help: 'Total number of WebSocket reconnections',
  labelNames: ['platform'] as const,
  registers: [registry],
});

// ============================================
// Market Matching Metrics
// ============================================

export const marketMatchAttempts = new Counter({
  name: 'market_match_attempts_total',
  help: 'Total number of market match attempts',
  registers: [registry],
});

export const marketMatchSuccess = new Counter({
  name: 'market_match_success_total',
  help: 'Total number of successful market matches',
  registers: [registry],
});

export const marketMatchConfidence = new Histogram({
  name: 'market_match_confidence',
  help: 'Confidence score of market matches',
  buckets: [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99],
  registers: [registry],
});

export const activePairs = new Gauge({
  name: 'market_active_pairs',
  help: 'Number of active market pairs',
  registers: [registry],
});

// ============================================
// System Metrics
// ============================================

export const paperTradingBalance = new Gauge({
  name: 'paper_trading_balance_usd',
  help: 'Paper trading balance in USD',
  labelNames: ['platform'] as const,
  registers: [registry],
});

export const priceUpdates = new Counter({
  name: 'price_updates_total',
  help: 'Total number of price updates received',
  labelNames: ['platform'] as const,
  registers: [registry],
});

// ============================================
// Copy Trading Metrics
// ============================================

export const copyTradingTradesDetected = new Counter({
  name: 'copy_trading_trades_detected_total',
  help: 'Total trades detected from tracked traders',
  labelNames: ['trader_address', 'side'] as const,
  registers: [registry],
});

export const copyTradingTradesCopied = new Counter({
  name: 'copy_trading_trades_copied_total',
  help: 'Total trades successfully copied',
  labelNames: ['trader_address', 'sizing_strategy', 'side'] as const,
  registers: [registry],
});

export const copyTradingTradesSkipped = new Counter({
  name: 'copy_trading_trades_skipped_total',
  help: 'Total trades skipped (not copied)',
  labelNames: ['trader_address', 'reason'] as const,
  registers: [registry],
});

export const copyTradingTradesFailed = new Counter({
  name: 'copy_trading_trades_failed_total',
  help: 'Total copy trade failures',
  labelNames: ['trader_address', 'error_type'] as const,
  registers: [registry],
});

export const copyTradingAggregations = new Counter({
  name: 'copy_trading_aggregations_total',
  help: 'Total trade aggregations executed',
  labelNames: ['trader_address'] as const,
  registers: [registry],
});

export const copyTradingAggregationsExpired = new Counter({
  name: 'copy_trading_aggregations_expired_total',
  help: 'Total trade aggregations that expired without execution',
  labelNames: ['trader_address'] as const,
  registers: [registry],
});

export const copyTradingOpenPositions = new Gauge({
  name: 'copy_trading_open_positions',
  help: 'Current open positions from copy trading',
  labelNames: ['trader_address'] as const,
  registers: [registry],
});

export const copyTradingPositionValue = new Gauge({
  name: 'copy_trading_position_value_usd',
  help: 'Total position value in USD from copy trading',
  labelNames: ['trader_address'] as const,
  registers: [registry],
});

export const copyTradingRealizedPnl = new Gauge({
  name: 'copy_trading_realized_pnl_usd',
  help: 'Realized P&L from copy trading in USD',
  labelNames: ['trader_address'] as const,
  registers: [registry],
});

export const copyTradingUnrealizedPnl = new Gauge({
  name: 'copy_trading_unrealized_pnl_usd',
  help: 'Unrealized P&L from copy trading in USD',
  labelNames: ['trader_address'] as const,
  registers: [registry],
});

export const copyTradingTotalPnl = new Gauge({
  name: 'copy_trading_total_pnl_usd',
  help: 'Total P&L from copy trading in USD',
  registers: [registry],
});

export const copyTradingExposure = new Gauge({
  name: 'copy_trading_exposure_usd',
  help: 'Total copy trading exposure in USD',
  labelNames: ['trader_address'] as const,
  registers: [registry],
});

export const copyTradingTotalExposure = new Gauge({
  name: 'copy_trading_total_exposure_usd',
  help: 'Total copy trading exposure across all traders in USD',
  registers: [registry],
});

export const copyTradingDetectionLatency = new Histogram({
  name: 'copy_trading_detection_latency_ms',
  help: 'Time to detect new trades from tracked traders',
  labelNames: ['trader_address'] as const,
  buckets: [100, 250, 500, 1000, 2500, 5000, 10000, 30000],
  registers: [registry],
});

export const copyTradingCopyLatency = new Histogram({
  name: 'copy_trading_copy_latency_ms',
  help: 'Time between detecting trade and executing copy',
  labelNames: ['trader_address'] as const,
  buckets: [100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [registry],
});

export const copyTradingSlippage = new Histogram({
  name: 'copy_trading_slippage_percent',
  help: 'Slippage between expected and actual copy price',
  labelNames: ['trader_address'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2, 3, 5, 10],
  registers: [registry],
});

export const copyTradingTrackedTraders = new Gauge({
  name: 'copy_trading_tracked_traders',
  help: 'Number of traders being tracked',
  registers: [registry],
});

export const copyTradingActiveTraders = new Gauge({
  name: 'copy_trading_active_traders',
  help: 'Number of traders actively being copied',
  registers: [registry],
});

export const copyTradingPendingAggregations = new Gauge({
  name: 'copy_trading_pending_aggregations',
  help: 'Number of pending trade aggregations',
  registers: [registry],
});

// ============================================
// Trader Discovery Metrics
// ============================================

export const traderDiscoveryScans = new Counter({
  name: 'trader_discovery_scans_total',
  help: 'Total trader discovery scans performed',
  registers: [registry],
});

export const traderDiscoveryTradersAnalyzed = new Counter({
  name: 'trader_discovery_traders_analyzed_total',
  help: 'Total traders analyzed',
  registers: [registry],
});

export const traderDiscoveryTradersFound = new Gauge({
  name: 'trader_discovery_traders_found',
  help: 'Number of qualified traders found in last scan',
  registers: [registry],
});

export const traderDiscoveryCacheSize = new Gauge({
  name: 'trader_discovery_cache_size',
  help: 'Number of traders in cache',
  registers: [registry],
});

export const traderDiscoveryCacheHits = new Counter({
  name: 'trader_discovery_cache_hits_total',
  help: 'Cache hits for trader data',
  registers: [registry],
});

export const traderDiscoveryCacheMisses = new Counter({
  name: 'trader_discovery_cache_misses_total',
  help: 'Cache misses for trader data',
  registers: [registry],
});

export const traderDiscoverySimulations = new Counter({
  name: 'trader_discovery_simulations_total',
  help: 'Total copy trading simulations run',
  registers: [registry],
});

export const traderDiscoverySimulationDuration = new Histogram({
  name: 'trader_discovery_simulation_duration_ms',
  help: 'Time to run a simulation',
  buckets: [100, 500, 1000, 2500, 5000, 10000, 30000, 60000],
  registers: [registry],
});

export const traderDiscoveryApiCalls = new Counter({
  name: 'trader_discovery_api_calls_total',
  help: 'Total API calls to Polymarket data API',
  labelNames: ['endpoint'] as const,
  registers: [registry],
});

export const traderDiscoveryApiLatency = new Histogram({
  name: 'trader_discovery_api_latency_ms',
  help: 'Polymarket data API latency',
  labelNames: ['endpoint'] as const,
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [registry],
});

// ============================================
// Health Monitoring Metrics
// ============================================

export const healthCheckStatus = new Gauge({
  name: 'health_check_status',
  help: 'Health check status (1=healthy, 0=unhealthy)',
  labelNames: ['component'] as const,
  registers: [registry],
});

export const healthCheckLatency = new Histogram({
  name: 'health_check_latency_ms',
  help: 'Health check latency in milliseconds',
  labelNames: ['component'] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [registry],
});

export const healthCheckFailures = new Counter({
  name: 'health_check_failures_total',
  help: 'Total health check failures',
  labelNames: ['component', 'reason'] as const,
  registers: [registry],
});

export const healthOverallStatus = new Gauge({
  name: 'health_overall_status',
  help: 'Overall system health (1=healthy, 0=unhealthy)',
  registers: [registry],
});

export const accountBalance = new Gauge({
  name: 'account_balance_usd',
  help: 'Account balance in USD',
  labelNames: ['platform', 'type'] as const, // type: 'available' | 'total'
  registers: [registry],
});

// ============================================
// Utility Functions
// ============================================

/**
 * Get the metrics registry
 */
export function getRegistry(): Registry {
  return registry;
}

/**
 * Get all metrics as string for Prometheus scraping
 */
export async function getMetrics(): Promise<string> {
  return registry.metrics();
}

/**
 * Get content type for metrics response
 */
export function getContentType(): string {
  return registry.contentType;
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  registry.resetMetrics();
}

/**
 * Timer utility for measuring duration
 */
export function startTimer(): () => number {
  const start = process.hrtime.bigint();
  return () => {
    const end = process.hrtime.bigint();
    return Number(end - start) / 1_000_000; // Convert to milliseconds
  };
}

/**
 * Helper to observe API latency
 */
export function observeApiLatency(platform: string, endpoint: string, durationMs: number): void {
  apiLatency.labels(platform, endpoint).observe(durationMs);
}

/**
 * Helper to record API request
 */
export function recordApiRequest(platform: string, endpoint: string, status: 'success' | 'error'): void {
  apiRequests.labels(platform, endpoint, status).inc();
}

/**
 * Helper to record trade
 */
export function recordTrade(platform: string, side: string, strategy: string, volumeUsd: number): void {
  tradesExecuted.labels(platform, side, strategy).inc();
  tradeVolume.labels(platform, side).inc(volumeUsd);
}

/**
 * Helper to record copy trade detection
 */
export function recordCopyTradeDetected(traderAddress: string, side: string): void {
  copyTradingTradesDetected.labels(traderAddress, side).inc();
}

/**
 * Helper to record successful copy trade
 */
export function recordCopyTradeSuccess(traderAddress: string, sizingStrategy: string, side: string): void {
  copyTradingTradesCopied.labels(traderAddress, sizingStrategy, side).inc();
}

/**
 * Helper to record skipped copy trade
 */
export function recordCopyTradeSkipped(traderAddress: string, reason: string): void {
  copyTradingTradesSkipped.labels(traderAddress, reason).inc();
}

/**
 * Helper to record failed copy trade
 */
export function recordCopyTradeFailed(traderAddress: string, errorType: string): void {
  copyTradingTradesFailed.labels(traderAddress, errorType).inc();
}

/**
 * Helper to update copy trading P&L metrics
 */
export function updateCopyTradingPnl(traderAddress: string, realized: number, unrealized: number): void {
  copyTradingRealizedPnl.labels(traderAddress).set(realized);
  copyTradingUnrealizedPnl.labels(traderAddress).set(unrealized);
}

/**
 * Helper to record copy trading latency
 */
export function recordCopyLatency(traderAddress: string, detectionMs: number, copyMs: number): void {
  copyTradingDetectionLatency.labels(traderAddress).observe(detectionMs);
  copyTradingCopyLatency.labels(traderAddress).observe(copyMs);
}

/**
 * Helper to record trader discovery API call
 */
export function recordDiscoveryApiCall(endpoint: string, latencyMs: number): void {
  traderDiscoveryApiCalls.labels(endpoint).inc();
  traderDiscoveryApiLatency.labels(endpoint).observe(latencyMs);
}

/**
 * Helper to update health check status
 */
export function updateHealthStatus(component: string, healthy: boolean, latencyMs?: number): void {
  healthCheckStatus.labels(component).set(healthy ? 1 : 0);
  if (latencyMs !== undefined) {
    healthCheckLatency.labels(component).observe(latencyMs);
  }
  if (!healthy) {
    healthCheckFailures.labels(component, 'check_failed').inc();
  }
}
