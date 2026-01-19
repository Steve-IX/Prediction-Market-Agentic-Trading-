import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { PolymarketConfig } from '../../config/schema.js';
import { PLATFORMS, WS_STATES, TIMING, POLYMARKET_ENDPOINTS } from '../../config/constants.js';
import type { WebSocketState } from '../../config/constants.js';
import type { IWebSocketClient, OrderBookUpdate, TradeUpdate, WebSocketEventHandlers, OrderBookLevel } from '../shared/interfaces.js';
import type {
  PolymarketOrderBookWsMessage,
  PolymarketTradeWsMessage,
  PolymarketWsMessage,
  ClobOrderBookLevel,
} from './types.js';
import { logger, type Logger } from '../../utils/logger.js';
import { wsConnections, wsMessages, wsReconnections } from '../../utils/metrics.js';

/**
 * WebSocket subscription request
 */
interface SubscribeMessage {
  type: 'subscribe';
  channel: 'book' | 'price_change' | 'last_trade_price' | 'user';
  assets_ids?: string[];
  market?: string;
}

/**
 * WebSocket unsubscribe request
 */
interface UnsubscribeMessage {
  type: 'unsubscribe';
  channel: string;
  assets_ids?: string[];
}

/**
 * Polymarket WebSocket client for real-time market data
 * Connects to wss://ws-subscriptions-clob.polymarket.com/ws/
 */
export class PolymarketWebSocket extends EventEmitter implements IWebSocketClient {
  readonly platform = PLATFORMS.POLYMARKET;

  private log: Logger;
  private ws: WebSocket | null = null;
  private _state: WebSocketState = WS_STATES.DISCONNECTED;
  private subscriptions: Map<string, Set<string>> = new Map(); // channel -> asset_ids
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private handlers: WebSocketEventHandlers = {};
  private shouldReconnect = true;
  private wsHost: string;

  constructor(config: PolymarketConfig) {
    super();
    this.log = logger('PolymarketWebSocket');
    this.wsHost = config.wsHost || POLYMARKET_ENDPOINTS.WS;
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
   * Connect to Polymarket WebSocket
   */
  async connect(): Promise<void> {
    if (this._state === WS_STATES.CONNECTED || this._state === WS_STATES.CONNECTING) {
      this.log.warn('Already connected or connecting');
      return;
    }

    this.shouldReconnect = true;
    this.setState(WS_STATES.CONNECTING);

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${this.wsHost}/ws/market`;
        this.log.info('Connecting to WebSocket', { url: wsUrl });

        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          this.log.info('WebSocket connected');
          this.setState(WS_STATES.CONNECTED);
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
          this.clearPongTimeout();
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
    this.log.info('Disconnected from WebSocket');
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string, params?: Record<string, unknown>): void {
    const assetIds = params?.['assets_ids'] as string[] | undefined;

    // Track subscription
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    if (assetIds) {
      const channelSubs = this.subscriptions.get(channel)!;
      assetIds.forEach(id => channelSubs.add(id));
    }

    // Send subscription if connected
    if (this._state === WS_STATES.CONNECTED && this.ws) {
      const message: SubscribeMessage = {
        type: 'subscribe',
        channel: channel as SubscribeMessage['channel'],
      };

      if (assetIds && assetIds.length > 0) {
        message.assets_ids = assetIds;
      }

      this.sendMessage(message);
      this.log.debug('Subscribed to channel', { channel, assetIds });
    }
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string, assetIds?: string[]): void {
    // Update tracked subscriptions
    if (assetIds) {
      const channelSubs = this.subscriptions.get(channel);
      if (channelSubs) {
        assetIds.forEach(id => channelSubs.delete(id));
        if (channelSubs.size === 0) {
          this.subscriptions.delete(channel);
        }
      }
    } else {
      this.subscriptions.delete(channel);
    }

    // Send unsubscribe if connected
    if (this._state === WS_STATES.CONNECTED && this.ws) {
      const message: UnsubscribeMessage = {
        type: 'unsubscribe',
        channel,
      };

      if (assetIds && assetIds.length > 0) {
        message.assets_ids = assetIds;
      }

      this.sendMessage(message);
      this.log.debug('Unsubscribed from channel', { channel, assetIds });
    }
  }

  /**
   * Set event handlers
   */
  setHandlers(handlers: WebSocketEventHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Subscribe to orderbook updates for specific assets
   */
  subscribeOrderBook(assetIds: string[]): void {
    this.subscribe('book', { assets_ids: assetIds });
  }

  /**
   * Subscribe to trade updates for specific assets
   */
  subscribeTrades(assetIds: string[]): void {
    this.subscribe('last_trade_price', { assets_ids: assetIds });
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

  private handleMessage(data: string): void {
    try {
      const messages = JSON.parse(data);
      wsMessages.labels(this.platform, 'inbound', 'message').inc();

      // Handle array of messages
      const messageArray = Array.isArray(messages) ? messages : [messages];

      for (const message of messageArray) {
        this.processMessage(message as PolymarketWsMessage);
      }
    } catch (error) {
      this.log.error('Failed to parse WebSocket message', {
        error: error instanceof Error ? error.message : String(error),
        data: data.substring(0, 200),
      });
    }
  }

  private processMessage(message: PolymarketWsMessage): void {
    switch (message.event_type) {
      case 'book':
        this.handleOrderBookUpdate(message as PolymarketOrderBookWsMessage);
        break;
      case 'last_trade_price':
        this.handleTradeUpdate(message as PolymarketTradeWsMessage);
        break;
      case 'price_change':
        // Price changes are simplified - emit as price update
        this.emit('priceChange', message);
        break;
      default:
        this.log.debug('Unknown message type', { type: message.event_type });
    }
  }

  private handleOrderBookUpdate(message: PolymarketOrderBookWsMessage): void {
    const normalizeLevels = (levels: ClobOrderBookLevel[]): OrderBookLevel[] =>
      levels.map((level) => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      }));

    const update: OrderBookUpdate = {
      marketId: message.market,
      outcomeId: message.asset_id,
      bids: normalizeLevels(message.bids || []),
      asks: normalizeLevels(message.asks || []),
      timestamp: new Date(parseInt(message.timestamp) || Date.now()),
    };

    this.handlers.onOrderBook?.(update);
    this.emit('orderBook', update);
    wsMessages.labels(this.platform, 'inbound', 'orderbook').inc();
  }

  private handleTradeUpdate(message: PolymarketTradeWsMessage): void {
    const update: TradeUpdate = {
      marketId: message.market,
      outcomeId: message.asset_id,
      price: parseFloat(message.price),
      size: parseFloat(message.size),
      side: message.side === 'BUY' ? 'buy' : 'sell',
      timestamp: new Date(parseInt(message.timestamp) || Date.now()),
    };

    this.handlers.onTrade?.(update);
    this.emit('trade', update);
    wsMessages.labels(this.platform, 'inbound', 'trade').inc();
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

        // Set pong timeout
        this.pongTimeout = setTimeout(() => {
          this.log.warn('Pong timeout - closing connection');
          this.ws?.terminate();
        }, TIMING.WEBSOCKET_PONG_TIMEOUT_MS);
      }
    }, TIMING.WEBSOCKET_HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.clearPongTimeout();
  }

  private clearPongTimeout(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
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
    for (const [channel, assetIds] of this.subscriptions.entries()) {
      if (assetIds.size > 0) {
        this.subscribe(channel, { assets_ids: Array.from(assetIds) });
      } else {
        this.subscribe(channel);
      }
    }
  }
}
