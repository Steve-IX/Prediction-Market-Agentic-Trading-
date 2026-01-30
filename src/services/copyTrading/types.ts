/**
 * Copy Trading Service Type Definitions
 *
 * This module defines all types used by the copy trading system including:
 * - Position sizing strategies
 * - Trade detection and execution
 * - Position tracking
 * - Service state management
 */

import type { NormalizedMarket } from '../../clients/shared/interfaces.js';

/**
 * Position sizing strategy types
 */
export type SizingStrategy = 'PERCENTAGE' | 'FIXED' | 'ADAPTIVE';

/**
 * Tiered multiplier configuration
 * Allows different multipliers based on trader's order size
 */
export interface TieredMultiplier {
  minSize: number; // Minimum trade size in USD (inclusive)
  maxSize: number; // Maximum trade size in USD (exclusive)
  multiplier: number; // Multiplier to apply (e.g., 0.5 = 50% of calculated size)
}

/**
 * Adaptive strategy parameters
 */
export interface AdaptiveParams {
  minPercent: number; // Minimum percentage for large trades
  maxPercent: number; // Maximum percentage for small trades
  thresholdUsd: number; // Threshold to trigger adaptation
}

/**
 * Copy trading configuration for a tracked trader
 */
export interface TraderCopyConfig {
  id?: string;
  address: string;
  name?: string;
  isActive: boolean;
  // Position sizing
  sizingStrategy: SizingStrategy;
  defaultMultiplier?: number;
  baseMultiplier?: number;
  copyPercentage?: number; // For PERCENTAGE strategy (default: 10)
  fixedCopyAmount?: number; // For FIXED strategy
  tieredMultipliers?: TieredMultiplier[];
  adaptiveParams?: AdaptiveParams;
  // Limits
  maxPositionSize?: number; // Max USD per trade (default: 100)
  minTradeSize?: number; // Min trade size to copy (default: 1)
  maxExposure?: number; // Max total exposure for this trader (default: 1000)
  maxPositionsPerMarket?: number; // Default: 5
  // Aggregation
  aggregation?: {
    enabled: boolean;
    windowMs: number;
    minTrades: number;
  };
  // Metadata
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Detected trade from a tracked trader
 */
export interface DetectedTrade {
  id: string;
  traderAddress: string;
  transactionHash?: string;
  // Market info
  marketId: string;
  outcomeId: string;
  outcomeName: string;
  marketTitle?: string;
  marketSlug?: string;
  // Trade details
  side: 'BUY' | 'SELL';
  price: number; // 0-1 normalized
  size: number; // Number of tokens/shares
  usdcSize: number; // USD value
  timestamp: Date;
  // Optional market data
  market?: NormalizedMarket;
}

/**
 * Aggregated trade (combined from multiple small trades)
 */
export interface AggregatedTrade {
  groupId: string;
  traderAddress: string;
  marketId: string;
  outcomeId: string;
  outcomeName: string;
  side: 'BUY' | 'SELL';
  avgPrice: number;
  totalSize: number; // Total tokens
  totalUsdcSize: number; // Total USD
  trades: DetectedTrade[];
  firstTradeAt: Date;
  lastTradeAt: Date;
  expiresAt: Date;
}

/**
 * Position sizing calculation result
 */
export interface SizingCalculation {
  traderOrderSize: number;
  baseAmount: number; // Before limits
  finalAmount: number; // After limits
  multiplierUsed: number;
  strategy: SizingStrategy;
  cappedByMax: boolean;
  reducedByBalance: boolean;
  belowMinimum: boolean;
  reasoning: string;
}

/**
 * Copy trade execution result
 */
export interface CopyTradeResult {
  success: boolean;
  originalTrade: DetectedTrade;
  // If successful
  copiedOrderId?: string;
  copiedPrice?: number;
  copiedSize?: number;
  copiedUsdcSize?: number;
  multiplierUsed?: number;
  sizingCalculation?: SizingCalculation;
  // Timing
  detectionLatencyMs?: number;
  executionLatencyMs?: number;
  // If failed or skipped
  error?: string;
  skippedReason?: string;
}

/**
 * Copy trading position for tracking
 * Tracks our positions from copied trades for accurate sell calculations
 */
export interface CopyPosition {
  id: string;
  traderId: string;
  traderAddress: string;
  // Market info
  marketId: string;
  outcomeId: string;
  outcomeName: string;
  marketTitle?: string;
  // Position
  side: 'long' | 'short';
  size: number; // Number of tokens
  avgEntryPrice: number;
  totalCost: number; // Total USD invested
  // Current values
  currentPrice?: number;
  currentValue?: number;
  unrealizedPnl?: number;
  percentPnl?: number;
  // Status
  isOpen: boolean;
  // P&L
  realizedPnl: number;
  // Trade history
  buyCount: number;
  sellCount: number;
  totalBought: number;
  totalSold: number;
  // Timestamps
  openedAt: Date;
  closedAt?: Date;
  updatedAt: Date;
}

/**
 * Copy trading service state
 */
export interface CopyTradingState {
  isRunning: boolean;
  isMonitoring: boolean;
  tradersMonitored: number;
  activeTraders: number;
  openPositions: number;
  // Aliases for backwards compatibility
  trackedTradersCount: number;
  activePositionsCount: number;
  totalCopiedTrades: number;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalExposure: number;
  lastTradeAt?: Date;
  lastErrorAt?: Date;
  lastError?: string;
  pendingAggregationsCount: number;
  // Health
  monitoringHealthy: boolean;
  executionHealthy: boolean;
}

/**
 * Copy trading service statistics
 */
export interface CopyTradingStats {
  // Overall
  totalCopiedTrades: number;
  successfulCopies: number;
  failedCopies: number;
  skippedTrades: number;
  // P&L
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  // Positions
  openPositions: number;
  closedPositions: number;
  totalExposure: number;
  // Timing
  avgDetectionLatencyMs: number;
  avgExecutionLatencyMs: number;
  // By trader
  statsByTrader: Map<string, {
    copiedTrades: number;
    pnl: number;
    winRate: number;
  }>;
}

/**
 * Copy trading service events
 */
export interface CopyTradingEvents {
  // Trade events
  tradeDetected: (trade: DetectedTrade) => void;
  tradeCopied: (result: CopyTradeResult) => void;
  tradeSkipped: (trade: DetectedTrade, reason: string) => void;
  tradeFailed: (trade: DetectedTrade, error: Error) => void;
  // Aggregation events
  tradeAddedToAggregation: (trade: DetectedTrade, group: AggregatedTrade) => void;
  aggregationExecuted: (group: AggregatedTrade, result: CopyTradeResult) => void;
  aggregationExpired: (group: AggregatedTrade) => void;
  // Position events
  positionOpened: (position: CopyPosition) => void;
  positionUpdated: (position: CopyPosition) => void;
  positionClosed: (position: CopyPosition, pnl: number) => void;
  // Trader events
  traderAdded: (config: TraderCopyConfig) => void;
  traderUpdated: (config: TraderCopyConfig) => void;
  traderRemoved: (address: string) => void;
  // Service events
  started: () => void;
  stopped: () => void;
  error: (error: Error, context?: Record<string, unknown>) => void;
}

/**
 * Polymarket activity from data API
 */
export interface PolymarketActivity {
  id: string;
  proxyWallet: string;
  timestamp: number;
  conditionId: string;
  type: 'TRADE' | 'REDEEM' | 'SPLIT' | 'MERGE';
  size: number;
  usdcSize: number;
  transactionHash: string;
  price: number;
  asset: string;
  side: 'BUY' | 'SELL';
  outcomeIndex: number;
  title: string;
  slug: string;
  icon?: string;
  eventSlug: string;
  outcome: string;
  name?: string;
  pseudonym?: string;
  bio?: string;
  profileImage?: string;
  profileImageOptimized?: string;
}

/**
 * Polymarket position from data API
 */
export interface PolymarketPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon?: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}

/**
 * Filter options for listing copied trades
 */
export interface CopiedTradesFilter {
  traderId?: string;
  marketId?: string;
  side?: 'BUY' | 'SELL';
  status?: 'pending' | 'executing' | 'executed' | 'failed' | 'skipped' | 'aggregated';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Filter options for listing copy positions
 */
export interface CopyPositionsFilter {
  traderId?: string;
  marketId?: string;
  isOpen?: boolean;
  side?: 'long' | 'short';
}
