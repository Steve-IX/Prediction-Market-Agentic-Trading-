import * as crypto from 'crypto';
import * as fs from 'fs';
import type { KalshiConfig } from '../../config/schema.js';
import { PLATFORMS, ORDER_TYPES, ORDER_SIDES, ORDER_STATUSES, OUTCOMES, MARKET_STATUSES, KALSHI_ENDPOINTS } from '../../config/constants.js';
import type {
  IPlatformClient,
  NormalizedMarket,
  NormalizedOutcome,
  NormalizedOrder,
  OrderRequest,
  OrderBook,
  OrderBookLevel,
  AccountBalance,
  Position,
  Trade,
  MarketFilter,
} from '../shared/interfaces.js';
import type {
  KalshiMarket,
  KalshiOrder,
  KalshiOrderRequest,
  KalshiOrderBook,
  KalshiPosition,
  KalshiBalance,
  KalshiFill,
  KalshiMarketsResponse,
  KalshiOrdersResponse,
  KalshiFillsResponse,
  KalshiPositionsResponse,
  KalshiOrderResponse,
  KalshiAuthHeaders,
  KalshiOrderStatus,
} from './types.js';
import { logger, type Logger } from '../../utils/logger.js';
import { retry } from '../../utils/retry.js';
import { startTimer, observeApiLatency, recordApiRequest, apiErrors } from '../../utils/metrics.js';

/**
 * Kalshi client implementation
 * Uses RSA-PSS authentication for API requests
 */
export class KalshiClient implements IPlatformClient {
  readonly platform = PLATFORMS.KALSHI;

  private config: KalshiConfig;
  private log: Logger;
  private privateKey: crypto.KeyObject | null = null;
  private connected = false;
  private baseUrl: string;

  constructor(config: KalshiConfig) {
    this.config = config;
    this.log = logger('KalshiClient');
    this.baseUrl = config.host || (config.environment === 'prod' ? KALSHI_ENDPOINTS.PROD : KALSHI_ENDPOINTS.DEMO);
  }

  /**
   * Connect and authenticate with Kalshi
   */
  async connect(): Promise<void> {
    if (this.connected) {
      this.log.warn('Already connected');
      return;
    }

    const timer = startTimer();

    try {
      // Load private key
      if (this.config.privateKeyPath) {
        const keyPem = fs.readFileSync(this.config.privateKeyPath, 'utf8');
        this.privateKey = crypto.createPrivateKey(keyPem);
      } else if (this.config.privateKeyPem) {
        this.privateKey = crypto.createPrivateKey(this.config.privateKeyPem);
      }

      if (!this.config.apiKeyId) {
        throw new Error('KALSHI_API_KEY_ID is required');
      }

      if (!this.privateKey) {
        throw new Error('Private key is required (KALSHI_PRIVATE_KEY_PATH or KALSHI_PRIVATE_KEY_PEM)');
      }

      // Verify connection by fetching balance
      const balance = await this.getBalance();

      const durationMs = timer();
      observeApiLatency(this.platform, 'connect', durationMs);
      recordApiRequest(this.platform, 'connect', 'success');

      this.connected = true;

      this.log.info('Connected to Kalshi', {
        environment: this.config.environment,
        balance: balance.available,
        durationMs,
      });
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'connect', durationMs);
      recordApiRequest(this.platform, 'connect', 'error');
      apiErrors.labels(this.platform, 'connection').inc();

      this.log.error('Failed to connect', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Disconnect from Kalshi
   */
  async disconnect(): Promise<void> {
    this.privateKey = null;
    this.connected = false;
    this.log.info('Disconnected from Kalshi');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.privateKey !== null;
  }

  /**
   * Get list of markets
   */
  async getMarkets(filter?: MarketFilter): Promise<NormalizedMarket[]> {
    const timer = startTimer();

    try {
      const params = new URLSearchParams();
      params.set('limit', String(filter?.limit ?? 100));

      if (filter?.cursor) {
        params.set('cursor', filter.cursor);
      }

      if (filter?.status) {
        params.set('status', filter.status);
      }

      const response = await this.makeRequest<KalshiMarketsResponse>('GET', `/markets?${params.toString()}`);

      const markets = response.markets.map((market) => this.normalizeMarket(market));

      const durationMs = timer();
      observeApiLatency(this.platform, 'getMarkets', durationMs);
      recordApiRequest(this.platform, 'getMarkets', 'success');

      this.log.debug('Fetched markets', { count: markets.length, durationMs });

      return markets;
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'getMarkets', durationMs);
      recordApiRequest(this.platform, 'getMarkets', 'error');
      apiErrors.labels(this.platform, 'getMarkets').inc();

      this.log.error('Failed to fetch markets', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get a single market by ticker
   */
  async getMarket(externalId: string): Promise<NormalizedMarket> {
    const timer = startTimer();

    try {
      const response = await this.makeRequest<{ market: KalshiMarket }>('GET', `/markets/${externalId}`);

      const durationMs = timer();
      observeApiLatency(this.platform, 'getMarket', durationMs);
      recordApiRequest(this.platform, 'getMarket', 'success');

      return this.normalizeMarket(response.market);
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'getMarket', durationMs);
      recordApiRequest(this.platform, 'getMarket', 'error');

      this.log.error('Failed to fetch market', { externalId, error });
      throw error;
    }
  }

  /**
   * Get order book for a market
   */
  async getOrderBook(marketId: string, outcomeId: string): Promise<OrderBook> {
    const timer = startTimer();

    try {
      const response = await this.makeRequest<KalshiOrderBook>('GET', `/markets/${marketId}/orderbook`);

      const durationMs = timer();
      observeApiLatency(this.platform, 'getOrderBook', durationMs);
      recordApiRequest(this.platform, 'getOrderBook', 'success');

      return this.normalizeOrderBook(marketId, outcomeId, response);
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'getOrderBook', durationMs);
      recordApiRequest(this.platform, 'getOrderBook', 'error');

      this.log.error('Failed to fetch order book', { marketId, outcomeId, error });
      throw error;
    }
  }

  /**
   * Place a new order
   */
  async placeOrder(order: OrderRequest): Promise<NormalizedOrder> {
    this.ensureConnected();
    const timer = startTimer();

    try {
      // Determine if this is for YES or NO outcome
      const isYes = order.outcomeId.endsWith('-YES') || order.outcomeId.toLowerCase().includes('yes');

      // Kalshi prices are in cents (0-100)
      const priceInCents = Math.round(order.price * 100);

      // Calculate contract count from size and price
      const contractCount = Math.floor(order.size / order.price);

      const orderRequest: KalshiOrderRequest = {
        ticker: order.marketId,
        action: order.side,
        side: isYes ? 'yes' : 'no',
        type: 'limit',
        count: contractCount,
        time_in_force: this.mapTimeInForce(order.type),
      };

      // Set price based on side
      if (isYes) {
        orderRequest.yes_price = priceInCents;
      } else {
        orderRequest.no_price = priceInCents;
      }

      if (order.expiresAt) {
        orderRequest.expiration_ts = Math.floor(order.expiresAt.getTime() / 1000);
      }

      const response = await this.makeRequest<KalshiOrderResponse>('POST', '/portfolio/orders', orderRequest);

      const durationMs = timer();
      observeApiLatency(this.platform, 'placeOrder', durationMs);
      recordApiRequest(this.platform, 'placeOrder', 'success');

      this.log.info('Order placed', {
        orderId: response.order.order_id,
        marketId: order.marketId,
        side: order.side,
        price: order.price,
        size: order.size,
        durationMs,
      });

      return this.normalizeOrder(response.order);
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'placeOrder', durationMs);
      recordApiRequest(this.platform, 'placeOrder', 'error');
      apiErrors.labels(this.platform, 'placeOrder').inc();

      this.log.error('Failed to place order', { order, error });
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<void> {
    this.ensureConnected();
    const timer = startTimer();

    try {
      // Extract the actual order ID if it has platform prefix
      const actualOrderId = orderId.startsWith(`${this.platform}:`) ? orderId.split(':')[1] : orderId;

      await this.makeRequest('DELETE', `/portfolio/orders/${actualOrderId}`);

      const durationMs = timer();
      observeApiLatency(this.platform, 'cancelOrder', durationMs);
      recordApiRequest(this.platform, 'cancelOrder', 'success');

      this.log.info('Order cancelled', { orderId, durationMs });
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'cancelOrder', durationMs);
      recordApiRequest(this.platform, 'cancelOrder', 'error');

      this.log.error('Failed to cancel order', { orderId, error });
      throw error;
    }
  }

  /**
   * Cancel all orders
   */
  async cancelAllOrders(marketId?: string): Promise<void> {
    this.ensureConnected();
    const timer = startTimer();

    try {
      const body = marketId ? { ticker: marketId } : undefined;
      await this.makeRequest('DELETE', '/portfolio/orders', body);

      const durationMs = timer();
      observeApiLatency(this.platform, 'cancelAllOrders', durationMs);
      recordApiRequest(this.platform, 'cancelAllOrders', 'success');

      this.log.info('All orders cancelled', { marketId, durationMs });
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'cancelAllOrders', durationMs);
      recordApiRequest(this.platform, 'cancelAllOrders', 'error');

      this.log.error('Failed to cancel all orders', { marketId, error });
      throw error;
    }
  }

  /**
   * Get open orders
   */
  async getOpenOrders(): Promise<NormalizedOrder[]> {
    this.ensureConnected();
    const timer = startTimer();

    try {
      const response = await this.makeRequest<KalshiOrdersResponse>('GET', '/portfolio/orders?status=resting');

      const durationMs = timer();
      observeApiLatency(this.platform, 'getOpenOrders', durationMs);
      recordApiRequest(this.platform, 'getOpenOrders', 'success');

      return response.orders.map((order) => this.normalizeOrder(order));
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'getOpenOrders', durationMs);
      recordApiRequest(this.platform, 'getOpenOrders', 'error');

      this.log.error('Failed to get open orders', { error });
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<NormalizedOrder> {
    this.ensureConnected();
    const timer = startTimer();

    try {
      const actualOrderId = orderId.startsWith(`${this.platform}:`) ? orderId.split(':')[1] : orderId;
      const response = await this.makeRequest<{ order: KalshiOrder }>('GET', `/portfolio/orders/${actualOrderId}`);

      const durationMs = timer();
      observeApiLatency(this.platform, 'getOrder', durationMs);
      recordApiRequest(this.platform, 'getOrder', 'success');

      return this.normalizeOrder(response.order);
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'getOrder', durationMs);
      recordApiRequest(this.platform, 'getOrder', 'error');

      this.log.error('Failed to get order', { orderId, error });
      throw error;
    }
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<AccountBalance> {
    const timer = startTimer();

    try {
      const response = await this.makeRequest<KalshiBalance>('GET', '/portfolio/balance');

      const durationMs = timer();
      observeApiLatency(this.platform, 'getBalance', durationMs);
      recordApiRequest(this.platform, 'getBalance', 'success');

      // Kalshi returns balance in cents
      const available = response.balance / 100;
      const payout = response.payout / 100;

      return {
        available,
        locked: payout, // Payout represents locked value
        total: available + payout,
        currency: 'USD',
      };
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'getBalance', durationMs);
      recordApiRequest(this.platform, 'getBalance', 'error');

      this.log.error('Failed to get balance', { error });
      throw error;
    }
  }

  /**
   * Get current positions
   */
  async getPositions(): Promise<Position[]> {
    this.ensureConnected();
    const timer = startTimer();

    try {
      const response = await this.makeRequest<KalshiPositionsResponse>('GET', '/portfolio/positions');

      const durationMs = timer();
      observeApiLatency(this.platform, 'getPositions', durationMs);
      recordApiRequest(this.platform, 'getPositions', 'success');

      return response.market_positions
        .filter((pos) => pos.position !== 0)
        .map((pos) => this.normalizePosition(pos));
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'getPositions', durationMs);
      recordApiRequest(this.platform, 'getPositions', 'error');

      this.log.error('Failed to get positions', { error });
      throw error;
    }
  }

  /**
   * Get position for a specific market
   */
  async getPosition(marketId: string): Promise<Position | null> {
    const positions = await this.getPositions();
    return positions.find((p) => p.marketId === marketId) ?? null;
  }

  /**
   * Get trade history
   */
  async getTrades(limit = 100): Promise<Trade[]> {
    this.ensureConnected();
    const timer = startTimer();

    try {
      const response = await this.makeRequest<KalshiFillsResponse>('GET', `/portfolio/fills?limit=${limit}`);

      const durationMs = timer();
      observeApiLatency(this.platform, 'getTrades', durationMs);
      recordApiRequest(this.platform, 'getTrades', 'success');

      return response.fills.map((fill) => this.normalizeTrade(fill));
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'getTrades', durationMs);
      recordApiRequest(this.platform, 'getTrades', 'error');

      this.log.error('Failed to get trades', { error });
      throw error;
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private ensureConnected(): void {
    if (!this.connected || !this.privateKey) {
      throw new Error('Client not connected. Call connect() first.');
    }
  }

  /**
   * Create authentication headers for Kalshi API
   * Uses RSA-PSS with SHA256
   */
  private createAuthHeaders(method: string, path: string): KalshiAuthHeaders {
    if (!this.privateKey || !this.config.apiKeyId) {
      throw new Error('Authentication not configured');
    }

    // Timestamp in milliseconds
    const timestamp = Date.now().toString();

    // Remove query parameters from path for signing
    const pathWithoutQuery = path.split('?')[0];

    // Create message to sign: timestamp + method + path
    const message = `${timestamp}${method}${pathWithoutQuery}`;

    // Sign with RSA-PSS using SHA256
    const signature = crypto.sign('sha256', Buffer.from(message), {
      key: this.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });

    return {
      'KALSHI-ACCESS-KEY': this.config.apiKeyId,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature.toString('base64'),
    };
  }

  /**
   * Make an authenticated request to Kalshi API
   */
  private async makeRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const fullPath = `/trade-api/v2${path}`;
    const url = `${this.baseUrl.replace('/trade-api/v2', '')}${fullPath}`;

    const authHeaders = this.createAuthHeaders(method, fullPath);

    const headers: Record<string, string> = {
      ...authHeaders,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await retry(
      async () => {
        const res = await fetch(url, options);

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`Kalshi API error: ${res.status} ${res.statusText} - ${errorBody}`);
        }

        return res.json() as Promise<T>;
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
      }
    );

    return response;
  }

  private mapTimeInForce(type: string): 'gtc' | 'day' | 'ioc' | 'fok' {
    switch (type) {
      case ORDER_TYPES.GTC:
        return 'gtc';
      case ORDER_TYPES.GTD:
        return 'day';
      case ORDER_TYPES.FOK:
        return 'fok';
      case ORDER_TYPES.IOC:
        return 'ioc';
      default:
        return 'gtc';
    }
  }

  private mapOrderStatus(status: KalshiOrderStatus): (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES] {
    switch (status) {
      case 'pending':
        return ORDER_STATUSES.PENDING;
      case 'resting':
        return ORDER_STATUSES.OPEN;
      case 'executed':
        return ORDER_STATUSES.FILLED;
      case 'canceled':
        return ORDER_STATUSES.CANCELLED;
      case 'rejected':
        return ORDER_STATUSES.REJECTED;
      case 'expired':
        return ORDER_STATUSES.CANCELLED;
      default:
        return ORDER_STATUSES.PENDING;
    }
  }

  private normalizeMarket(market: KalshiMarket): NormalizedMarket {
    // Kalshi prices are in cents (0-100), normalize to 0-1
    const yesPrice = market.yes_bid / 100;
    const noPrice = market.no_bid / 100;
    const yesBid = market.yes_bid / 100;
    const yesAsk = market.yes_ask / 100;
    const noBid = market.no_bid / 100;
    const noAsk = market.no_ask / 100;

    const outcomes: NormalizedOutcome[] = [
      {
        id: `${this.platform}:${market.ticker}:YES`,
        externalId: `${market.ticker}-YES`,
        name: market.yes_sub_title || 'Yes',
        type: OUTCOMES.YES,
        probability: yesPrice,
        bestBid: yesBid,
        bestAsk: yesAsk,
        bidSize: 0, // Would need orderbook for this
        askSize: 0,
      },
      {
        id: `${this.platform}:${market.ticker}:NO`,
        externalId: `${market.ticker}-NO`,
        name: market.no_sub_title || 'No',
        type: OUTCOMES.NO,
        probability: noPrice,
        bestBid: noBid,
        bestAsk: noAsk,
        bidSize: 0,
        askSize: 0,
      },
    ];

    let status: (typeof MARKET_STATUSES)[keyof typeof MARKET_STATUSES];
    switch (market.status) {
      case 'open':
        status = MARKET_STATUSES.ACTIVE;
        break;
      case 'closed':
      case 'halted':
        status = MARKET_STATUSES.SUSPENDED;
        break;
      case 'settled':
      case 'archived':
        status = MARKET_STATUSES.RESOLVED;
        break;
      default:
        status = MARKET_STATUSES.ACTIVE;
    }

    return {
      id: `${this.platform}:${market.ticker}`,
      platform: this.platform,
      externalId: market.ticker,
      title: market.title,
      description: market.subtitle || market.title,
      category: market.category || 'Unknown',
      endDate: new Date(market.close_time),
      outcomes,
      volume24h: market.volume_24h,
      liquidity: market.liquidity,
      isActive: market.status === 'open',
      status,
      raw: market,
    };
  }

  private normalizeOrderBook(marketId: string, outcomeId: string, orderBook: KalshiOrderBook): OrderBook {
    // Determine if this is for YES or NO outcome
    const isYes = outcomeId.includes('YES') || outcomeId.toLowerCase().includes('yes');
    const side = isYes ? orderBook.yes : orderBook.no;

    // Kalshi prices are in cents, normalize to 0-1
    const normalizeLevels = (levels: { price: number; count: number }[]): OrderBookLevel[] =>
      levels.map((level) => ({
        price: level.price / 100,
        size: level.count,
      }));

    return {
      marketId,
      outcomeId,
      bids: normalizeLevels(side.bids || []),
      asks: normalizeLevels(side.asks || []),
      timestamp: new Date(),
    };
  }

  private normalizeOrder(order: KalshiOrder): NormalizedOrder {
    const isYes = order.side === 'yes';
    const priceInCents = isYes ? order.yes_price : order.no_price;
    const price = priceInCents / 100;
    const filledCount = order.count - order.remaining_count;
    const avgFillPrice = order.avg_fill_price ? order.avg_fill_price / 100 : price;

    return {
      id: `${this.platform}:${order.order_id}`,
      platform: this.platform,
      externalOrderId: order.order_id,
      marketId: order.ticker,
      outcomeId: `${order.ticker}-${order.side.toUpperCase()}`,
      side: order.action === 'buy' ? ORDER_SIDES.BUY : ORDER_SIDES.SELL,
      price,
      size: order.count * price, // Approximate USD value
      filledSize: filledCount * avgFillPrice,
      avgFillPrice,
      type: order.time_in_force === 'fok' ? ORDER_TYPES.FOK : order.time_in_force === 'ioc' ? ORDER_TYPES.IOC : ORDER_TYPES.GTC,
      status: this.mapOrderStatus(order.status),
      createdAt: new Date(order.created_time),
      updatedAt: new Date(),
    };
  }

  private normalizePosition(position: KalshiPosition): Position {
    const isLong = position.position > 0;
    const size = Math.abs(position.position);

    return {
      id: `${this.platform}:${position.ticker}`,
      platform: this.platform,
      marketId: position.ticker,
      outcomeId: `${position.ticker}-YES`, // Positions are in YES contracts
      outcomeName: 'Yes',
      side: isLong ? 'long' : 'short',
      size: isLong ? size : -size,
      avgEntryPrice: position.total_traded > 0 ? position.exposure / position.total_traded : 0,
      currentPrice: 0, // Would need current market price
      unrealizedPnl: 0, // Would need current market price
      realizedPnl: position.realized_pnl / 100, // Convert from cents
      isOpen: true,
    };
  }

  private normalizeTrade(fill: KalshiFill): Trade {
    const isYes = fill.side === 'yes';
    const price = (isYes ? fill.yes_price : fill.no_price) / 100;

    return {
      id: `${this.platform}:${fill.trade_id}`,
      platform: this.platform,
      orderId: fill.order_id,
      marketId: fill.ticker,
      outcomeId: `${fill.ticker}-${fill.side.toUpperCase()}`,
      side: fill.action === 'buy' ? ORDER_SIDES.BUY : ORDER_SIDES.SELL,
      price,
      size: fill.count * price,
      fee: fill.is_taker ? fill.count * price * 0.01 : 0, // 1% taker fee
      executedAt: new Date(fill.created_time),
    };
  }
}
