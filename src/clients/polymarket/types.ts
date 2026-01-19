/**
 * Polymarket-specific types
 * These represent the raw data structures from the Polymarket API
 */

// ============================================
// Gamma API Types (Market Discovery)
// ============================================

export interface GammaEvent {
  id: string;
  ticker: string;
  slug: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  restricted: boolean;
  liquidity: string;
  volume: string;
  volume24hr: string;
  openInterest: string;
  markets: GammaMarket[];
  tags: GammaTag[];
  commentCount: number;
}

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  liquidity: string;
  volume: string;
  volume24hr: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  acceptingOrders: boolean;
  acceptingOrdersTimestamp: string;
  // The API returns tokens as separate JSON strings, not as an array
  tokens?: GammaToken[]; // Optional - some responses may have this
  clobTokenIds?: string; // JSON string array of token IDs
  outcomes?: string; // JSON string array like '["Yes", "No"]'
  outcomePrices?: string; // JSON string array like '["0.5", "0.5"]'
  rewards?: GammaRewards;
  negRisk: boolean;
  negRiskMarketId?: string;
  negRiskRequestId?: string;
  icon?: string;
  image?: string;
}

export interface GammaToken {
  tokenId: string;
  outcome: string;
  price: string;
  winner: boolean;
}

export interface GammaTag {
  id: string;
  slug: string;
  label: string;
}

export interface GammaRewards {
  maxSpread: string;
  minSize: string;
  event: string;
}

// ============================================
// CLOB API Types
// ============================================

export interface ClobMarket {
  conditionId: string;
  questionId: string;
  tokens: ClobToken[];
  rewards: ClobRewards;
  minIncentiveSize: string;
  maxIncentiveSpread: string;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  negRisk: boolean;
  minTick: string;
  minAmount: string;
}

export interface ClobToken {
  tokenId: string;
  outcome: string;
  price: string;
}

export interface ClobRewards {
  minSize: string;
  maxSpread: string;
  event: string;
}

export interface ClobOrderBook {
  market: string;
  assetId: string;
  hash: string;
  timestamp: string;
  bids: ClobOrderBookLevel[];
  asks: ClobOrderBookLevel[];
}

export interface ClobOrderBookLevel {
  price: string;
  size: string;
}

export interface ClobOrder {
  id: string;
  status: ClobOrderStatus;
  owner: string;
  market: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  original_size: string;
  size_matched: string;
  price: string;
  type: 'GTC' | 'GTD' | 'FOK' | 'FAK';
  outcome: string;
  created_at: number;
  expiration: string;
  associate_trades: ClobTrade[];
}

export type ClobOrderStatus = 'live' | 'matched' | 'cancelled' | 'delayed';

export interface ClobTrade {
  id: string;
  taker_order_id: string;
  market: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  size: string;
  fee_rate_bps: string;
  price: string;
  status: string;
  match_time: string;
  last_update: string;
  outcome: string;
  bucket_index: number;
  owner: string;
  maker_address: string;
  transaction_hash: string;
  type: string;
  trader_side: string;
}

export interface ClobBalance {
  collateral: string;
  collateralAllowance: string;
  conditional: ClobConditionalBalance[];
  positions: ClobPosition[];
}

export interface ClobConditionalBalance {
  tokenId: string;
  balance: string;
}

export interface ClobPosition {
  asset: string;
  size: string;
  avgPrice: string;
  realizedPnl: string;
  curPrice: string;
}

// ============================================
// API Credentials
// ============================================

export interface ApiCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

// ============================================
// Order Creation Types
// ============================================

export interface CreateOrderParams {
  tokenId: string;
  price: number;
  side: 'BUY' | 'SELL';
  size: number;
}

export interface MarketParams {
  tickSize: string;
  negRisk: boolean;
}

export type OrderTypeParam = 'GTC' | 'GTD' | 'FOK' | 'FAK';

// ============================================
// WebSocket Types
// ============================================

export interface PolymarketWsMessage {
  event_type: string;
  [key: string]: unknown;
}

export interface PolymarketOrderBookWsMessage extends PolymarketWsMessage {
  event_type: 'book';
  asset_id: string;
  market: string;
  bids: ClobOrderBookLevel[];
  asks: ClobOrderBookLevel[];
  timestamp: string;
  hash: string;
}

export interface PolymarketPriceChangeWsMessage extends PolymarketWsMessage {
  event_type: 'price_change';
  asset_id: string;
  market: string;
  price: string;
  timestamp: string;
}

export interface PolymarketTradeWsMessage extends PolymarketWsMessage {
  event_type: 'last_trade_price';
  asset_id: string;
  market: string;
  price: string;
  size: string;
  side: 'BUY' | 'SELL';
  timestamp: string;
}

export interface PolymarketUserOrderWsMessage extends PolymarketWsMessage {
  event_type: 'order';
  order: ClobOrder;
}

// ============================================
// Signature Types
// ============================================

export type SignatureType = 0 | 1 | 2; // 0 = EOA, 1 = PROXY, 2 = GNOSIS
