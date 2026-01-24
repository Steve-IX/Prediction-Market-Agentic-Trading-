import { z } from 'zod';

// Polymarket configuration schema
const PolymarketConfigSchema = z.object({
  privateKey: z.string().optional(),
  // L2 API credentials - use these directly instead of deriving from private key
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  apiPassphrase: z.string().optional(),
  // Funder address - the proxy wallet where your USDC is held
  // This is the address shown in your Polymarket profile, NOT your EOA
  // Required for signature type GNOSIS (2) to correctly fetch balances
  funderAddress: z.string().optional(),
  chainId: z.number().default(137),
  host: z.string().default('https://clob.polymarket.com'),
  gammaHost: z.string().default('https://gamma-api.polymarket.com'),
  wsHost: z.string().default('wss://ws-subscriptions-clob.polymarket.com'),
  // Default to GNOSIS (type 2) since most users have proxy wallets from browser login
  signatureType: z.enum(['EOA', 'PROXY', 'GNOSIS']).default('GNOSIS'),
});

// Kalshi configuration schema
const KalshiConfigSchema = z.object({
  apiKeyId: z.string().optional(),
  privateKeyPath: z.string().optional(),
  privateKeyPem: z.string().optional(),
  environment: z.enum(['demo', 'prod']).default('demo'),
  host: z.string().optional(),
});

// Database configuration schema
const DatabaseConfigSchema = z.object({
  url: z.string().url(),
  poolSize: z.number().min(1).max(100).default(10),
});

// Redis configuration schema
const RedisConfigSchema = z.object({
  url: z.string().default('redis://localhost:6379'),
  enabled: z.boolean().default(false),
});

// Risk management configuration schema
const RiskConfigSchema = z.object({
  maxPositionSizeUsd: z.number().positive().default(10000),
  maxTotalExposureUsd: z.number().positive().default(50000),
  maxDailyLossUsd: z.number().positive().default(1000),
  maxDrawdownPercent: z.number().min(0).max(100).default(10),
  minArbitrageSpreadBps: z.number().min(0).default(5),
  crossPlatformSpreadBuffer: z.number().min(0).default(0.15),
});

// Trading configuration schema
const TradingConfigSchema = z.object({
  paperTrading: z.boolean().default(true),
  paperTradingBalance: z.number().positive().default(10000),
  executionTimeoutMs: z.number().positive().default(5000),
  orderRetryAttempts: z.number().min(0).max(10).default(3),
  orderRetryDelayMs: z.number().positive().default(1000),
});

// API configuration schema
const ApiConfigSchema = z.object({
  port: z.number().min(1).max(65535).default(3000),
  metricsPort: z.number().min(1).max(65535).default(9090),
  secret: z.string().optional(),
  enableMetrics: z.boolean().default(true),
});

// Feature flags schema
const FeatureFlagsSchema = z.object({
  enableCrossPlatformArb: z.boolean().default(true),
  enableSinglePlatformArb: z.boolean().default(true),
  enableMarketMaking: z.boolean().default(false),
  enableWebSocket: z.boolean().default(true),
  // Technical analysis strategies
  enableMomentumStrategy: z.boolean().default(true),
  enableMeanReversionStrategy: z.boolean().default(true),
  enableOrderbookImbalanceStrategy: z.boolean().default(true),
  enableSpreadHunterStrategy: z.boolean().default(true), // Targets illiquid markets with wide spreads
  enableVolatilityCaptureStrategy: z.boolean().default(false), // Captures rapid price movements (disabled by default)
  // Prediction market-specific strategies (don't need price history)
  enableProbabilitySumStrategy: z.boolean().default(true),
  enableEndgameStrategy: z.boolean().default(true),
});

// Strategy configuration schema
const StrategyConfigSchema = z.object({
  // Momentum strategy - lowered thresholds for prediction markets
  momentumMinMomentum: z.number().min(0).max(1).default(0.15), // Was 0.4
  momentumMinChangePercent: z.number().min(0).default(0.5), // Was 2

  // Mean reversion strategy - lowered thresholds for prediction markets
  meanReversionMinDeviation: z.number().min(0).default(1.0), // Was 3
  meanReversionMaxDeviation: z.number().min(0).default(15),

  // Orderbook imbalance strategy - lowered threshold
  orderbookImbalanceRatio: z.number().min(1).default(1.5), // Was 2

  // Spread hunter strategy (targets illiquid markets)
  spreadHunterMinSpreadPercent: z.number().min(0).default(2.0),
  spreadHunterMaxSpreadPercent: z.number().min(0).default(15.0),
  spreadHunterMinBidSize: z.number().min(0).default(10),
  spreadHunterMinAskSize: z.number().min(0).default(10),

  // Probability sum strategy - lowered threshold for prediction markets
  probabilitySumMinMispricingPercent: z.number().min(0).default(0.3), // Was 0.5

  // Endgame strategy - lowered thresholds for more opportunities
  endgameMinProbability: z.number().min(0).max(1).default(0.70), // Was 0.90
  endgameMaxHoursToResolution: z.number().positive().default(720), // 30 days (was 168 = 1 week)
  endgameMinAnnualizedReturn: z.number().positive().default(10), // 10% (was 50%)

  // Volatility capture strategy (NEW)
  volatilityCaptureMinDropPercent: z.number().min(0).default(10.0),
  volatilityCaptureMaxDropPercent: z.number().min(0).default(50.0),
  volatilityCaptureWindowMinutes: z.number().positive().default(2),

  // Position sizing
  maxPositionSize: z.number().positive().default(100),
  minPositionSize: z.number().positive().default(10),

  // Cooldowns - reduced for faster signal generation
  signalCooldownMs: z.number().positive().default(120000), // 2 minutes (reduced from 5 min)
  postTradeCooldownMs: z.number().positive().default(300000), // 5 minutes (reduced from 10 min)
});

// Anthropic configuration schema
const AnthropicConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().default('claude-sonnet-4-20250514'),
  maxTokens: z.number().positive().default(1024),
});

// Main configuration schema
export const ConfigSchema = z.object({
  env: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  polymarket: PolymarketConfigSchema,
  kalshi: KalshiConfigSchema,
  database: DatabaseConfigSchema,
  redis: RedisConfigSchema,
  risk: RiskConfigSchema,
  trading: TradingConfigSchema,
  api: ApiConfigSchema,
  features: FeatureFlagsSchema,
  strategies: StrategyConfigSchema,
  anthropic: AnthropicConfigSchema,
});

// Export types
export type Config = z.infer<typeof ConfigSchema>;
export type PolymarketConfig = z.infer<typeof PolymarketConfigSchema>;
export type KalshiConfig = z.infer<typeof KalshiConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type RiskConfig = z.infer<typeof RiskConfigSchema>;
export type TradingConfig = z.infer<typeof TradingConfigSchema>;
export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type StrategyConfig = z.infer<typeof StrategyConfigSchema>;
export type AnthropicConfig = z.infer<typeof AnthropicConfigSchema>;
