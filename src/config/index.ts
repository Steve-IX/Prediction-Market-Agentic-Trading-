import * as dotenv from 'dotenv';
import { z } from 'zod';
import { ConfigSchema, type Config } from './schema.js';
import { KALSHI_ENDPOINTS, POLYMARKET_ENDPOINTS } from './constants.js';

// Load environment variables
dotenv.config();

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse number from environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse tiered multipliers from environment variable
 * Format: JSON array like [{"minSize":0,"maxSize":100,"multiplier":2.0},{"minSize":100,"maxSize":500,"multiplier":1.0}]
 * Or simplified format: "0-100:2.0,100-500:1.0,500-1000:0.5"
 */
function parseTieredMultipliers(value: string | undefined): Array<{ minSize: number; maxSize: number; multiplier: number }> {
  if (!value || value.trim() === '') return [];

  try {
    // Try JSON format first
    if (value.trim().startsWith('[')) {
      return JSON.parse(value);
    }

    // Parse simplified format: "0-100:2.0,100-500:1.0"
    const tiers: Array<{ minSize: number; maxSize: number; multiplier: number }> = [];
    const parts = value.split(',').map((p) => p.trim()).filter((p) => p);

    for (const part of parts) {
      const splitPart = part.split(':');
      if (splitPart.length !== 2) continue;

      const range = splitPart[0];
      const multiplierStr = splitPart[1];
      if (!range || !multiplierStr) continue;

      const multiplier = parseFloat(multiplierStr);
      if (isNaN(multiplier)) continue;

      // Handle "500+" format (infinite upper bound)
      if (range.endsWith('+')) {
        const min = parseFloat(range.slice(0, -1));
        if (!isNaN(min)) {
          tiers.push({ minSize: min, maxSize: Number.MAX_SAFE_INTEGER, multiplier });
        }
      } else if (range.includes('-')) {
        const rangeParts = range.split('-');
        if (rangeParts.length !== 2) continue;
        const minStr = rangeParts[0];
        const maxStr = rangeParts[1];
        if (!minStr || !maxStr) continue;
        const min = parseFloat(minStr);
        const max = parseFloat(maxStr);
        if (!isNaN(min) && !isNaN(max)) {
          tiers.push({ minSize: min, maxSize: max, multiplier });
        }
      }
    }

    return tiers;
  } catch {
    return [];
  }
}

/**
 * Get Kalshi host based on environment
 */
function getKalshiHost(environment: 'demo' | 'prod'): string {
  return environment === 'prod' ? KALSHI_ENDPOINTS.PROD : KALSHI_ENDPOINTS.DEMO;
}

/**
 * Build configuration object from environment variables
 */
function buildConfigFromEnv(): unknown {
  const env = process.env;

  return {
    env: env['NODE_ENV'] || 'development',
    logLevel: env['LOG_LEVEL'] || 'info',

    polymarket: {
      privateKey: env['POLYMARKET_PRIVATE_KEY'],
      // L2 API credentials - use these directly for live trading
      apiKey: env['POLYMARKET_API_KEY'],
      apiSecret: env['POLYMARKET_API_SECRET'],
      apiPassphrase: env['POLYMARKET_API_PASSPHRASE'],
      // Funder address - the proxy wallet where your USDC is held (from Polymarket settings)
      funderAddress: env['POLYMARKET_FUNDER_ADDRESS'],
      chainId: parseNumber(env['POLYMARKET_CHAIN_ID'], 137),
      host: env['POLYMARKET_HOST'] || POLYMARKET_ENDPOINTS.CLOB,
      gammaHost: env['POLYMARKET_GAMMA_HOST'] || POLYMARKET_ENDPOINTS.GAMMA,
      wsHost: env['POLYMARKET_WS_HOST'] || POLYMARKET_ENDPOINTS.WS,
      // Default to EOA - GNOSIS should only be used for actual Gnosis Safe multisig wallets
      // Most users should use EOA (direct wallet signing) even if they have a Polymarket proxy
      signatureType: env['POLYMARKET_SIGNATURE_TYPE'] || 'EOA',
    },

    kalshi: {
      apiKeyId: env['KALSHI_API_KEY_ID'],
      privateKeyPath: env['KALSHI_PRIVATE_KEY_PATH'],
      privateKeyPem: env['KALSHI_PRIVATE_KEY_PEM'],
      environment: (env['KALSHI_ENVIRONMENT'] as 'demo' | 'prod') || 'demo',
      host: env['KALSHI_HOST'] || getKalshiHost((env['KALSHI_ENVIRONMENT'] as 'demo' | 'prod') || 'demo'),
    },

    database: {
      url: env['DATABASE_URL'] || 'postgresql://localhost:5432/prediction_trading',
      poolSize: parseNumber(env['DATABASE_POOL_SIZE'], 10),
    },

    redis: {
      url: env['REDIS_URL'] || 'redis://localhost:6379',
      enabled: parseBoolean(env['REDIS_ENABLED'], false),
    },

    risk: {
      // Conservative defaults - override via env vars for larger balances
      maxPositionSizeUsd: parseNumber(env['MAX_POSITION_SIZE_USD'], 5),
      maxTotalExposureUsd: parseNumber(env['MAX_TOTAL_EXPOSURE_USD'], 10),
      maxDailyLossUsd: parseNumber(env['MAX_DAILY_LOSS_USD'], 2),
      maxDrawdownPercent: parseNumber(env['MAX_DRAWDOWN_PERCENT'], 10),
      minArbitrageSpreadBps: parseNumber(env['MIN_ARBITRAGE_SPREAD_BPS'], 5),
      crossPlatformSpreadBuffer: parseNumber(env['CROSS_PLATFORM_SPREAD_BUFFER'], 0.15),
    },

    trading: {
      paperTrading: parseBoolean(env['PAPER_TRADING'], true),
      paperTradingBalance: parseNumber(env['PAPER_TRADING_BALANCE'], 10000),
      executionTimeoutMs: parseNumber(env['EXECUTION_TIMEOUT_MS'], 5000),
      orderRetryAttempts: parseNumber(env['ORDER_RETRY_ATTEMPTS'], 3),
      orderRetryDelayMs: parseNumber(env['ORDER_RETRY_DELAY_MS'], 1000),
    },

    api: {
      port: parseNumber(env['API_PORT'], 3000),
      metricsPort: parseNumber(env['METRICS_PORT'], 9090),
      secret: env['API_SECRET'],
      enableMetrics: parseBoolean(env['ENABLE_METRICS'], true),
    },

    features: {
      enableCrossPlatformArb: parseBoolean(env['ENABLE_CROSS_PLATFORM_ARB'], true),
      enableSinglePlatformArb: parseBoolean(env['ENABLE_SINGLE_PLATFORM_ARB'], true),
      enableMarketMaking: parseBoolean(env['ENABLE_MARKET_MAKING'], false),
      enableWebSocket: parseBoolean(env['ENABLE_WEBSOCKET'], true),
      // Technical analysis strategies
      enableMomentumStrategy: parseBoolean(env['ENABLE_MOMENTUM_STRATEGY'], true),
      enableMeanReversionStrategy: parseBoolean(env['ENABLE_MEAN_REVERSION_STRATEGY'], true),
      enableOrderbookImbalanceStrategy: parseBoolean(env['ENABLE_ORDERBOOK_IMBALANCE_STRATEGY'], true),
      enableSpreadHunterStrategy: parseBoolean(env['ENABLE_SPREAD_HUNTER_STRATEGY'], true),
      // Prediction market-specific strategies (don't need price history)
      enableProbabilitySumStrategy: parseBoolean(env['ENABLE_PROBABILITY_SUM_STRATEGY'], true),
      enableEndgameStrategy: parseBoolean(env['ENABLE_ENDGAME_STRATEGY'], true),
    },

    strategies: {
      // Lowered thresholds for prediction markets (less volatile than stocks)
      momentumMinMomentum: parseNumber(env['MOMENTUM_MIN_MOMENTUM'], 0.15), // Was 0.4
      momentumMinChangePercent: parseNumber(env['MOMENTUM_MIN_CHANGE_PERCENT'], 0.5), // Was 2
      meanReversionMinDeviation: parseNumber(env['MEAN_REVERSION_MIN_DEVIATION'], 1.0), // Was 3
      meanReversionMaxDeviation: parseNumber(env['MEAN_REVERSION_MAX_DEVIATION'], 15),
      orderbookImbalanceRatio: parseNumber(env['ORDERBOOK_IMBALANCE_RATIO'], 1.5), // Was 2
      // Spread hunter strategy
      spreadHunterMinSpreadPercent: parseNumber(env['SPREAD_HUNTER_MIN_SPREAD_PERCENT'], 2.0),
      spreadHunterMaxSpreadPercent: parseNumber(env['SPREAD_HUNTER_MAX_SPREAD_PERCENT'], 15.0),
      spreadHunterMinBidSize: parseNumber(env['SPREAD_HUNTER_MIN_BID_SIZE'], 10),
      spreadHunterMinAskSize: parseNumber(env['SPREAD_HUNTER_MIN_ASK_SIZE'], 10),
      // Prediction market-specific strategies - updated defaults
      probabilitySumMinMispricingPercent: parseNumber(env['PROBABILITY_SUM_MIN_MISPRICING'], 0.3), // Was 0.5
      endgameMinProbability: parseNumber(env['ENDGAME_MIN_PROBABILITY'], 0.70), // Was 0.90
      endgameMaxHoursToResolution: parseNumber(env['ENDGAME_MAX_HOURS'], 720), // 30 days (was 168 = 1 week)
      endgameMinAnnualizedReturn: parseNumber(env['ENDGAME_MIN_ANNUALIZED_RETURN'], 10), // 10% (was 50%)
      // Volatility capture strategy
      volatilityCaptureMinDropPercent: parseNumber(env['VOLATILITY_CAPTURE_MIN_DROP_PERCENT'], 10.0),
      volatilityCaptureMaxDropPercent: parseNumber(env['VOLATILITY_CAPTURE_MAX_DROP_PERCENT'], 50.0),
      volatilityCaptureWindowMinutes: parseNumber(env['VOLATILITY_CAPTURE_WINDOW_MINUTES'], 2),
      // Position sizing & cooldowns - updated defaults
      maxPositionSize: parseNumber(env['STRATEGY_MAX_POSITION_SIZE'], 100), // Increased from 5
      minPositionSize: parseNumber(env['STRATEGY_MIN_POSITION_SIZE'], 10), // Increased from 1
      signalCooldownMs: parseNumber(env['STRATEGY_SIGNAL_COOLDOWN_MS'], 120000), // 2 minutes (reduced from 5 min)
      postTradeCooldownMs: parseNumber(env['POST_TRADE_COOLDOWN_MS'], 300000), // 5 minutes (reduced from 10 min)
    },

    anthropic: {
      apiKey: env['ANTHROPIC_API_KEY'],
      model: env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-20250514',
      maxTokens: parseNumber(env['ANTHROPIC_MAX_TOKENS'], 1024),
    },

    copyTrading: {
      enabled: parseBoolean(env['COPY_TRADING_ENABLED'], false),
      // Monitoring settings
      pollIntervalMs: parseNumber(env['COPY_TRADING_POLL_INTERVAL_MS'], 5000),
      useWebSocket: parseBoolean(env['COPY_TRADING_USE_WEBSOCKET'], true),
      // Copy execution settings
      copyDelayMs: parseNumber(env['COPY_TRADING_COPY_DELAY_MS'], 1000),
      maxConcurrentCopies: parseNumber(env['COPY_TRADING_MAX_CONCURRENT'], 3),
      maxSlippagePercent: parseNumber(env['COPY_TRADING_MAX_SLIPPAGE'], 2),
      // Default position sizing
      defaultSizingStrategy: (env['COPY_TRADING_SIZING_STRATEGY'] as 'PERCENTAGE' | 'FIXED' | 'ADAPTIVE') || 'PERCENTAGE',
      defaultMultiplier: parseNumber(env['COPY_TRADING_MULTIPLIER'], 1.0),
      defaultCopyPercentage: parseNumber(env['COPY_TRADING_COPY_PERCENTAGE'], 10),
      defaultMaxPositionSize: parseNumber(env['COPY_TRADING_MAX_POSITION_SIZE'], 100),
      defaultMinTradeSize: parseNumber(env['COPY_TRADING_MIN_TRADE_SIZE'], 1),
      // Aggregation settings
      aggregationEnabled: parseBoolean(env['COPY_TRADING_AGGREGATION_ENABLED'], true),
      aggregationWindowMs: parseNumber(env['COPY_TRADING_AGGREGATION_WINDOW_MS'], 30000),
      aggregationMinTrades: parseNumber(env['COPY_TRADING_AGGREGATION_MIN_TRADES'], 2),
      // Risk limits
      maxTotalCopyExposure: parseNumber(env['COPY_TRADING_MAX_EXPOSURE'], 1000),
      maxPositionsPerTrader: parseNumber(env['COPY_TRADING_MAX_POSITIONS_PER_TRADER'], 10),
      // Tiered multipliers (parsed from JSON string if provided)
      defaultTieredMultipliers: parseTieredMultipliers(env['COPY_TRADING_TIERED_MULTIPLIERS']),
    },

    traderDiscovery: {
      enabled: parseBoolean(env['TRADER_DISCOVERY_ENABLED'], false),
      // Data source settings
      polymarketDataApiUrl: env['TRADER_DISCOVERY_DATA_API_URL'] || 'https://data-api.polymarket.com',
      // Analysis settings
      minTradesForAnalysis: parseNumber(env['TRADER_DISCOVERY_MIN_TRADES'], 10),
      minActiveDays: parseNumber(env['TRADER_DISCOVERY_MIN_ACTIVE_DAYS'], 7),
      analysisTimeframeDays: parseNumber(env['TRADER_DISCOVERY_TIMEFRAME_DAYS'], 30),
      maxTradesLimit: parseNumber(env['TRADER_DISCOVERY_MAX_TRADES_LIMIT'], 5000),
      // Ranking weights
      roiWeight: parseNumber(env['TRADER_DISCOVERY_ROI_WEIGHT'], 0.3),
      winRateWeight: parseNumber(env['TRADER_DISCOVERY_WIN_RATE_WEIGHT'], 0.25),
      profitFactorWeight: parseNumber(env['TRADER_DISCOVERY_PROFIT_FACTOR_WEIGHT'], 0.25),
      consistencyWeight: parseNumber(env['TRADER_DISCOVERY_CONSISTENCY_WEIGHT'], 0.2),
      // Ranking filters
      minWinRate: parseNumber(env['TRADER_DISCOVERY_MIN_WIN_RATE'], 0.5),
      minRoi: parseNumber(env['TRADER_DISCOVERY_MIN_ROI'], -50),
      maxDrawdown: parseNumber(env['TRADER_DISCOVERY_MAX_DRAWDOWN'], 50),
      // Cache settings
      cacheExpirationMs: parseNumber(env['TRADER_DISCOVERY_CACHE_EXPIRATION_MS'], 3600000),
      maxCachedTraders: parseNumber(env['TRADER_DISCOVERY_MAX_CACHED_TRADERS'], 1000),
      // Simulation defaults
      defaultSimulationDays: parseNumber(env['TRADER_DISCOVERY_SIMULATION_DAYS'], 30),
      defaultSimulationCapital: parseNumber(env['TRADER_DISCOVERY_SIMULATION_CAPITAL'], 10000),
      defaultSimulationSlippage: parseNumber(env['TRADER_DISCOVERY_SIMULATION_SLIPPAGE'], 0.5),
    },

    healthMonitoring: {
      enabled: parseBoolean(env['HEALTH_MONITORING_ENABLED'], true),
      // Check intervals
      checkIntervalMs: parseNumber(env['HEALTH_CHECK_INTERVAL_MS'], 30000),
      // Timeouts
      dbTimeoutMs: parseNumber(env['HEALTH_DB_TIMEOUT_MS'], 5000),
      rpcTimeoutMs: parseNumber(env['HEALTH_RPC_TIMEOUT_MS'], 10000),
      apiTimeoutMs: parseNumber(env['HEALTH_API_TIMEOUT_MS'], 10000),
      // Balance thresholds
      minBalanceWarning: parseNumber(env['HEALTH_MIN_BALANCE_WARNING'], 10),
      minBalanceCritical: parseNumber(env['HEALTH_MIN_BALANCE_CRITICAL'], 1),
      // File logging
      enableFileLogging: parseBoolean(env['HEALTH_FILE_LOGGING_ENABLED'], true),
      logFilePath: env['HEALTH_LOG_FILE_PATH'] || './logs',
      logRotationDays: parseNumber(env['HEALTH_LOG_ROTATION_DAYS'], 7),
      maxLogFiles: parseNumber(env['HEALTH_MAX_LOG_FILES'], 30),
      logMaxSizeMb: parseNumber(env['HEALTH_LOG_MAX_SIZE_MB'], 50),
      // Console output
      enableConsoleProgress: parseBoolean(env['HEALTH_CONSOLE_PROGRESS'], true),
      enableColoredOutput: parseBoolean(env['HEALTH_COLORED_OUTPUT'], true),
    },
  };
}

/**
 * Validate and load configuration
 */
function loadConfig(): Config {
  const rawConfig = buildConfigFromEnv();

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
      throw new Error(`Configuration validation failed:\n${issues}`);
    }
    throw error;
  }
}

// Singleton config instance
let configInstance: Config | null = null;

/**
 * Get the configuration instance (lazy loaded)
 */
export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reload configuration from environment (useful for testing)
 */
export function reloadConfig(): Config {
  configInstance = loadConfig();
  return configInstance;
}

/**
 * Validate that required credentials are present for a platform
 */
export function validateCredentials(platform: 'polymarket' | 'kalshi'): { valid: boolean; missing: string[]; hasL2Creds?: boolean } {
  const config = getConfig();
  const missing: string[] = [];

  if (platform === 'polymarket') {
    if (!config.polymarket.privateKey) {
      missing.push('POLYMARKET_PRIVATE_KEY');
    }
    // Check for L2 API credentials (optional but recommended for live trading)
    const hasL2Creds = !!(config.polymarket.apiKey && config.polymarket.apiSecret && config.polymarket.apiPassphrase);
    return {
      valid: missing.length === 0,
      missing,
      hasL2Creds,
    };
  } else if (platform === 'kalshi') {
    if (!config.kalshi.apiKeyId) {
      missing.push('KALSHI_API_KEY_ID');
    }
    if (!config.kalshi.privateKeyPath && !config.kalshi.privateKeyPem) {
      missing.push('KALSHI_PRIVATE_KEY_PATH or KALSHI_PRIVATE_KEY_PEM');
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Check if running in paper trading mode
 */
export function isPaperTrading(): boolean {
  return getConfig().trading.paperTrading;
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof Config['features']): boolean {
  return getConfig().features[feature];
}

// Re-export types and constants
export * from './schema.js';
export * from './constants.js';
