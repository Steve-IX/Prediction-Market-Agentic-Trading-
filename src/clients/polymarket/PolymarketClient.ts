import { ClobClient, Side, OrderType, AssetType } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import type { PolymarketConfig } from '../../config/schema.js';
import { PLATFORMS, ORDER_TYPES, ORDER_SIDES, ORDER_STATUSES, OUTCOMES, MARKET_STATUSES } from '../../config/constants.js';
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
import type { GammaEvent, GammaMarket, SignatureType } from './types.js';
import { logger, type Logger } from '../../utils/logger.js';
import { retry } from '../../utils/retry.js';
import { startTimer, observeApiLatency, recordApiRequest, apiErrors } from '../../utils/metrics.js';

/**
 * Polymarket client implementation
 * Wraps the official @polymarket/clob-client SDK with normalization layer
 */
export class PolymarketClient implements IPlatformClient {
  readonly platform = PLATFORMS.POLYMARKET;

  private config: PolymarketConfig;
  private log: Logger;
  private client: ClobClient | null = null;
  private signer: Wallet | null = null;
  private connected = false;
  private readOnly = false;

  constructor(config: PolymarketConfig) {
    this.config = config;
    this.log = logger('PolymarketClient');
  }

  /**
   * Connect and authenticate with Polymarket
   */
  async connect(): Promise<void> {
    if (this.connected) {
      this.log.warn('Already connected');
      return;
    }

    const timer = startTimer();

    try {
      if (!this.config.privateKey) {
        // Read-only mode - no authentication required
        this.log.info('Connecting in read-only mode (no private key)');
        this.client = new ClobClient(this.config.host, this.config.chainId);
        this.readOnly = true;
        this.connected = true;
        recordApiRequest(this.platform, 'connect', 'success');
        return;
      }

      // Create wallet from private key
      this.signer = new Wallet(this.config.privateKey);
      this.log.info('Wallet initialized', { address: this.signer.address });

      // Map signature type
      const signatureType = this.mapSignatureType(this.config.signatureType);

      // Check if L2 API credentials are provided directly
      let shouldAutoDerive = false;
      
      if (this.config.apiKey && this.config.apiSecret && this.config.apiPassphrase) {
        // Use provided L2 API credentials directly
        this.log.info('Using provided L2 API credentials', {
          apiKey: this.config.apiKey.substring(0, 8) + '...',
          apiKeyLength: this.config.apiKey.length,
          secretLength: this.config.apiSecret.length,
          passphraseLength: this.config.apiPassphrase.length,
          walletAddress: this.signer.address,
        });
        
        const apiCreds = {
          key: this.config.apiKey,
          secret: this.config.apiSecret,
          passphrase: this.config.apiPassphrase,
        };

        // Initialize trading client with provided credentials
        this.client = new ClobClient(this.config.host, this.config.chainId, this.signer, apiCreds, signatureType);

        // Verify the credentials work by making a test request
        // Note: The SDK may log errors to console but not always throw exceptions
        // The SDK sometimes returns error objects instead of throwing, so we must check both
        let verificationPassed = false;
        try {
          const balanceResult = await this.client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
          
          // Check if we got a valid response (not null/undefined, has expected structure)
          if (balanceResult && typeof balanceResult === 'object') {
            const resultObj = balanceResult as unknown as Record<string, unknown>;
            
            // FIRST: Check if this is an error response (SDK returns error object instead of throwing)
            if (resultObj['error'] || resultObj['status'] === 401 || resultObj['statusText'] === 'Unauthorized') {
              const errorMsg = String(resultObj['error'] || 'API returned error status');
              const errorStatus = resultObj['status'];
              this.log.error('L2 API credentials returned error response', {
                error: errorMsg,
                status: errorStatus,
                walletAddress: this.signer.address,
              });
              // Throw to trigger the catch block for proper handling
              throw new Error(`API Error: ${errorMsg} (status: ${errorStatus})`);
            }
            
            // THEN: Check for valid balance response
            if ('balance' in resultObj) {
              verificationPassed = true;
              this.log.info('L2 API credentials verified successfully', {
                balance: resultObj['balance'],
              });
            } else {
              // Response has no error and no balance - unexpected format
              this.log.warn('Balance response format unexpected (no balance field)', { result: balanceResult });
              throw new Error('Unexpected balance response format: missing balance field');
            }
          } else {
            // Null/undefined response
            this.log.warn('Balance response was null or not an object', { result: balanceResult });
            throw new Error('Unexpected balance response: null or invalid type');
          }
        } catch (verifyError) {
          // Error occurred during verification
          verificationPassed = false;
          const errMsg = verifyError instanceof Error ? verifyError.message : String(verifyError);
          const errStr = JSON.stringify(verifyError);
          const errStack = verifyError instanceof Error ? verifyError.stack : '';
          const fullErrorString = `${errMsg} ${errStr} ${errStack}`;
          
          // Check for 401 Unauthorized - likely wrong wallet or invalid keys
          const is401Error = 
            fullErrorString.includes('401') || 
            fullErrorString.includes('Unauthorized') || 
            fullErrorString.includes('Invalid api key') ||
            fullErrorString.includes('Invalid API') ||
            errMsg.toLowerCase().includes('unauthorized') ||
            errMsg.toLowerCase().includes('invalid');
            
          if (is401Error) {
            this.log.error('L2 API credentials INVALID - 401 Unauthorized detected!', {
              walletFromPrivateKey: this.signer.address,
              error: errMsg,
              suggestion: 'Credentials may be invalid or generated for a different wallet. Attempting auto-derive fallback...',
            });
            
            // Mark for auto-derive fallback
            shouldAutoDerive = true;
            this.client = null; // Reset client
          } else {
            // Non-auth error - might be temporary, proceed anyway
            this.log.warn('Verification error (non-auth), proceeding anyway', { error: errMsg });
            verificationPassed = true; // Treat as passed for non-auth errors
          }
        }
        
        // Only mark as connected if verification passed
        if (verificationPassed && !shouldAutoDerive) {
          this.connected = true;
          this.readOnly = false;

          const durationMs = timer();
          observeApiLatency(this.platform, 'connect', durationMs);
          recordApiRequest(this.platform, 'connect', 'success');

          this.log.info('Connected to Polymarket CLOB with L2 credentials', {
            address: this.signer.address,
            chainId: this.config.chainId,
            durationMs,
          });
          return;
        } else if (shouldAutoDerive) {
          // Will fall through to auto-derive logic below
          this.log.warn('Credentials verification failed, attempting auto-derive...');
        }
      }
      
      // If we get here, either no credentials were provided OR they failed validation
      if (!shouldAutoDerive && this.config.apiKey) {
        // This shouldn't happen, but just in case
        return;
      }

      // No L2 credentials provided OR they failed validation - try to derive API credentials
      this.log.info(shouldAutoDerive 
        ? 'Auto-deriving API credentials after failed validation...' 
        : 'No L2 API credentials provided, attempting to derive...');
      
      // Create temporary client to derive API credentials
      const tempClient = new ClobClient(this.config.host, this.config.chainId, this.signer);

      // Derive or create API credentials
      let apiCreds;
      try {
        apiCreds = await retry(
          async () => {
            const creds = await tempClient.createOrDeriveApiKey();
            // Validate that we got valid credentials (SDK may return null/undefined on error)
            if (!creds || typeof creds !== 'object') {
              throw new Error('createOrDeriveApiKey returned invalid result (null/undefined)');
            }
            if (!creds.key || !creds.secret || !creds.passphrase) {
              throw new Error('createOrDeriveApiKey returned incomplete credentials (missing key/secret/passphrase)');
            }
            return creds;
          },
          {
            maxAttempts: 3,
            initialDelayMs: 1000,
            retryOn: (error) => {
              // Only retry on network/temporary errors, not permanent failures
              const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
              return msg.includes('network') || msg.includes('timeout') || msg.includes('500') || msg.includes('503');
            },
            onRetry: (attempt, error) => {
              this.log.warn(`API key derivation attempt ${attempt} failed`, {
                error: error instanceof Error ? error.message : String(error),
              });
            },
          }
        );
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.log.error('Failed to derive API credentials', {
          error: errMsg,
          walletAddress: this.signer.address,
          suggestion: 'This may occur if the wallet has not made any trades yet. Try making a small manual trade on polymarket.com first.',
        });
        throw new Error(`Unable to derive Polymarket API credentials: ${errMsg}`);
      }

      this.log.info('API credentials derived successfully', {
        apiKey: apiCreds.key.substring(0, 8) + '...',
      });

      // Initialize trading client with credentials
      this.client = new ClobClient(this.config.host, this.config.chainId, this.signer, apiCreds, signatureType);

      // Verify the derived credentials actually work
      try {
        const verifyResult = await this.client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
        const verifyObj = verifyResult as unknown as Record<string, unknown>;
        if (verifyObj['error'] || verifyObj['status'] === 401) {
          throw new Error('Derived credentials failed verification (401 Unauthorized)');
        }
        this.log.info('Derived credentials verified successfully');
      } catch (verifyError) {
        const errMsg = verifyError instanceof Error ? verifyError.message : String(verifyError);
        this.log.error('Derived credentials failed verification', {
          error: errMsg,
          walletAddress: this.signer.address,
        });
        throw new Error(`Derived credentials are invalid: ${errMsg}`);
      }

      this.connected = true;
      this.readOnly = false;

      const durationMs = timer();
      observeApiLatency(this.platform, 'connect', durationMs);
      recordApiRequest(this.platform, 'connect', 'success');

      this.log.info('Connected to Polymarket CLOB', {
        address: this.signer.address,
        chainId: this.config.chainId,
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
   * Disconnect from Polymarket
   */
  async disconnect(): Promise<void> {
    this.client = null;
    this.signer = null;
    this.connected = false;
    this.readOnly = false;
    this.log.info('Disconnected from Polymarket');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Get list of markets from Gamma API
   */
  async getMarkets(filter?: MarketFilter): Promise<NormalizedMarket[]> {
    const timer = startTimer();

    try {
      const params = new URLSearchParams();
      params.set('active', String(filter?.activeOnly ?? true));
      params.set('closed', 'false');
      params.set('limit', String(filter?.limit ?? 100));

      if (filter?.cursor) {
        params.set('next_cursor', filter.cursor);
      }

      const url = `${this.config.gammaHost}/events?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as GammaEvent[] | { data?: GammaEvent[]; results?: GammaEvent[] };
      
      // Handle different response structures
      // The API might return an array directly, or an object with a data property
      const events: GammaEvent[] = Array.isArray(data) 
        ? data 
        : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.results) ? data.results : []));
      
      if (!Array.isArray(events) || events.length === 0) {
        this.log.warn('No events found in Gamma API response', { 
          responseType: Array.isArray(data) ? 'array' : 'object',
          responseKeys: Array.isArray(data) ? undefined : Object.keys(data || {}),
        });
        return [];
      }

      this.log.debug('Fetched events from Gamma API', { 
        eventCount: events.length,
        eventsWithMarkets: events.filter(e => e?.markets?.length > 0).length,
      });

      // Filter out events without markets and safely map
      // Markets must have either tokens array OR clobTokenIds+outcomes strings
      const markets = events
        .filter((event): event is GammaEvent & { markets: NonNullable<GammaEvent['markets']> } => 
          event && Array.isArray(event.markets) && event.markets.length > 0
        )
        .flatMap((event) => 
          event.markets
            .filter((market) => {
              if (!market) return false;
              // Check for tokens array (older format)
              if (Array.isArray(market.tokens) && market.tokens.length > 0) return true;
              // Check for JSON string fields (newer format)
              if (market.clobTokenIds && market.outcomes) return true;
              return false;
            })
            .map((market) => this.normalizeMarket(market, event))
        )
        // Filter out any markets that ended up with no outcomes (failed token parsing)
        .filter((market) => market.outcomes.length > 0);

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
   * Get a single market by ID
   */
  async getMarket(externalId: string): Promise<NormalizedMarket> {
    const timer = startTimer();

    try {
      const url = `${this.config.gammaHost}/markets/${externalId}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Market not found: ${externalId}`);
      }

      const data = (await response.json()) as { market: GammaMarket; event: GammaEvent };

      const durationMs = timer();
      observeApiLatency(this.platform, 'getMarket', durationMs);
      recordApiRequest(this.platform, 'getMarket', 'success');

      return this.normalizeMarket(data.market, data.event);
    } catch (error) {
      const durationMs = timer();
      observeApiLatency(this.platform, 'getMarket', durationMs);
      recordApiRequest(this.platform, 'getMarket', 'error');

      this.log.error('Failed to fetch market', { externalId, error });
      throw error;
    }
  }

  /**
   * Get order book for a market/outcome
   */
  async getOrderBook(marketId: string, outcomeId: string): Promise<OrderBook> {
    this.ensureClient();
    const timer = startTimer();

    try {
      const orderBook = await this.client!.getOrderBook(outcomeId);

      const durationMs = timer();
      observeApiLatency(this.platform, 'getOrderBook', durationMs);
      recordApiRequest(this.platform, 'getOrderBook', 'success');

      return this.normalizeOrderBook(marketId, outcomeId, orderBook);
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
    this.ensureClient();
    this.ensureNotReadOnly();
    const timer = startTimer();

    try {
      // Get market info for tick size and negRisk
      const marketInfo = await this.getMarketInfo(order.marketId);

      // Map order type for SDK compatibility
      const orderType = this.mapOrderTypeForCreateOrder(order.type);

      // Create order through SDK
      const response = await this.client!.createAndPostOrder(
        {
          tokenID: order.outcomeId,
          price: order.price,
          side: order.side === ORDER_SIDES.BUY ? Side.BUY : Side.SELL,
          size: order.size,
        },
        {
          tickSize: marketInfo.tickSize as '0.1' | '0.01' | '0.001' | '0.0001',
          negRisk: marketInfo.negRisk,
        },
        orderType
      );

      const durationMs = timer();
      observeApiLatency(this.platform, 'placeOrder', durationMs);
      recordApiRequest(this.platform, 'placeOrder', 'success');

      this.log.info('Order placed', {
        orderId: response.id,
        marketId: order.marketId,
        side: order.side,
        price: order.price,
        size: order.size,
        durationMs,
      });

      return this.normalizeOrderResponse(response, order);
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
    this.ensureClient();
    this.ensureNotReadOnly();
    const timer = startTimer();

    try {
      // Extract actual order ID if prefixed
      const actualOrderId = orderId.startsWith(`${this.platform}:`) ? orderId.split(':')[1] : orderId;
      await this.client!.cancelOrder({ orderID: actualOrderId! });

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
    this.ensureClient();
    this.ensureNotReadOnly();
    const timer = startTimer();

    try {
      if (marketId) {
        await this.client!.cancelMarketOrders({ market: marketId });
      } else {
        await this.client!.cancelAll();
      }

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
    this.ensureClient();
    this.ensureNotReadOnly();
    const timer = startTimer();

    try {
      const response = await this.client!.getOpenOrders();
      const orders = Array.isArray(response) ? response : [];

      const durationMs = timer();
      observeApiLatency(this.platform, 'getOpenOrders', durationMs);
      recordApiRequest(this.platform, 'getOpenOrders', 'success');

      return orders.map((order: unknown) => this.normalizeOpenOrder(order));
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
    this.ensureClient();
    this.ensureNotReadOnly();
    const timer = startTimer();

    try {
      const actualOrderId = orderId.startsWith(`${this.platform}:`) ? orderId.split(':')[1] : orderId;
      const order = await this.client!.getOrder(actualOrderId!);

      const durationMs = timer();
      observeApiLatency(this.platform, 'getOrder', durationMs);
      recordApiRequest(this.platform, 'getOrder', 'success');

      return this.normalizeOpenOrder(order);
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
    this.ensureClient();
    this.ensureNotReadOnly();
    const timer = startTimer();

    try {
      // Must specify asset_type: COLLATERAL to get USDC balance
      const balanceData = await this.client!.getBalanceAllowance({
        asset_type: AssetType.COLLATERAL,
      });

      const durationMs = timer();
      observeApiLatency(this.platform, 'getBalance', durationMs);
      recordApiRequest(this.platform, 'getBalance', 'success');

      // Polymarket returns balance in USDC with 6 decimals
      const balance = balanceData.balance;
      const available = typeof balance === 'string' ? parseFloat(balance) / 1e6 : 0;

      return {
        available,
        locked: 0,
        total: available,
        currency: 'USDC',
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
   * Note: Polymarket SDK doesn't provide a direct positions API.
   * Positions should be derived from trades or tracked locally.
   * For paper trading, positions are managed by the PaperTradingEngine.
   */
  async getPositions(): Promise<Position[]> {
    this.ensureClient();
    this.ensureNotReadOnly();
    const timer = startTimer();

    try {
      // Polymarket doesn't have a direct positions endpoint in the CLOB SDK
      // Positions are typically tracked from trades or through the Gamma API
      // For now, return empty array - paper trading manages its own positions
      this.log.debug('Positions endpoint not available in CLOB SDK, returning empty array');

      const durationMs = timer();
      observeApiLatency(this.platform, 'getPositions', durationMs);
      recordApiRequest(this.platform, 'getPositions', 'success');

      return [];
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
  async getTrades(_limit = 100): Promise<Trade[]> {
    this.ensureClient();
    this.ensureNotReadOnly();
    const timer = startTimer();

    try {
      const response = await this.client!.getTrades();
      const trades = Array.isArray(response) ? response : [];

      const durationMs = timer();
      observeApiLatency(this.platform, 'getTrades', durationMs);
      recordApiRequest(this.platform, 'getTrades', 'success');

      return trades.map((trade: unknown) => this.normalizeTrade(trade as Record<string, unknown>));
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

  private ensureClient(): void {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }
  }

  private ensureNotReadOnly(): void {
    if (this.readOnly) {
      throw new Error('Client is in read-only mode. Provide a private key to enable trading.');
    }
  }

  private mapSignatureType(type: 'EOA' | 'PROXY' | 'GNOSIS'): SignatureType {
    switch (type) {
      case 'EOA':
        return 0;
      case 'PROXY':
        return 1;
      case 'GNOSIS':
        return 2;
      default:
        return 0;
    }
  }

  private mapOrderTypeForCreateOrder(type: string): OrderType.GTC | OrderType.GTD | undefined {
    // createAndPostOrder only supports GTC and GTD
    // FOK/IOC orders need to be handled differently via market orders
    switch (type) {
      case ORDER_TYPES.GTC:
        return OrderType.GTC;
      case ORDER_TYPES.GTD:
        return OrderType.GTD;
      case ORDER_TYPES.FOK:
      case ORDER_TYPES.IOC:
        // For FOK/IOC, we still use GTC but the order will need immediate fill handling
        // at a higher level (e.g., checking fill status and canceling if not filled)
        return OrderType.GTC;
      default:
        return OrderType.GTC;
    }
  }

  private async getMarketInfo(marketId: string): Promise<{ tickSize: string; negRisk: boolean }> {
    try {
      const response = await fetch(`${this.config.host}/markets/${marketId}`);
      if (!response.ok) {
        return { tickSize: '0.01', negRisk: false };
      }

      const market = (await response.json()) as Record<string, unknown>;
      return {
        tickSize: typeof market['minTick'] === 'string' ? market['minTick'] : '0.01',
        negRisk: market['negRisk'] === true,
      };
    } catch {
      return { tickSize: '0.01', negRisk: false };
    }
  }

  private normalizeMarket(market: GammaMarket, event: GammaEvent): NormalizedMarket {
    // Build tokens from either the tokens array or the separate JSON string fields
    const tokens = this.extractTokens(market);
    
    const outcomes: NormalizedOutcome[] = tokens.map((token) => {
      const price = parseFloat(token.price || '0.5');
      return {
        id: `${this.platform}:${market.conditionId}:${token.tokenId}`,
        externalId: token.tokenId,
        name: token.outcome,
        type: token.outcome.toLowerCase() === 'yes' ? OUTCOMES.YES : OUTCOMES.NO,
        probability: price,
        bestBid: Math.max(0.01, price - 0.01),
        bestAsk: Math.min(0.99, price + 0.01),
        bidSize: 0,
        askSize: 0,
      };
    });

    return {
      id: `${this.platform}:${market.conditionId}`,
      platform: this.platform,
      externalId: market.conditionId,
      title: event.title,
      description: market.question || event.description,
      category: event.tags?.[0]?.label || 'Unknown',
      endDate: new Date(market.endDate),
      outcomes,
      volume24h: parseFloat(market.volume24hr || '0'),
      liquidity: parseFloat(market.liquidity || '0'),
      isActive: market.active && !market.closed && market.acceptingOrders,
      status: market.closed ? MARKET_STATUSES.CLOSED : market.active ? MARKET_STATUSES.ACTIVE : MARKET_STATUSES.SUSPENDED,
      raw: { market, event },
    };
  }

  /**
   * Extract tokens from a GammaMarket
   * The API may return tokens as either:
   * 1. A tokens array (older format)
   * 2. Separate JSON string fields: clobTokenIds, outcomes, outcomePrices
   */
  private extractTokens(market: GammaMarket): Array<{ tokenId: string; outcome: string; price: string }> {
    // If tokens array exists and has items, use it
    if (market.tokens && Array.isArray(market.tokens) && market.tokens.length > 0) {
      return market.tokens;
    }

    // Otherwise, parse from JSON string fields
    try {
      const tokenIds: string[] = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : [];
      const outcomes: string[] = market.outcomes ? JSON.parse(market.outcomes) : [];
      const prices: string[] = market.outcomePrices ? JSON.parse(market.outcomePrices) : [];

      if (tokenIds.length === 0 || outcomes.length === 0) {
        return [];
      }

      return tokenIds.map((tokenId, index) => ({
        tokenId,
        outcome: outcomes[index] || 'Unknown',
        price: prices[index] || '0.5',
      }));
    } catch (error) {
      this.log.warn('Failed to parse market tokens', {
        marketId: market.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private normalizeOrderBook(marketId: string, outcomeId: string, orderBook: unknown): OrderBook {
    const ob = orderBook as Record<string, unknown>;
    const bidsRaw = ob['bids'] as Array<{ price: string; size: string }> | undefined;
    const asksRaw = ob['asks'] as Array<{ price: string; size: string }> | undefined;
    const timestampRaw = ob['timestamp'] as string | undefined;

    const normalizeLevels = (levels: Array<{ price: string; size: string }> | undefined): OrderBookLevel[] =>
      (levels || []).map((level) => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      }));

    return {
      marketId,
      outcomeId,
      bids: normalizeLevels(bidsRaw),
      asks: normalizeLevels(asksRaw),
      timestamp: timestampRaw ? new Date(timestampRaw) : new Date(),
    };
  }

  private normalizeOrderResponse(response: unknown, request: OrderRequest): NormalizedOrder {
    const res = response as Record<string, unknown>;
    const id = String(res['id'] || res['orderID'] || '');

    return {
      id: `${this.platform}:${id}`,
      platform: this.platform,
      externalOrderId: id,
      marketId: request.marketId,
      outcomeId: request.outcomeId,
      side: request.side,
      price: request.price,
      size: request.size,
      filledSize: 0,
      avgFillPrice: request.price,
      type: request.type,
      status: ORDER_STATUSES.OPEN,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private normalizeOpenOrder(order: unknown): NormalizedOrder {
    const o = order as Record<string, unknown>;
    const id = String(o['id'] || o['orderID'] || '');
    const sizeMatched = parseFloat(String(o['size_matched'] || o['sizeMatched'] || '0'));
    const originalSize = parseFloat(String(o['original_size'] || o['originalSize'] || '0'));
    const price = parseFloat(String(o['price'] || '0'));
    const side = String(o['side'] || 'BUY');
    const status = String(o['status'] || 'live');

    return {
      id: `${this.platform}:${id}`,
      platform: this.platform,
      externalOrderId: id,
      marketId: String(o['market'] || ''),
      outcomeId: String(o['asset_id'] || o['assetId'] || ''),
      side: side === 'BUY' ? ORDER_SIDES.BUY : ORDER_SIDES.SELL,
      price,
      size: originalSize * price,
      filledSize: sizeMatched * price,
      avgFillPrice: price,
      type: ORDER_TYPES.GTC,
      status: status === 'live' ? ORDER_STATUSES.OPEN : status === 'matched' ? ORDER_STATUSES.FILLED : ORDER_STATUSES.CANCELLED,
      createdAt: new Date(Number(o['created_at'] || o['createdAt'] || Date.now()) * 1000),
      updatedAt: new Date(),
    };
  }

  private normalizeTrade(trade: Record<string, unknown>): Trade {
    const id = String(trade['id'] || '');
    const price = parseFloat(String(trade['price'] || '0'));
    const size = parseFloat(String(trade['size'] || '0'));
    const feeRateBps = parseFloat(String(trade['fee_rate_bps'] || trade['feeRateBps'] || '0'));
    const side = String(trade['side'] || 'BUY');

    return {
      id: `${this.platform}:${id}`,
      platform: this.platform,
      orderId: String(trade['taker_order_id'] || trade['takerOrderId'] || ''),
      marketId: String(trade['market'] || ''),
      outcomeId: String(trade['asset_id'] || trade['assetId'] || ''),
      side: side === 'BUY' ? ORDER_SIDES.BUY : ORDER_SIDES.SELL,
      price,
      size: size * price,
      fee: (size * price * feeRateBps) / 10000,
      executedAt: new Date(String(trade['match_time'] || trade['matchTime'] || '')),
    };
  }
}
