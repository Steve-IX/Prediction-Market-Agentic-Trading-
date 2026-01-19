import type {
  Platform,
  OrderType,
  OrderSide,
  OrderStatus,
  Outcome,
  MarketStatus,
  WebSocketState,
} from '../../config/constants.js';

// ============================================
// Market Types
// ============================================

/**
 * Normalized market representation across platforms
 */
export interface NormalizedMarket {
  /** Unique identifier: platform:externalId */
  id: string;
  /** Platform this market belongs to */
  platform: Platform;
  /** External ID on the platform */
  externalId: string;
  /** Market title/question */
  title: string;
  /** Detailed description */
  description: string;
  /** Category or tags */
  category: string;
  /** Resolution/expiry date */
  endDate: Date;
  /** Market outcomes (YES/NO for binary) */
  outcomes: NormalizedOutcome[];
  /** 24-hour trading volume in USD */
  volume24h: number;
  /** Current liquidity in USD */
  liquidity: number;
  /** Whether the market is active for trading */
  isActive: boolean;
  /** Current market status */
  status: MarketStatus;
  /** Original platform-specific data */
  raw: unknown;
}

/**
 * Normalized outcome representation
 */
export interface NormalizedOutcome {
  /** Unique identifier: platform:marketId:outcomeId */
  id: string;
  /** External ID on the platform */
  externalId: string;
  /** Outcome name (e.g., "Yes", "No") */
  name: string;
  /** Outcome type */
  type: Outcome;
  /** Current probability (0-1) */
  probability: number;
  /** Best bid price (0-1) */
  bestBid: number;
  /** Best ask price (0-1) */
  bestAsk: number;
  /** Bid size in contracts/shares */
  bidSize: number;
  /** Ask size in contracts/shares */
  askSize: number;
}

/**
 * Filter options for market queries
 */
export interface MarketFilter {
  /** Filter by category */
  category?: string;
  /** Filter by status */
  status?: MarketStatus;
  /** Only active markets */
  activeOnly?: boolean;
  /** Search query */
  query?: string;
  /** Maximum number of results */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
  /** Minimum volume */
  minVolume?: number;
  /** Minimum liquidity */
  minLiquidity?: number;
}

// ============================================
// Order Types
// ============================================

/**
 * Order request for placing new orders
 */
export interface OrderRequest {
  /** Platform to place order on */
  platform: Platform;
  /** Market ID */
  marketId: string;
  /** Outcome ID */
  outcomeId: string;
  /** Buy or sell */
  side: OrderSide;
  /** Price (0-1 normalized) */
  price: number;
  /** Size in USD */
  size: number;
  /** Order type */
  type: OrderType;
  /** Expiry time for GTD orders */
  expiresAt?: Date;
  /** Strategy that placed this order */
  strategyId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Normalized order representation
 */
export interface NormalizedOrder {
  /** Unique order ID */
  id: string;
  /** Platform this order belongs to */
  platform: Platform;
  /** External order ID on the platform */
  externalOrderId?: string;
  /** Market ID */
  marketId: string;
  /** Outcome ID */
  outcomeId: string;
  /** Buy or sell */
  side: OrderSide;
  /** Order price (0-1 normalized) */
  price: number;
  /** Original size in USD */
  size: number;
  /** Filled size in USD */
  filledSize: number;
  /** Average fill price */
  avgFillPrice: number;
  /** Order type */
  type: OrderType;
  /** Current status */
  status: OrderStatus;
  /** Strategy that placed this order */
  strategyId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

// ============================================
// Order Book Types
// ============================================

/**
 * Single level in order book
 */
export interface OrderBookLevel {
  /** Price (0-1 normalized) */
  price: number;
  /** Size at this level */
  size: number;
}

/**
 * Full order book
 */
export interface OrderBook {
  /** Market ID */
  marketId: string;
  /** Outcome ID */
  outcomeId: string;
  /** Bid levels (sorted best to worst) */
  bids: OrderBookLevel[];
  /** Ask levels (sorted best to worst) */
  asks: OrderBookLevel[];
  /** YES outcome order book (for binary markets) */
  yes?: {
    bestBid: number;
    bestAsk: number;
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
  };
  /** NO outcome order book (for binary markets) */
  no?: {
    bestBid: number;
    bestAsk: number;
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
  };
  /** Timestamp of this snapshot */
  timestamp: Date;
}

// ============================================
// Account Types
// ============================================

/**
 * Account balance information
 */
export interface AccountBalance {
  /** Available balance for trading */
  available: number;
  /** Balance locked in open orders */
  locked: number;
  /** Total balance */
  total: number;
  /** Currency (USD for both platforms) */
  currency: string;
}

/**
 * Position in a market
 */
export interface Position {
  /** Position ID */
  id: string;
  /** Platform */
  platform: Platform;
  /** Market ID */
  marketId: string;
  /** Outcome ID */
  outcomeId: string;
  /** Outcome name */
  outcomeName: string;
  /** Position side (long/short) */
  side: 'long' | 'short';
  /** Position size (positive for long, negative for short) */
  size: number;
  /** Average entry price */
  avgEntryPrice: number;
  /** Current price */
  currentPrice: number;
  /** Unrealized P&L */
  unrealizedPnl: number;
  /** Realized P&L */
  realizedPnl: number;
  /** Whether position is open */
  isOpen: boolean;
  /** Strategy that opened this position */
  strategyId?: string;
  /** When position was opened */
  openedAt?: Date;
  /** When position was closed */
  closedAt?: Date;
}

// ============================================
// Trade Types
// ============================================

/**
 * Executed trade
 */
export interface Trade {
  /** Trade ID */
  id: string;
  /** Platform */
  platform: Platform;
  /** Order ID */
  orderId: string;
  /** Market ID */
  marketId: string;
  /** Outcome ID */
  outcomeId: string;
  /** Trade side */
  side: OrderSide;
  /** Execution price */
  price: number;
  /** Trade size */
  size: number;
  /** Fee paid */
  fee: number;
  /** Realized P&L from this trade */
  realizedPnl?: number;
  /** Strategy that placed the order */
  strategyId?: string;
  /** Execution timestamp */
  executedAt: Date;
}

// ============================================
// Platform Client Interface
// ============================================

/**
 * Unified platform client interface
 * Both Polymarket and Kalshi clients implement this interface
 */
export interface IPlatformClient {
  /** Platform identifier */
  readonly platform: Platform;

  // Connection Management
  /** Connect and authenticate with the platform */
  connect(): Promise<void>;
  /** Disconnect from the platform */
  disconnect(): Promise<void>;
  /** Check if connected */
  isConnected(): boolean;

  // Market Data
  /** Get list of markets */
  getMarkets(filter?: MarketFilter): Promise<NormalizedMarket[]>;
  /** Get a single market by ID */
  getMarket(externalId: string): Promise<NormalizedMarket>;
  /** Get order book for a market/outcome */
  getOrderBook(marketId: string, outcomeId: string): Promise<OrderBook>;

  // Trading
  /** Place a new order */
  placeOrder(order: OrderRequest): Promise<NormalizedOrder>;
  /** Cancel an order */
  cancelOrder(orderId: string): Promise<void>;
  /** Cancel all orders (optionally for a specific market) */
  cancelAllOrders(marketId?: string): Promise<void>;
  /** Get open orders */
  getOpenOrders(): Promise<NormalizedOrder[]>;
  /** Get order by ID */
  getOrder(orderId: string): Promise<NormalizedOrder>;

  // Account
  /** Get account balance */
  getBalance(): Promise<AccountBalance>;
  /** Get current positions */
  getPositions(): Promise<Position[]>;
  /** Get position for a specific market */
  getPosition(marketId: string): Promise<Position | null>;

  // Trade History
  /** Get trade history */
  getTrades(limit?: number): Promise<Trade[]>;
}

// ============================================
// WebSocket Types
// ============================================

/**
 * Order book update from WebSocket
 */
export interface OrderBookUpdate {
  marketId: string;
  outcomeId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: Date;
}

/**
 * Trade update from WebSocket
 */
export interface TradeUpdate {
  marketId: string;
  outcomeId: string;
  price: number;
  size: number;
  side: OrderSide;
  timestamp: Date;
}

/**
 * Order status update from WebSocket
 */
export interface OrderUpdate {
  orderId: string;
  status: OrderStatus;
  filledSize: number;
  avgFillPrice: number;
  timestamp: Date;
}

/**
 * WebSocket event handlers
 */
export interface WebSocketEventHandlers {
  onOrderBook?: (update: OrderBookUpdate) => void;
  onTrade?: (update: TradeUpdate) => void;
  onOrder?: (update: OrderUpdate) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onReconnect?: () => void;
}

/**
 * WebSocket client interface
 */
export interface IWebSocketClient {
  /** Current connection state */
  readonly state: WebSocketState;

  /** Connect to WebSocket */
  connect(): Promise<void>;
  /** Disconnect from WebSocket */
  disconnect(): Promise<void>;

  /** Subscribe to a channel */
  subscribe(channel: string, params?: Record<string, unknown>): void;
  /** Unsubscribe from a channel */
  unsubscribe(channel: string): void;

  /** Set event handlers */
  setHandlers(handlers: WebSocketEventHandlers): void;
}

// ============================================
// Market Pair Types (for arbitrage)
// ============================================

/**
 * Mapping between outcomes on different platforms
 */
export interface OutcomeMapping {
  polymarketOutcomeId: string;
  polymarketOutcomeName: string;
  kalshiOutcomeId: string;
  kalshiOutcomeName: string;
}

/**
 * Matched market pair across platforms
 */
export interface MarketPair {
  /** Unique pair ID */
  id: string;
  /** Polymarket market ID */
  polymarketId: string;
  /** Polymarket market title */
  polymarketTitle: string;
  /** Kalshi market ID */
  kalshiId: string;
  /** Kalshi market title */
  kalshiTitle: string;
  /** Match confidence score (0-1) */
  confidence: number;
  /** Outcome mappings */
  outcomeMapping: OutcomeMapping[];
  /** Whether this pair is active for trading */
  isActive: boolean;
  /** When this match was verified */
  verifiedAt: Date;
}

// ============================================
// Arbitrage Types
// ============================================

/**
 * Single leg of an arbitrage trade
 */
export interface ArbitrageLeg {
  platform: Platform;
  marketId: string;
  outcomeId: string;
  side: OrderSide;
  price: number;
  availableSize: number;
}

/**
 * Detected arbitrage opportunity
 */
export interface ArbitrageOpportunity {
  /** Unique opportunity ID */
  id: string;
  /** Type of arbitrage */
  type: 'single_platform' | 'cross_platform';
  /** Market pair (for cross-platform) */
  pair: MarketPair | null;
  /** Markets involved */
  markets: {
    polymarket?: NormalizedMarket;
    kalshi?: NormalizedMarket;
  };
  /** Trade legs */
  legs: ArbitrageLeg[];
  /** Expected profit in USD */
  expectedProfit: number;
  /** Expected profit in basis points */
  expectedProfitBps: number;
  /** Maximum size for this opportunity */
  maxSize: number;
  /** When this opportunity was detected */
  detectedAt: Date;
  /** When this opportunity expires */
  expiresAt: Date;
}

/**
 * Result of a single leg execution
 */
export interface LegExecutionResult {
  leg: ArbitrageLeg;
  orderId: string;
  status: 'filled' | 'partial' | 'failed' | 'cancelled';
  filledSize: number;
  avgPrice: number;
  error?: string;
}

/**
 * Result of arbitrage execution
 */
export interface ArbitrageExecutionResult {
  success: boolean;
  opportunity: ArbitrageOpportunity;
  legs: LegExecutionResult[];
  totalProfit: number;
  executionTimeMs: number;
  error?: string;
}
