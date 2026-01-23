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
      // Default to GNOSIS for browser wallet users with proxy wallets
      signatureType: env['POLYMARKET_SIGNATURE_TYPE'] || 'GNOSIS',
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
      // Prediction market-specific strategies
      probabilitySumMinMispricingPercent: parseNumber(env['PROBABILITY_SUM_MIN_MISPRICING'], 0.5),
      endgameMinProbability: parseNumber(env['ENDGAME_MIN_PROBABILITY'], 0.90),
      endgameMaxHoursToResolution: parseNumber(env['ENDGAME_MAX_HOURS'], 168),
      endgameMinAnnualizedReturn: parseNumber(env['ENDGAME_MIN_ANNUALIZED_RETURN'], 50),
      // Position sizing & cooldowns (conservative defaults for small balances)
      maxPositionSize: parseNumber(env['STRATEGY_MAX_POSITION_SIZE'], 5),
      minPositionSize: parseNumber(env['STRATEGY_MIN_POSITION_SIZE'], 1),
      signalCooldownMs: parseNumber(env['STRATEGY_SIGNAL_COOLDOWN_MS'], 300000), // 5 minutes (was 30s)
      postTradeCooldownMs: parseNumber(env['POST_TRADE_COOLDOWN_MS'], 600000), // 10 minutes anti-churn
    },

    anthropic: {
      apiKey: env['ANTHROPIC_API_KEY'],
      model: env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-20250514',
      maxTokens: parseNumber(env['ANTHROPIC_MAX_TOKENS'], 1024),
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
