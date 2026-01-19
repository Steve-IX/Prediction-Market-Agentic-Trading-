// Platform identifiers
export const PLATFORMS = {
  POLYMARKET: 'polymarket',
  KALSHI: 'kalshi',
} as const;

export type Platform = (typeof PLATFORMS)[keyof typeof PLATFORMS];

// Order types
export const ORDER_TYPES = {
  GTC: 'GTC', // Good Till Cancelled
  GTD: 'GTD', // Good Till Date
  FOK: 'FOK', // Fill or Kill
  IOC: 'IOC', // Immediate or Cancel
} as const;

export type OrderType = (typeof ORDER_TYPES)[keyof typeof ORDER_TYPES];

// Order sides
export const ORDER_SIDES = {
  BUY: 'buy',
  SELL: 'sell',
} as const;

export type OrderSide = (typeof ORDER_SIDES)[keyof typeof ORDER_SIDES];

// Order statuses
export const ORDER_STATUSES = {
  PENDING: 'pending',
  OPEN: 'open',
  FILLED: 'filled',
  PARTIAL: 'partial',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
} as const;

export type OrderStatus = (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES];

// Outcome types
export const OUTCOMES = {
  YES: 'yes',
  NO: 'no',
} as const;

export type Outcome = (typeof OUTCOMES)[keyof typeof OUTCOMES];

// Market statuses
export const MARKET_STATUSES = {
  ACTIVE: 'active',
  CLOSED: 'closed',
  RESOLVED: 'resolved',
  SUSPENDED: 'suspended',
} as const;

export type MarketStatus = (typeof MARKET_STATUSES)[keyof typeof MARKET_STATUSES];

// Arbitrage types
export const ARBITRAGE_TYPES = {
  SINGLE_PLATFORM: 'single_platform',
  CROSS_PLATFORM: 'cross_platform',
} as const;

export type ArbitrageType = (typeof ARBITRAGE_TYPES)[keyof typeof ARBITRAGE_TYPES];

// Kill switch triggers
export const KILL_SWITCH_TRIGGERS = {
  MANUAL: 'manual',
  DAILY_LOSS_LIMIT: 'daily_loss_limit',
  DRAWDOWN_LIMIT: 'drawdown_limit',
  POSITION_LIMIT: 'position_limit',
  API_ERROR_RATE: 'api_error_rate',
  SYSTEM_ERROR: 'system_error',
} as const;

export type KillSwitchTrigger = (typeof KILL_SWITCH_TRIGGERS)[keyof typeof KILL_SWITCH_TRIGGERS];

// WebSocket states
export const WS_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  RECONNECTING: 'reconnecting',
} as const;

export type WebSocketState = (typeof WS_STATES)[keyof typeof WS_STATES];

// Rate limits
export const RATE_LIMITS = {
  POLYMARKET: {
    ORDERS_PER_SECOND_BURST: 500,
    ORDERS_PER_SECOND_SUSTAINED: 60,
  },
  KALSHI: {
    BASIC: { READ: 20, WRITE: 10 },
    ADVANCED: { READ: 30, WRITE: 30 },
    PREMIER: { READ: 100, WRITE: 100 },
    PRIME: { READ: 400, WRITE: 400 },
  },
} as const;

// API endpoints
export const POLYMARKET_ENDPOINTS = {
  CLOB: 'https://clob.polymarket.com',
  GAMMA: 'https://gamma-api.polymarket.com',
  WS: 'wss://ws-subscriptions-clob.polymarket.com',
} as const;

export const KALSHI_ENDPOINTS = {
  DEMO: 'https://demo-api.kalshi.co/trade-api/v2',
  PROD: 'https://api.elections.kalshi.com/trade-api/v2',
  WS_DEMO: 'wss://demo-api.kalshi.co/trade-api/ws/v2',
  WS_PROD: 'wss://api.elections.kalshi.com/trade-api/ws/v2',
} as const;

// Timing constants
export const TIMING = {
  WEBSOCKET_HEARTBEAT_MS: 30000,
  WEBSOCKET_PONG_TIMEOUT_MS: 10000,
  WEBSOCKET_RECONNECT_INITIAL_MS: 1000,
  WEBSOCKET_RECONNECT_MAX_MS: 30000,
  WEBSOCKET_RECONNECT_MULTIPLIER: 2,
  WEBSOCKET_RECONNECT_JITTER: 0.1,
  ARBITRAGE_OPPORTUNITY_TTL_MS: 5000,
  EXECUTION_TIMEOUT_MS: 5000,
  PRICE_CACHE_TTL_MS: 1000,
} as const;

// Financial constants
export const FINANCIAL = {
  // Fees are expressed as decimals (0.01 = 1%)
  POLYMARKET_MAKER_FEE: 0,
  POLYMARKET_TAKER_FEE: 0,
  KALSHI_MAKER_FEE: 0,
  KALSHI_TAKER_FEE: 0.01,
  // Price bounds
  MIN_PRICE: 0.01,
  MAX_PRICE: 0.99,
  // Basis points conversion
  BPS_DIVISOR: 10000,
} as const;

// Semantic matching thresholds
export const MATCHING = {
  MIN_CONFIDENCE_THRESHOLD: 0.8,
  MAX_DATE_DIFF_DAYS: 7,
  VECTOR_SEARCH_TOP_K: 10,
} as const;

// Paper trading defaults
export const PAPER_TRADING = {
  DEFAULT_BALANCE: 10000,
  SLIPPAGE_BASE_BPS: 5,
  SLIPPAGE_SIZE_IMPACT_FACTOR: 0.001,
  SLIPPAGE_VOLATILITY_MULTIPLIER: 1.5,
  FILL_PROBABILITY: 0.95,
  PARTIAL_FILL_PROBABILITY: 0.1,
  LATENCY_MIN_MS: 50,
  LATENCY_MAX_MS: 500,
} as const;
