/**
 * Kalshi-specific types
 * These represent the raw data structures from the Kalshi API
 */

// ============================================
// Market Types
// ============================================

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle?: string;
  status: KalshiMarketStatus;
  result?: 'yes' | 'no';
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  previous_yes_bid?: number;
  previous_yes_ask?: number;
  previous_price?: number;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  strike_type?: string;
  floor_strike?: number;
  cap_strike?: number;
  close_time: string;
  expiration_time: string;
  expiration_value?: string;
  category?: string;
  risk_limit_cents?: number;
  notional_value?: number;
  tick_size: number;
  yes_sub_title?: string;
  no_sub_title?: string;
  open_time: string;
  response_price_units: 'usd_cent' | 'usd_centi_cent';
  rules_primary?: string;
  rules_secondary?: string;
  settlement_timer_seconds?: number;
  functional_strike?: string;
}

export type KalshiMarketStatus =
  | 'open'
  | 'closed'
  | 'settled'
  | 'halted'
  | 'archived';

export interface KalshiEvent {
  event_ticker: string;
  series_ticker: string;
  sub_title: string;
  title: string;
  mutually_exclusive: boolean;
  category: string;
  markets: KalshiMarket[];
}

// ============================================
// Order Types
// ============================================

export interface KalshiOrder {
  order_id: string;
  user_id?: string;
  ticker: string;
  status: KalshiOrderStatus;
  yes_price: number;
  no_price: number;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  type: 'market' | 'limit';
  count: number;
  remaining_count: number;
  avg_fill_price?: number;
  created_time: string;
  expiration_time?: string;
  place_count?: number;
  decrease_count?: number;
  maker_fill_count?: number;
  taker_fill_count?: number;
  fok_fill_count?: number;
  client_order_id?: string;
  order_group_id?: string;
  queue_position?: number;
  time_in_force?: 'gtc' | 'day' | 'ioc' | 'fok';
}

export type KalshiOrderStatus =
  | 'pending'
  | 'resting'
  | 'executed'
  | 'canceled'
  | 'rejected'
  | 'expired';

export interface KalshiOrderRequest {
  ticker: string;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  type: 'market' | 'limit';
  count: number;
  yes_price?: number;
  no_price?: number;
  expiration_ts?: number;
  client_order_id?: string;
  time_in_force?: 'gtc' | 'day' | 'ioc' | 'fok';
  post_only?: boolean;
  reduce_only?: boolean;
}

export interface KalshiOrderResponse {
  order: KalshiOrder;
}

// ============================================
// Trade Types
// ============================================

export interface KalshiFill {
  trade_id: string;
  order_id: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  yes_price: number;
  no_price: number;
  created_time: string;
  is_taker: boolean;
}

// ============================================
// Position Types
// ============================================

export interface KalshiPosition {
  ticker: string;
  event_ticker: string;
  event_exposure: number;
  exposure: number;
  market_exposure: number;
  position: number;
  total_traded: number;
  realized_pnl: number;
  resting_orders_count: number;
  fees_paid: number;
  settlement_fee?: number;
}

// ============================================
// Account Types
// ============================================

export interface KalshiBalance {
  balance: number;
  payout: number;
  bonus?: number;
  accessible_payout?: number;
  total_deposits?: number;
  total_withdrawals?: number;
}

// ============================================
// OrderBook Types
// ============================================

export interface KalshiOrderBook {
  ticker: string;
  yes: KalshiOrderBookSide;
  no: KalshiOrderBookSide;
}

export interface KalshiOrderBookSide {
  bids: KalshiOrderBookLevel[];
  asks: KalshiOrderBookLevel[];
}

export interface KalshiOrderBookLevel {
  price: number;
  count: number;
}

// ============================================
// API Response Types
// ============================================

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

export interface KalshiEventsResponse {
  events: KalshiEvent[];
  cursor?: string;
}

export interface KalshiOrdersResponse {
  orders: KalshiOrder[];
  cursor?: string;
}

export interface KalshiFillsResponse {
  fills: KalshiFill[];
  cursor?: string;
}

export interface KalshiPositionsResponse {
  market_positions: KalshiPosition[];
  event_positions: KalshiEventPosition[];
  cursor?: string;
}

export interface KalshiEventPosition {
  event_ticker: string;
  event_exposure: number;
  realized_pnl: number;
  total_cost: number;
  fees_paid: number;
}

// ============================================
// WebSocket Types
// ============================================

export interface KalshiWsMessage {
  type: string;
  [key: string]: unknown;
}

export interface KalshiWsSubscribeMessage {
  type: 'subscribe';
  channels: string[];
  market_tickers?: string[];
  event_tickers?: string[];
}

export interface KalshiWsOrderBookMessage extends KalshiWsMessage {
  type: 'orderbook_snapshot' | 'orderbook_delta';
  msg: {
    market_ticker: string;
    yes: KalshiOrderBookSide;
    no: KalshiOrderBookSide;
    seq: number;
  };
}

export interface KalshiWsTradeMessage extends KalshiWsMessage {
  type: 'trade';
  msg: {
    market_ticker: string;
    yes_price: number;
    no_price: number;
    count: number;
    taker_side: 'yes' | 'no';
    ts: number;
  };
}

export interface KalshiWsOrderMessage extends KalshiWsMessage {
  type: 'order_update';
  msg: {
    order: KalshiOrder;
  };
}

export interface KalshiWsFillMessage extends KalshiWsMessage {
  type: 'fill';
  msg: {
    fill: KalshiFill;
  };
}

// ============================================
// Authentication Types
// ============================================

export interface KalshiAuthHeaders {
  'KALSHI-ACCESS-KEY': string;
  'KALSHI-ACCESS-TIMESTAMP': string;
  'KALSHI-ACCESS-SIGNATURE': string;
}
