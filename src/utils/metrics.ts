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
