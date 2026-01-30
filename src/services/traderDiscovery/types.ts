/**
 * Trader Discovery Service Type Definitions
 *
 * This module defines types for discovering and analyzing profitable traders,
 * including performance metrics, ranking systems, and simulation parameters.
 */

import type { SizingStrategy, DetectedTrade } from '../copyTrading/types.js';

/**
 * Trader performance metrics
 */
export interface TraderPerformance {
  address: string;
  name?: string;
  // Trade counts
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  // Volume and size
  totalVolume: number; // Total USD traded
  avgTradeSize: number;
  largestTrade: number;
  smallestTrade: number;
  // P&L metrics
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  // Percentage metrics
  winRate: number; // 0-1
  roi: number; // Return on investment as percentage
  profitFactor: number; // Gross profit / gross loss
  // Risk metrics
  sharpeRatio: number;
  sortinoRatio?: number;
  maxDrawdown: number; // Maximum drawdown as percentage
  maxDrawdownUsd: number;
  avgDrawdown: number;
  // Time metrics
  activeDays: number;
  avgTradesPerDay: number;
  avgHoldingPeriodHours: number;
  // Current state
  openPositions: number;
  currentExposure: number;
  // Timestamps
  firstTradeAt: Date;
  lastTradeAt: Date;
  // Profile metadata
  profileUrl?: string;
  bio?: string;
  profileImage?: string;
}

/**
 * Trader ranking criteria with weights
 */
export interface RankingCriteria {
  // Weights (should sum to 1.0)
  roiWeight: number;
  winRateWeight: number;
  profitFactorWeight: number;
  consistencyWeight: number; // Based on Sharpe ratio and drawdown
  volumeWeight?: number;
  // Filters (traders not meeting these are excluded)
  minTrades: number;
  minActiveDays: number;
  minWinRate: number;
  minRoi: number;
  maxDrawdown: number;
  // Optional filters
  minVolume?: number;
  maxAvgTradeSize?: number;
  minProfitFactor?: number;
}

/**
 * Ranked trader result
 */
export interface RankedTrader {
  rank: number;
  address: string;
  name?: string;
  performance: TraderPerformance;
  rankScore: number; // Composite score 0-100
  // Score breakdown
  scores: {
    roi: number;
    winRate: number;
    profitFactor: number;
    consistency: number;
    volume?: number;
  };
  // Recommendation
  recommendation: 'highly_recommended' | 'recommended' | 'neutral' | 'caution' | 'not_recommended';
  notes?: string;
}

/**
 * Simulation parameters for copy trading backtesting
 */
export interface SimulationParams {
  // Trader to simulate
  traderAddress: string;
  // Time period
  startDate: Date;
  endDate: Date;
  // Capital settings
  initialCapital: number;
  // Position sizing
  sizingStrategy: SizingStrategy;
  copyPercentage: number; // For PERCENTAGE strategy
  fixedAmount?: number; // For FIXED strategy
  multiplier: number;
  maxPositionSize: number;
  minTradeSize: number;
  // Slippage simulation
  includeSlippage: boolean;
  slippagePercent: number;
  // Fees
  includeFees: boolean;
  makerFeePercent: number;
  takerFeePercent: number;
}

/**
 * Individual simulated trade result
 */
export interface SimulatedTradeResult {
  originalTrade: DetectedTrade;
  // Simulated execution
  copiedSize: number;
  entryPrice: number;
  exitPrice?: number;
  // P&L
  pnl: number;
  pnlPercent: number;
  // Status
  wasSkipped: boolean;
  skipReason?: string;
  // Timing
  holdingPeriodHours?: number;
}

/**
 * Equity curve data point
 */
export interface EquityPoint {
  timestamp: Date;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
}

/**
 * Position snapshot for simulation
 */
export interface PositionSnapshot {
  timestamp: Date;
  marketId: string;
  outcomeId: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

/**
 * Complete simulation result
 */
export interface SimulationResult {
  id: string;
  params: SimulationParams;
  // Summary metrics
  finalCapital: number;
  totalPnl: number;
  roi: number;
  // Trade metrics
  totalTrades: number;
  copiedTrades: number;
  skippedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  // Risk metrics
  maxDrawdown: number;
  maxDrawdownUsd: number;
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  // Trade stats
  avgTradeProfit: number;
  avgWinningTrade: number;
  avgLosingTrade: number;
  largestWin: number;
  largestLoss: number;
  // Time-weighted metrics
  avgHoldingPeriodHours: number;
  // Detailed results
  tradeResults: SimulatedTradeResult[];
  equityCurve: EquityPoint[];
  positionSnapshots: PositionSnapshot[];
  // Metadata
  simulatedAt: Date;
  executionTimeMs: number;
}

/**
 * Trader discovery filter options
 */
export interface DiscoveryFilter {
  // Activity filters
  minVolume?: number;
  minTrades?: number;
  minActiveDays?: number;
  timeframeDays?: number;
  // Performance filters
  minWinRate?: number;
  minRoi?: number;
  minProfitFactor?: number;
  maxDrawdown?: number;
  // Current state filters
  minOpenPositions?: number;
  maxOpenPositions?: number;
  // Pagination
  limit?: number;
  offset?: number;
}

/**
 * Cache entry for trader data
 */
export interface TraderCacheEntry {
  address: string;
  performance: TraderPerformance;
  recentTrades: DetectedTrade[];
  cachedAt: Date;
  expiresAt: Date;
}

/**
 * Trader discovery service state
 */
export interface TraderDiscoveryState {
  isScanning: boolean;
  lastScanAt?: Date;
  tradersAnalyzed: number;
  tradersInCache: number;
  scanProgress?: {
    current: number;
    total: number;
    currentTrader?: string;
  };
}

/**
 * Batch simulation request
 */
export interface BatchSimulationRequest {
  traderAddresses: string[];
  params: Omit<SimulationParams, 'traderAddress'>;
}

/**
 * Batch simulation result
 */
export interface BatchSimulationResult {
  results: Map<string, SimulationResult>;
  rankings: RankedTrader[];
  summary: {
    bestTrader: string;
    bestRoi: number;
    avgRoi: number;
    totalSimulationTimeMs: number;
  };
}

/**
 * Trader discovery events
 */
export interface TraderDiscoveryEvents {
  // Discovery events
  scanStarted: () => void;
  scanProgress: (progress: { current: number; total: number; trader: string }) => void;
  scanCompleted: (results: RankedTrader[]) => void;
  traderAnalyzed: (performance: TraderPerformance) => void;
  // Simulation events
  simulationStarted: (params: SimulationParams) => void;
  simulationCompleted: (result: SimulationResult) => void;
  batchSimulationCompleted: (result: BatchSimulationResult) => void;
  // Cache events
  cacheHit: (address: string) => void;
  cacheMiss: (address: string) => void;
  cacheUpdated: (address: string) => void;
  // Error events
  error: (error: Error, context?: Record<string, unknown>) => void;
}

/**
 * Trade history fetch options
 */
export interface TradeHistoryOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  type?: 'TRADE' | 'all';
}

/**
 * Market category for filtering traders
 */
export type MarketCategory =
  | 'politics'
  | 'crypto'
  | 'sports'
  | 'science'
  | 'culture'
  | 'business'
  | 'other';

/**
 * Trader specialization analysis
 */
export interface TraderSpecialization {
  categories: Map<MarketCategory, number>; // Category -> trade count
  primaryCategory: MarketCategory;
  diversificationScore: number; // 0-1, higher = more diversified
}
