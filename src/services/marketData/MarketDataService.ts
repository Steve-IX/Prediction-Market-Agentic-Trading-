import { EventEmitter } from 'events';
import type { Platform } from '../../config/constants.js';
import { PLATFORMS, TIMING } from '../../config/constants.js';
import type { OrderBook, OrderBookUpdate, TradeUpdate } from '../../clients/shared/interfaces.js';
import { PolymarketWebSocket } from '../../clients/polymarket/PolymarketWebSocket.js';
import { KalshiWebSocket } from '../../clients/kalshi/KalshiWebSocket.js';
import { logger, type Logger } from '../../utils/logger.js';
import { priceUpdates } from '../../utils/metrics.js';

/**
 * Normalized price update event
 */
export interface PriceUpdate {
  platform: Platform;
  marketId: string;
  outcomeId: string;
  bestBid: number;
  bestAsk: number;
  bidSize: number;
  askSize: number;
  midPrice: number;
  spread: number;
  timestamp: Date;
}

/**
 * Tracked market info
 */
interface TrackedMarket {
  platform: Platform;
  marketId: string;
  outcomeIds: string[];
}

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  data: T;
  timestamp: Date;
}

/**
 * Market Data Service
 * Aggregates real-time data from Polymarket and Kalshi WebSocket feeds
 * Maintains in-memory cache with TTL
 * Debounces rapid updates to prevent flooding downstream consumers
 */
export class MarketDataService extends EventEmitter {
  private log: Logger;
  private polyWs: PolymarketWebSocket;
  private kalshiWs: KalshiWebSocket;

  // Cache
  private orderBooks: Map<string, CacheEntry<OrderBook>> = new Map();
  private prices: Map<string, CacheEntry<PriceUpdate>> = new Map();

  // Tracking
  private trackedMarkets: Map<Platform, Map<string, Set<string>>> = new Map(); // platform -> marketId -> outcomeIds

  // Debouncing
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingUpdates: Map<string, PriceUpdate> = new Map();
  private debounceMs: number = 100;

  // Config
  private priceTtlMs: number;
  private connected = false;

  constructor(polyWs: PolymarketWebSocket, kalshiWs: KalshiWebSocket, options?: { debounceMs?: number; priceTtlMs?: number }) {
    super();
    this.log = logger('MarketDataService');
    this.polyWs = polyWs;
    this.kalshiWs = kalshiWs;
    this.debounceMs = options?.debounceMs ?? 100;
    this.priceTtlMs = options?.priceTtlMs ?? TIMING.PRICE_CACHE_TTL_MS;

    // Initialize tracking maps
    this.trackedMarkets.set(PLATFORMS.POLYMARKET, new Map());
    this.trackedMarkets.set(PLATFORMS.KALSHI, new Map());

    this.setupEventListeners();
  }

  /**
   * Connect to both WebSocket feeds
   */
  async connect(): Promise<void> {
    if (this.connected) {
      this.log.warn('Already connected');
      return;
    }

    this.log.info('Connecting to market data feeds...');

    const errors: Error[] = [];

    // Connect to Polymarket
    try {
      await this.polyWs.connect();
      this.log.info('Connected to Polymarket WebSocket');
    } catch (error) {
      this.log.error('Failed to connect to Polymarket WebSocket', {
        error: error instanceof Error ? error.message : String(error),
      });
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    // Connect to Kalshi
    try {
      await this.kalshiWs.connect();
      this.log.info('Connected to Kalshi WebSocket');
    } catch (error) {
      this.log.error('Failed to connect to Kalshi WebSocket', {
        error: error instanceof Error ? error.message : String(error),
      });
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    // At least one connection should succeed
    if (errors.length === 2) {
      throw new Error('Failed to connect to any WebSocket feed');
    }

    this.connected = true;

    // Subscribe to tracked markets
    this.subscribeToTrackedMarkets();

    this.emit('connected');
    this.log.info('Market data service connected');
  }

  /**
   * Disconnect from all WebSocket feeds
   */
  async disconnect(): Promise<void> {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.pendingUpdates.clear();

    // Disconnect WebSockets
    await Promise.all([
      this.polyWs.disconnect(),
      this.kalshiWs.disconnect(),
    ]);

    this.connected = false;
    this.emit('disconnected');
    this.log.info('Market data service disconnected');
  }

  /**
   * Track a market for price updates
   */
  trackMarket(platform: Platform, marketId: string, outcomeIds: string[]): void {
    const platformMarkets = this.trackedMarkets.get(platform);
    if (!platformMarkets) return;

    if (!platformMarkets.has(marketId)) {
      platformMarkets.set(marketId, new Set());
    }

    const marketOutcomes = platformMarkets.get(marketId)!;
    outcomeIds.forEach(id => marketOutcomes.add(id));

    this.log.debug('Tracking market', { platform, marketId, outcomeIds });

    // Subscribe if already connected
    if (this.connected) {
      this.subscribeToMarket(platform, marketId, outcomeIds);
    }
  }

  /**
   * Stop tracking a market
   */
  untrackMarket(platform: Platform, marketId: string): void {
    const platformMarkets = this.trackedMarkets.get(platform);
    if (!platformMarkets) return;

    const outcomeIds = platformMarkets.get(marketId);
    if (outcomeIds) {
      // Clear cache for this market
      for (const outcomeId of outcomeIds) {
        const cacheKey = this.getCacheKey(platform, marketId, outcomeId);
        this.orderBooks.delete(cacheKey);
        this.prices.delete(cacheKey);
      }

      platformMarkets.delete(marketId);

      // Unsubscribe
      if (this.connected) {
        this.unsubscribeFromMarket(platform, marketId, Array.from(outcomeIds));
      }
    }
  }

  /**
   * Get cached order book
   */
  getOrderBook(platform: Platform, marketId: string, outcomeId: string): OrderBook | null {
    const cacheKey = this.getCacheKey(platform, marketId, outcomeId);
    const entry = this.orderBooks.get(cacheKey);

    if (!entry) return null;

    // Check TTL
    if (!this.isDataFresh(entry.timestamp)) {
      return null;
    }

    return entry.data;
  }

  /**
   * Get cached price
   */
  getLatestPrice(platform: Platform, marketId: string, outcomeId: string): PriceUpdate | null {
    const cacheKey = this.getCacheKey(platform, marketId, outcomeId);
    const entry = this.prices.get(cacheKey);

    if (!entry) return null;

    // Check TTL
    if (!this.isDataFresh(entry.timestamp)) {
      return null;
    }

    return entry.data;
  }

  /**
   * Check if data is fresh (within TTL)
   */
  isDataFresh(timestamp: Date): boolean;
  isDataFresh(platform: Platform, marketId: string, outcomeId: string): boolean;
  isDataFresh(platformOrTimestamp: Platform | Date, marketId?: string, outcomeId?: string): boolean {
    if (platformOrTimestamp instanceof Date) {
      return Date.now() - platformOrTimestamp.getTime() < this.priceTtlMs;
    }

    const cacheKey = this.getCacheKey(platformOrTimestamp, marketId!, outcomeId!);
    const entry = this.prices.get(cacheKey);

    if (!entry) return false;

    return Date.now() - entry.timestamp.getTime() < this.priceTtlMs;
  }

  /**
   * Get all tracked markets
   */
  getTrackedMarkets(): TrackedMarket[] {
    const markets: TrackedMarket[] = [];

    for (const [platform, platformMarkets] of this.trackedMarkets.entries()) {
      for (const [marketId, outcomeIds] of platformMarkets.entries()) {
        markets.push({
          platform,
          marketId,
          outcomeIds: Array.from(outcomeIds),
        });
      }
    }

    return markets;
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ============================================
  // Private Methods
  // ============================================

  private setupEventListeners(): void {
    // Polymarket events
    this.polyWs.on('orderBook', (update: OrderBookUpdate) => {
      this.onOrderBookUpdate(PLATFORMS.POLYMARKET, update);
    });

    this.polyWs.on('trade', (update: TradeUpdate) => {
      this.emit('trade', { platform: PLATFORMS.POLYMARKET, ...update });
    });

    this.polyWs.on('connected', () => {
      this.emit('connectionStatus', { platform: PLATFORMS.POLYMARKET, status: 'connected' });
    });

    this.polyWs.on('disconnected', () => {
      this.emit('connectionStatus', { platform: PLATFORMS.POLYMARKET, status: 'disconnected' });
    });

    this.polyWs.on('error', (error: Error) => {
      this.emit('error', { platform: PLATFORMS.POLYMARKET, error });
    });

    // Kalshi events
    this.kalshiWs.on('orderBook', (update: OrderBookUpdate) => {
      this.onOrderBookUpdate(PLATFORMS.KALSHI, update);
    });

    this.kalshiWs.on('trade', (update: TradeUpdate) => {
      this.emit('trade', { platform: PLATFORMS.KALSHI, ...update });
    });

    this.kalshiWs.on('connected', () => {
      this.emit('connectionStatus', { platform: PLATFORMS.KALSHI, status: 'connected' });
    });

    this.kalshiWs.on('disconnected', () => {
      this.emit('connectionStatus', { platform: PLATFORMS.KALSHI, status: 'disconnected' });
    });

    this.kalshiWs.on('error', (error: Error) => {
      this.emit('error', { platform: PLATFORMS.KALSHI, error });
    });
  }

  private onOrderBookUpdate(platform: Platform, update: OrderBookUpdate): void {
    const cacheKey = this.getCacheKey(platform, update.marketId, update.outcomeId);
    const now = new Date();

    // Build OrderBook from update
    const orderBook: OrderBook = {
      marketId: update.marketId,
      outcomeId: update.outcomeId,
      bids: update.bids,
      asks: update.asks,
      timestamp: update.timestamp,
    };

    // Update order book cache
    this.orderBooks.set(cacheKey, {
      data: orderBook,
      timestamp: now,
    });

    // Extract price info
    const bestBid = update.bids[0]?.price ?? 0;
    const bestAsk = update.asks[0]?.price ?? 1;
    const bidSize = update.bids[0]?.size ?? 0;
    const askSize = update.asks[0]?.size ?? 0;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;

    const priceUpdate: PriceUpdate = {
      platform,
      marketId: update.marketId,
      outcomeId: update.outcomeId,
      bestBid,
      bestAsk,
      bidSize,
      askSize,
      midPrice,
      spread,
      timestamp: now,
    };

    // Update price cache
    this.prices.set(cacheKey, {
      data: priceUpdate,
      timestamp: now,
    });

    // Emit order book update immediately
    this.emit('orderBookUpdate', { platform, ...update });

    // Debounce price update
    this.debouncePriceUpdate(cacheKey, priceUpdate);

    priceUpdates.labels(platform).inc();
  }

  private debouncePriceUpdate(cacheKey: string, update: PriceUpdate): void {
    // Store the latest update
    this.pendingUpdates.set(cacheKey, update);

    // Clear existing timer
    const existingTimer = this.debounceTimers.get(cacheKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      const pendingUpdate = this.pendingUpdates.get(cacheKey);
      if (pendingUpdate) {
        this.emit('priceUpdate', pendingUpdate);
        this.pendingUpdates.delete(cacheKey);
      }
      this.debounceTimers.delete(cacheKey);
    }, this.debounceMs);

    this.debounceTimers.set(cacheKey, timer);
  }

  private getCacheKey(platform: Platform, marketId: string, outcomeId: string): string {
    return `${platform}:${marketId}:${outcomeId}`;
  }

  private subscribeToTrackedMarkets(): void {
    for (const [platform, platformMarkets] of this.trackedMarkets.entries()) {
      for (const [marketId, outcomeIds] of platformMarkets.entries()) {
        this.subscribeToMarket(platform, marketId, Array.from(outcomeIds));
      }
    }
  }

  private subscribeToMarket(platform: Platform, marketId: string, outcomeIds: string[]): void {
    if (platform === PLATFORMS.POLYMARKET) {
      // Polymarket uses asset_ids (token IDs)
      this.polyWs.subscribeOrderBook(outcomeIds);
      this.polyWs.subscribeTrades(outcomeIds);
    } else if (platform === PLATFORMS.KALSHI) {
      // Kalshi uses market tickers
      this.kalshiWs.subscribeOrderBook([marketId]);
      this.kalshiWs.subscribeTrades([marketId]);
    }

    this.log.debug('Subscribed to market', { platform, marketId, outcomeIds });
  }

  private unsubscribeFromMarket(platform: Platform, marketId: string, outcomeIds: string[]): void {
    if (platform === PLATFORMS.POLYMARKET) {
      this.polyWs.unsubscribe('book', outcomeIds);
      this.polyWs.unsubscribe('last_trade_price', outcomeIds);
    } else if (platform === PLATFORMS.KALSHI) {
      this.kalshiWs.unsubscribe('orderbook_delta', [marketId]);
      this.kalshiWs.unsubscribe('trade', [marketId]);
    }

    this.log.debug('Unsubscribed from market', { platform, marketId, outcomeIds });
  }
}
