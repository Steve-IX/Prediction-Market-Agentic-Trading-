import { EventEmitter } from 'events';
import WebSocket from 'ws';
import * as crypto from 'crypto';
import * as fs from 'fs';
import type { KalshiConfig } from '../../config/schema.js';
import { PLATFORMS, WS_STATES, TIMING, KALSHI_ENDPOINTS } from '../../config/constants.js';
import type { WebSocketState } from '../../config/constants.js';
import type { IWebSocketClient, OrderBookUpdate, TradeUpdate, OrderUpdate, WebSocketEventHandlers, OrderBookLevel } from '../shared/interfaces.js';
import type {
  KalshiWsOrderBookMessage,
  KalshiWsTradeMessage,
  KalshiWsOrderMessage,
  KalshiWsFillMessage,
  KalshiOrderBookLevel,
  KalshiOrder,
} from './types.js';
import { logger, type Logger } from '../../utils/logger.js';
import { wsConnections, wsMessages, wsReconnections } from '../../utils/metrics.js';
import { ORDER_STATUSES } from '../../config/constants.js';

/**
 * Kalshi WebSocket command message
 */
interface KalshiWsCommand {
  id: number;
  cmd: 'subscribe' | 'unsubscribe' | 'update_subscription';
  params: {
    channels?: string[];
    market_tickers?: string[];
  };
}

/**
 * Local order book state for applying deltas
 */
interface LocalOrderBook {
  yes: {
    bids: Map<number, number>;
    asks: Map<number, number>;
  };
  no: {
    bids: Map<number, number>;
    asks: Map<number, number>;
  };
  seq: number;
}

/**
 * Kalshi WebSocket client for real-time market data
 * Connects to wss://trading-api.kalshi.com/trade-api/ws/v2 (prod)
 * or wss://demo-api.kalshi.co/trade-api/ws/v2 (demo)
 */
export class KalshiWebSocket extends EventEmitter implements IWebSocketClient {
  readonly platform = PLATFORMS.KALSHI;

  private config: KalshiConfig;
  private log: Logger;
  private ws: WebSocket | null = null;
  private _state: WebSocketState = WS_STATES.DISCONNECTED;
  private privateKey: crypto.KeyObject | null = null;
  private subscriptions: Map<string, Set<string>> = new Map(); // channel -> market_tickers
  private orderBooks: Map<string, LocalOrderBook> = new Map(); // market_ticker -> local order book
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private pingInterval: NodeJS.Timeout | null = null;
  private handlers: WebSocketEventHandlers = {};
  private shouldReconnect = true;
  private commandId = 1;
  private wsHost: string;

  constructor(config: KalshiConfig) {
    super();
    this.config = config;
    this.log = logger('KalshiWebSocket');
    this.wsHost = config.environment === 'prod' ? KALSHI_ENDPOINTS.WS_PROD : KALSHI_ENDPOINTS.WS_DEMO;
  }

  get state(): WebSocketState {
    return this._state;
  }

  private setState(newState: WebSocketState): void {
    const oldState = this._state;
    this._state = newState;

    // Update metrics
    if (oldState !== WS_STATES.DISCONNECTED) {
      wsConnections.labels(this.platform, oldState).dec();
    }
    if (newState !== WS_STATES.DISCONNECTED) {
      wsConnections.labels(this.platform, newState).inc();
    }

    this.log.debug('State changed', { from: oldState, to: newState });
  }

  /**
   * Connect to Kalshi WebSocket with authentication
   */
  async connect(): Promise<void> {
    if (this._state === WS_STATES.CONNECTED || this._state === WS_STATES.CONNECTING) {
      this.log.warn('Already connected or connecting');
      return;
    }

    // Load private key
    await this.loadPrivateKey();

    this.shouldReconnect = true;
    this.setState(WS_STATES.CONNECTING);

    return new Promise((resolve, reject) => {
      try {
        // Create authentication headers for WebSocket
        const authHeaders = this.createAuthHeaders();

        this.log.info('Connecting to WebSocket', { url: this.wsHost });

        this.ws = new WebSocket(this.wsHost, {
          headers: authHeaders,
        });

        this.ws.on('open', () => {
          this.log.info('WebSocket connected');
          this.setState(WS_STATES.AUTHENTICATED);
          this.reconnectAttempts = 0;
          this.startHeartbeat();

          // Resubscribe to previous subscriptions
          this.resubscribe();

          this.handlers.onConnect?.();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.log.warn('WebSocket closed', { code, reason: reason.toString() });
          this.cleanup();
          this.handlers.onDisconnect?.();
          this.emit('disconnected', { code, reason: reason.toString() });

          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (error: Error) => {
          this.log.error('WebSocket error', { error: error.message });
          this.handlers.onError?.(error);
          this.emit('error', error);

          // Reject if we're still connecting
          if (this._state === WS_STATES.CONNECTING) {
            reject(error);
          }
        });

        this.ws.on('pong', () => {
          // Keep-alive acknowledged
        });

      } catch (error) {
        this.log.error('Failed to create WebSocket', { error });
        this.setState(WS_STATES.DISCONNECTED);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    this.cleanup();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState(WS_STATES.DISCONNECTED);
    this.orderBooks.clear();
    this.log.info('Disconnected from WebSocket');
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string, params?: Record<string, unknown>): void {
    const marketTickers = params?.['market_tickers'] as string[] | undefined;

    // Track subscription
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    if (marketTickers) {
      const channelSubs = this.subscriptions.get(channel)!;
      marketTickers.forEach(ticker => channelSubs.add(ticker));
    }

    // Send subscription if connected
    if ((this._state === WS_STATES.CONNECTED || this._state === WS_STATES.AUTHENTICATED) && this.ws) {
      const command: KalshiWsCommand = {
        id: this.commandId++,
        cmd: 'subscribe',
        params: {
          channels: [channel],
        },
      };

      if (marketTickers && marketTickers.length > 0) {
        command.params.market_tickers = marketTickers;
      }

      this.sendMessage(command);
      this.log.debug('Subscribed to channel', { channel, marketTickers });
    }
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string, marketTickers?: string[]): void {
    // Update tracked subscriptions
    if (marketTickers) {
      const channelSubs = this.subscriptions.get(channel);
      if (channelSubs) {
        marketTickers.forEach(ticker => {
          channelSubs.delete(ticker);
          this.orderBooks.delete(ticker);
        });
        if (channelSubs.size === 0) {
          this.subscriptions.delete(channel);
        }
      }
    } else {
      this.subscriptions.delete(channel);
    }

    // Send unsubscribe if connected
    if ((this._state === WS_STATES.CONNECTED || this._state === WS_STATES.AUTHENTICATED) && this.ws) {
      const command: KalshiWsCommand = {
        id: this.commandId++,
        cmd: 'unsubscribe',
        params: {
          channels: [channel],
        },
      };

      if (marketTickers && marketTickers.length > 0) {
        command.params.market_tickers = marketTickers;
      }

      this.sendMessage(command);
      this.log.debug('Unsubscribed from channel', { channel, marketTickers });
    }
  }

  /**
   * Set event handlers
   */
  setHandlers(handlers: WebSocketEventHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Subscribe to orderbook updates for specific markets
   */
  subscribeOrderBook(marketTickers: string[]): void {
    this.subscribe('orderbook_delta', { market_tickers: marketTickers });
  }

  /**
   * Subscribe to trade updates for specific markets
   */
  subscribeTrades(marketTickers: string[]): void {
    this.subscribe('trade', { market_tickers: marketTickers });
  }

  /**
   * Subscribe to order fill updates (authenticated)
   */
  subscribeFills(): void {
    this.subscribe('fill', {});
  }

  /**
   * Get current subscriptions
   */
  getSubscriptions(): Map<string, Set<string>> {
    return new Map(this.subscriptions);
  }

  // ============================================
  // Private Methods
  // ============================================

  private async loadPrivateKey(): Promise<void> {
    if (this.privateKey) return;

    if (this.config.privateKeyPath) {
      const keyPem = fs.readFileSync(this.config.privateKeyPath, 'utf8');
      this.privateKey = crypto.createPrivateKey(keyPem);
    } else if (this.config.privateKeyPem) {
      this.privateKey = crypto.createPrivateKey(this.config.privateKeyPem);
    }

    if (!this.config.apiKeyId) {
      throw new Error('KALSHI_API_KEY_ID is required for WebSocket connection');
    }

    if (!this.privateKey) {
      throw new Error('Private key is required for WebSocket connection');
    }
  }

  private createAuthHeaders(): Record<string, string> {
    if (!this.privateKey || !this.config.apiKeyId) {
      throw new Error('Authentication not configured');
    }

    // Timestamp in milliseconds
    const timestamp = Date.now().toString();

    // For WebSocket, sign: timestamp + GET + /trade-api/ws/v2
    const message = `${timestamp}GET/trade-api/ws/v2`;

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

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      wsMessages.labels(this.platform, 'inbound', 'message').inc();

      // Route by message type
      if (message.type) {
        this.processMessage(message);
      } else if (message.id !== undefined) {
        // Command response
        this.log.debug('Command response', { id: message.id, ...message });
      }
    } catch (error) {
      this.log.error('Failed to parse WebSocket message', {
        error: error instanceof Error ? error.message : String(error),
        data: data.substring(0, 200),
      });
    }
  }

  private processMessage(message: Record<string, unknown>): void {
    const type = message['type'] as string;

    switch (type) {
      case 'orderbook_snapshot':
        this.handleOrderBookSnapshot(message as unknown as KalshiWsOrderBookMessage);
        break;
      case 'orderbook_delta':
        this.handleOrderBookDelta(message as unknown as KalshiWsOrderBookMessage);
        break;
      case 'trade':
        this.handleTradeUpdate(message as unknown as KalshiWsTradeMessage);
        break;
      case 'order_update':
        this.handleOrderUpdate(message as unknown as KalshiWsOrderMessage);
        break;
      case 'fill':
        this.handleFillUpdate(message as unknown as KalshiWsFillMessage);
        break;
      case 'subscribed':
      case 'unsubscribed':
        this.log.debug('Subscription confirmed', { type, ...message });
        break;
      case 'error':
        this.log.error('WebSocket error message', message);
        break;
      default:
        this.log.debug('Unknown message type', { type });
    }
  }

  private handleOrderBookSnapshot(message: KalshiWsOrderBookMessage): void {
    const ticker = message.msg.market_ticker;

    // Initialize local order book from snapshot
    const localBook: LocalOrderBook = {
      yes: {
        bids: new Map(),
        asks: new Map(),
      },
      no: {
        bids: new Map(),
        asks: new Map(),
      },
      seq: message.msg.seq,
    };

    // Populate from snapshot
    this.populateSide(localBook.yes.bids, message.msg.yes.bids);
    this.populateSide(localBook.yes.asks, message.msg.yes.asks);
    this.populateSide(localBook.no.bids, message.msg.no.bids);
    this.populateSide(localBook.no.asks, message.msg.no.asks);

    this.orderBooks.set(ticker, localBook);

    // Emit update for YES side
    this.emitOrderBookUpdate(ticker, 'YES', localBook);
    wsMessages.labels(this.platform, 'inbound', 'orderbook_snapshot').inc();
  }

  private handleOrderBookDelta(message: KalshiWsOrderBookMessage): void {
    const ticker = message.msg.market_ticker;
    let localBook = this.orderBooks.get(ticker);

    if (!localBook) {
      // Request snapshot if we don't have local state
      this.log.warn('Received delta without snapshot', { ticker });
      localBook = {
        yes: { bids: new Map(), asks: new Map() },
        no: { bids: new Map(), asks: new Map() },
        seq: 0,
      };
      this.orderBooks.set(ticker, localBook);
    }

    // Apply deltas
    this.applyDelta(localBook.yes.bids, message.msg.yes.bids);
    this.applyDelta(localBook.yes.asks, message.msg.yes.asks);
    this.applyDelta(localBook.no.bids, message.msg.no.bids);
    this.applyDelta(localBook.no.asks, message.msg.no.asks);
    localBook.seq = message.msg.seq;

    // Emit update for YES side
    this.emitOrderBookUpdate(ticker, 'YES', localBook);
    wsMessages.labels(this.platform, 'inbound', 'orderbook_delta').inc();
  }

  private populateSide(side: Map<number, number>, levels: KalshiOrderBookLevel[]): void {
    for (const level of levels || []) {
      if (level.count > 0) {
        side.set(level.price, level.count);
      }
    }
  }

  private applyDelta(side: Map<number, number>, levels: KalshiOrderBookLevel[]): void {
    for (const level of levels || []) {
      if (level.count === 0) {
        side.delete(level.price);
      } else {
        side.set(level.price, level.count);
      }
    }
  }

  private emitOrderBookUpdate(ticker: string, outcome: 'YES' | 'NO', localBook: LocalOrderBook): void {
    const side = outcome === 'YES' ? localBook.yes : localBook.no;

    const normalizeLevels = (priceMap: Map<number, number>, ascending: boolean): OrderBookLevel[] => {
      const levels = Array.from(priceMap.entries())
        .map(([price, size]) => ({
          price: price / 100, // Convert from cents to decimal
          size,
        }))
        .sort((a, b) => ascending ? a.price - b.price : b.price - a.price);
      return levels;
    };

    const update: OrderBookUpdate = {
      marketId: ticker,
      outcomeId: `${ticker}-${outcome}`,
      bids: normalizeLevels(side.bids, false), // Highest bid first
      asks: normalizeLevels(side.asks, true),  // Lowest ask first
      timestamp: new Date(),
    };

    this.handlers.onOrderBook?.(update);
    this.emit('orderBook', update);
  }

  private handleTradeUpdate(message: KalshiWsTradeMessage): void {
    const msg = message.msg;
    const isYes = msg.taker_side === 'yes';

    const update: TradeUpdate = {
      marketId: msg.market_ticker,
      outcomeId: `${msg.market_ticker}-${msg.taker_side.toUpperCase()}`,
      price: (isYes ? msg.yes_price : msg.no_price) / 100, // Convert from cents
      size: msg.count,
      side: 'buy', // Taker is always buyer
      timestamp: new Date(msg.ts),
    };

    this.handlers.onTrade?.(update);
    this.emit('trade', update);
    wsMessages.labels(this.platform, 'inbound', 'trade').inc();
  }

  private handleOrderUpdate(message: KalshiWsOrderMessage): void {
    const order = message.msg.order;

    const update: OrderUpdate = {
      orderId: order.order_id,
      status: this.mapOrderStatus(order.status),
      filledSize: order.count - order.remaining_count,
      avgFillPrice: order.avg_fill_price ? order.avg_fill_price / 100 : 0,
      timestamp: new Date(),
    };

    this.handlers.onOrder?.(update);
    this.emit('order', update);
    wsMessages.labels(this.platform, 'inbound', 'order').inc();
  }

  private handleFillUpdate(message: KalshiWsFillMessage): void {
    const fill = message.msg.fill;

    this.emit('fill', {
      tradeId: fill.trade_id,
      orderId: fill.order_id,
      ticker: fill.ticker,
      side: fill.side,
      action: fill.action,
      count: fill.count,
      price: (fill.side === 'yes' ? fill.yes_price : fill.no_price) / 100,
      timestamp: new Date(fill.created_time),
    });
    wsMessages.labels(this.platform, 'inbound', 'fill').inc();
  }

  private mapOrderStatus(status: KalshiOrder['status']): (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES] {
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

  private sendMessage(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(message);
      this.ws.send(data);
      wsMessages.labels(this.platform, 'outbound', 'command').inc();
    } else {
      this.log.warn('Cannot send message - WebSocket not connected');
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
        wsMessages.labels(this.platform, 'outbound', 'ping').inc();
      }
    }, TIMING.WEBSOCKET_HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log.error('Max reconnection attempts reached');
      this.emit('maxReconnectsReached');
      return;
    }

    this.setState(WS_STATES.RECONNECTING);
    wsReconnections.labels(this.platform).inc();

    const delay = this.calculateBackoff();
    this.reconnectAttempts++;

    this.log.info('Scheduling reconnection', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    setTimeout(() => {
      this.connect().catch((error) => {
        this.log.error('Reconnection failed', { error: error.message });
      });
    }, delay);

    this.handlers.onReconnect?.();
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delayMs: delay });
  }

  private calculateBackoff(): number {
    const exponentialDelay =
      TIMING.WEBSOCKET_RECONNECT_INITIAL_MS *
      Math.pow(TIMING.WEBSOCKET_RECONNECT_MULTIPLIER, this.reconnectAttempts);
    const clampedDelay = Math.min(exponentialDelay, TIMING.WEBSOCKET_RECONNECT_MAX_MS);
    const jitterAmount = clampedDelay * TIMING.WEBSOCKET_RECONNECT_JITTER * (Math.random() * 2 - 1);
    return Math.round(clampedDelay + jitterAmount);
  }

  private resubscribe(): void {
    for (const [channel, marketTickers] of this.subscriptions.entries()) {
      if (marketTickers.size > 0) {
        this.subscribe(channel, { market_tickers: Array.from(marketTickers) });
      } else {
        this.subscribe(channel, {});
      }
    }
  }
}
