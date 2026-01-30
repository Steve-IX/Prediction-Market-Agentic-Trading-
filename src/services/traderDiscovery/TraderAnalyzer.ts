/**
 * Trader Analyzer
 *
 * Analyzes trader performance by fetching trade history from Polymarket's data API
 * and calculating comprehensive metrics including P&L, win rate, risk metrics, etc.
 *
 * Flow:
 * 1. Fetch trade history from data API
 * 2. Group trades by market/outcome
 * 3. Calculate position-level P&L
 * 4. Aggregate into performance metrics
 */

import axios, { type AxiosInstance } from 'axios';
import type {
  TraderPerformance,
  TradeHistoryOptions,
  TraderSpecialization,
  MarketCategory,
} from './types.js';
import type { DetectedTrade, PolymarketActivity, PolymarketPosition } from '../copyTrading/types.js';
import { createComponentLogger } from '../../utils/logger.js';
import * as metrics from '../../utils/metrics.js';

const log = createComponentLogger('TraderAnalyzer');

/**
 * Analyzer configuration
 */
export interface TraderAnalyzerConfig {
  dataApiUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  defaultTimeframeDays: number;
}

const DEFAULT_CONFIG: TraderAnalyzerConfig = {
  dataApiUrl: 'https://data-api.polymarket.com',
  requestTimeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
  defaultTimeframeDays: 30,
};

/**
 * Position for P&L calculation
 */
interface CalculatedPosition {
  marketId: string;
  outcomeId: string;
  side: 'long' | 'short';
  entryPrice: number;
  avgEntryPrice: number;
  size: number;
  totalCost: number;
  totalProceeds: number;
  realizedPnl: number;
  trades: DetectedTrade[];
  isOpen: boolean;
  enteredAt: Date;
  exitedAt?: Date;
}

/**
 * Trader Analyzer service
 */
export class TraderAnalyzer {
  private config: TraderAnalyzerConfig;
  private httpClient: AxiosInstance;

  constructor(config: Partial<TraderAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.httpClient = axios.create({
      baseURL: this.config.dataApiUrl,
      timeout: this.config.requestTimeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }

  /**
   * Fetch trader's trade history from Polymarket data API
   */
  async fetchTradeHistory(
    address: string,
    options: TradeHistoryOptions = {}
  ): Promise<DetectedTrade[]> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get<PolymarketActivity[]>('/activity', {
        params: {
          user: address.toLowerCase(),
          type: options.type || 'TRADE',
          limit: options.limit || 1000,
          offset: options.offset || 0,
        },
      });

      const latencyMs = Date.now() - startTime;
      metrics.traderDiscoveryApiCalls.labels('activity').inc();
      metrics.traderDiscoveryApiLatency.labels('activity').observe(latencyMs);

      const activities = response.data || [];

      // Filter by date range if specified
      let filtered = activities;
      if (options.startDate || options.endDate) {
        filtered = activities.filter((a) => {
          const tradeDate = new Date(a.timestamp * 1000);
          if (options.startDate && tradeDate < options.startDate) return false;
          if (options.endDate && tradeDate > options.endDate) return false;
          return true;
        });
      }

      // Convert to DetectedTrade format
      return filtered.map((activity) => this.activityToDetectedTrade(activity, address));
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      metrics.traderDiscoveryApiLatency.labels('activity').observe(latencyMs);

      if (axios.isAxiosError(error)) {
        log.error('Failed to fetch trade history', {
          address: address.slice(0, 10) + '...',
          status: error.response?.status,
          message: error.message,
        });
      }
      throw error;
    }
  }

  /**
   * Fetch trader's current positions
   */
  async fetchPositions(address: string): Promise<PolymarketPosition[]> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get<PolymarketPosition[]>('/positions', {
        params: {
          user: address.toLowerCase(),
        },
      });

      const latencyMs = Date.now() - startTime;
      metrics.traderDiscoveryApiCalls.labels('positions').inc();
      metrics.traderDiscoveryApiLatency.labels('positions').observe(latencyMs);

      return response.data || [];
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      metrics.traderDiscoveryApiLatency.labels('positions').observe(latencyMs);

      if (axios.isAxiosError(error)) {
        log.error('Failed to fetch positions', {
          address: address.slice(0, 10) + '...',
          status: error.response?.status,
        });
      }
      throw error;
    }
  }

  /**
   * Fetch trader profile information
   */
  async fetchProfile(address: string): Promise<{
    name?: string;
    bio?: string;
    profileImage?: string;
    profileUrl: string;
  }> {
    try {
      const response = await this.httpClient.get<{
        name?: string;
        bio?: string;
        profileImage?: string;
      }>(`/users/${address.toLowerCase()}`);

      const result: {
        name?: string;
        bio?: string;
        profileImage?: string;
        profileUrl: string;
      } = {
        profileUrl: `https://polymarket.com/profile/${address}`,
      };
      if (response.data?.name) {
        result.name = response.data.name;
      }
      if (response.data?.bio) {
        result.bio = response.data.bio;
      }
      if (response.data?.profileImage) {
        result.profileImage = response.data.profileImage;
      }
      return result;
    } catch {
      // Profile fetch is optional, return defaults
      const result: {
        name?: string;
        bio?: string;
        profileImage?: string;
        profileUrl: string;
      } = {
        profileUrl: `https://polymarket.com/profile/${address}`,
      };
      return result;
    }
  }

  /**
   * Analyze trader and generate comprehensive performance metrics
   */
  async analyzeTrader(
    address: string,
    timeframeDays: number = this.config.defaultTimeframeDays
  ): Promise<TraderPerformance> {
    const startTime = Date.now();
    const normalizedAddress = address.toLowerCase();

    log.info('Analyzing trader', {
      address: normalizedAddress.slice(0, 10) + '...',
      timeframeDays,
    });

    // Fetch data in parallel
    const startDate = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000);
    const [trades, currentPositions, profile] = await Promise.all([
      this.fetchTradeHistory(normalizedAddress, { startDate }),
      this.fetchPositions(normalizedAddress),
      this.fetchProfile(normalizedAddress),
    ]);

    // Calculate positions and P&L
    const calculatedPositions = this.calculatePositions(trades);

    // Calculate metrics
    const performance = this.calculatePerformanceMetrics(
      normalizedAddress,
      trades,
      calculatedPositions,
      currentPositions,
      profile
    );

    const executionTimeMs = Date.now() - startTime;
    metrics.traderDiscoveryApiLatency.labels('analysis').observe(executionTimeMs);
    metrics.traderDiscoveryApiCalls.labels('analysis').inc();

    log.info('Trader analysis complete', {
      address: normalizedAddress.slice(0, 10) + '...',
      totalTrades: performance.totalTrades,
      roi: performance.roi.toFixed(2) + '%',
      winRate: (performance.winRate * 100).toFixed(1) + '%',
      executionTimeMs,
    });

    return performance;
  }

  /**
   * Convert Polymarket activity to DetectedTrade
   */
  private activityToDetectedTrade(activity: PolymarketActivity, address: string): DetectedTrade {
    return {
      id: activity.id || activity.transactionHash,
      traderAddress: address.toLowerCase(),
      transactionHash: activity.transactionHash,
      marketId: activity.conditionId,
      outcomeId: activity.asset,
      outcomeName: activity.outcome,
      marketTitle: activity.title,
      marketSlug: activity.slug,
      side: activity.side as 'BUY' | 'SELL',
      price: activity.price,
      size: activity.size,
      usdcSize: activity.usdcSize,
      timestamp: new Date(activity.timestamp * 1000),
    };
  }

  /**
   * Calculate positions from trade history
   */
  private calculatePositions(trades: DetectedTrade[]): CalculatedPosition[] {
    // Group trades by market + outcome
    const positionMap = new Map<string, CalculatedPosition>();

    // Sort trades by timestamp (oldest first)
    const sortedTrades = [...trades].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    for (const trade of sortedTrades) {
      const key = `${trade.marketId}:${trade.outcomeId}`;
      let position = positionMap.get(key);

      if (!position) {
        position = {
          marketId: trade.marketId,
          outcomeId: trade.outcomeId,
          side: 'long',
          entryPrice: 0,
          avgEntryPrice: 0,
          size: 0,
          totalCost: 0,
          totalProceeds: 0,
          realizedPnl: 0,
          trades: [],
          isOpen: false,
          enteredAt: trade.timestamp,
        };
        positionMap.set(key, position);
      }

      position.trades.push(trade);

      if (trade.side === 'BUY') {
        // Opening or adding to position
        const newTotalCost = position.totalCost + trade.usdcSize;
        const newSize = position.size + trade.size;
        position.avgEntryPrice = newTotalCost / newSize;
        position.size = newSize;
        position.totalCost = newTotalCost;
        position.isOpen = true;

        if (position.trades.length === 1) {
          position.entryPrice = trade.price;
          position.enteredAt = trade.timestamp;
        }
      } else {
        // Closing or reducing position
        const sizeToClose = Math.min(trade.size, position.size);
        const costBasis = sizeToClose * position.avgEntryPrice;
        const proceeds = trade.usdcSize;
        const pnl = proceeds - costBasis;

        position.realizedPnl += pnl;
        position.totalProceeds += proceeds;
        position.size = Math.max(0, position.size - sizeToClose);

        if (position.size < 0.0001) {
          position.isOpen = false;
          position.exitedAt = trade.timestamp;
        }
      }
    }

    return Array.from(positionMap.values());
  }

  /**
   * Calculate comprehensive performance metrics
   */
  private calculatePerformanceMetrics(
    address: string,
    trades: DetectedTrade[],
    positions: CalculatedPosition[],
    currentPositions: PolymarketPosition[],
    profile: { name?: string; bio?: string; profileImage?: string; profileUrl: string }
  ): TraderPerformance {
    // Basic trade counts
    const totalTrades = trades.length;

    // Volume metrics
    const totalVolume = trades.reduce((sum, t) => sum + t.usdcSize, 0);
    const tradeSizes = trades.map((t) => t.usdcSize);
    const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;
    const largestTrade = tradeSizes.length > 0 ? Math.max(...tradeSizes) : 0;
    const smallestTrade = tradeSizes.length > 0 ? Math.min(...tradeSizes) : 0;

    // P&L calculation
    const closedPositions = positions.filter((p) => !p.isOpen);

    const realizedPnl = closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0);

    // Calculate unrealized P&L from current positions
    let unrealizedPnl = 0;
    for (const pos of currentPositions) {
      const currentValue = pos.size * pos.curPrice;
      const costBasis = pos.size * pos.avgPrice;
      unrealizedPnl += currentValue - costBasis;
    }

    const totalPnl = realizedPnl + unrealizedPnl;

    // Win/Loss metrics
    const winningPositions = closedPositions.filter((p) => p.realizedPnl > 0);
    const losingPositions = closedPositions.filter((p) => p.realizedPnl < 0);
    const winningTrades = winningPositions.length;
    const losingTrades = losingPositions.length;

    const winRate =
      closedPositions.length > 0 ? winningPositions.length / closedPositions.length : 0;

    // Profit factor
    const grossProfit = winningPositions.reduce((sum, p) => sum + p.realizedPnl, 0);
    const grossLoss = Math.abs(losingPositions.reduce((sum, p) => sum + p.realizedPnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // ROI calculation
    const totalInvested = positions.reduce((sum, p) => sum + p.totalCost, 0);
    const roi = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    // Risk metrics - Drawdown calculation
    const { maxDrawdown, maxDrawdownUsd, avgDrawdown, sharpeRatio, sortinoRatio } =
      this.calculateRiskMetrics(positions, trades);

    // Time metrics
    const timestamps = trades.map((t) => t.timestamp.getTime());
    const firstTradeAt = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date();
    const lastTradeAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date();

    const tradingDays = new Set(trades.map((t) => t.timestamp.toDateString())).size;
    const avgTradesPerDay = tradingDays > 0 ? totalTrades / tradingDays : 0;

    // Average holding period
    const holdingPeriods = closedPositions
      .filter((p) => p.exitedAt)
      .map((p) => (p.exitedAt!.getTime() - p.enteredAt.getTime()) / (1000 * 60 * 60));
    const avgHoldingPeriodHours =
      holdingPeriods.length > 0
        ? holdingPeriods.reduce((sum, h) => sum + h, 0) / holdingPeriods.length
        : 0;

    // Current state
    const openPositions = currentPositions.length;
    const currentExposure = currentPositions.reduce((sum, p) => sum + p.size * p.curPrice, 0);

    const performance: TraderPerformance = {
      address,
      totalTrades,
      winningTrades,
      losingTrades,
      totalVolume,
      avgTradeSize,
      largestTrade,
      smallestTrade,
      totalPnl,
      realizedPnl,
      unrealizedPnl,
      winRate,
      roi,
      profitFactor: Number.isFinite(profitFactor) ? profitFactor : 0,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      maxDrawdownUsd,
      avgDrawdown,
      activeDays: tradingDays,
      avgTradesPerDay,
      avgHoldingPeriodHours,
      openPositions,
      currentExposure,
      firstTradeAt,
      lastTradeAt,
      profileUrl: profile.profileUrl,
    };
    if (profile.name) {
      performance.name = profile.name;
    }
    if (profile.bio) {
      performance.bio = profile.bio;
    }
    if (profile.profileImage) {
      performance.profileImage = profile.profileImage;
    }
    return performance;
  }

  /**
   * Calculate risk metrics including drawdown and Sharpe ratio
   */
  private calculateRiskMetrics(
    _positions: CalculatedPosition[],
    trades: DetectedTrade[]
  ): {
    maxDrawdown: number;
    maxDrawdownUsd: number;
    avgDrawdown: number;
    sharpeRatio: number;
    sortinoRatio: number;
  } {
    // Build equity curve from trades
    const sortedTrades = [...trades].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    if (sortedTrades.length === 0) {
      return {
        maxDrawdown: 0,
        maxDrawdownUsd: 0,
        avgDrawdown: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
      };
    }

    // Calculate daily returns
    const dailyReturns: number[] = [];
    const equityCurve: number[] = [];
    let equity = 0;

    // Group trades by day
    const tradesByDay = new Map<string, DetectedTrade[]>();
    for (const trade of sortedTrades) {
      const dayKey = trade.timestamp.toDateString();
      if (!tradesByDay.has(dayKey)) {
        tradesByDay.set(dayKey, []);
      }
      tradesByDay.get(dayKey)!.push(trade);
    }

    // Calculate daily P&L
    let previousEquity = 0;
    for (const [, dayTrades] of tradesByDay) {
      const dayPnl = dayTrades.reduce((sum, t) => {
        // Simplified: treat sells as realizing profit/loss
        return sum + (t.side === 'SELL' ? t.usdcSize * 0.1 : -t.usdcSize * 0.02);
      }, 0);

      equity += dayPnl;
      equityCurve.push(equity);

      if (previousEquity !== 0) {
        const dailyReturn = (equity - previousEquity) / Math.abs(previousEquity);
        dailyReturns.push(dailyReturn);
      }
      previousEquity = equity;
    }

    // Calculate drawdown
    let maxEquity = 0;
    let maxDrawdownUsd = 0;
    let maxDrawdownPct = 0;
    const drawdowns: number[] = [];

    for (const eq of equityCurve) {
      if (eq > maxEquity) {
        maxEquity = eq;
      }

      const drawdownUsd = maxEquity - eq;
      const drawdownPct = maxEquity > 0 ? (drawdownUsd / maxEquity) * 100 : 0;

      drawdowns.push(drawdownPct);

      if (drawdownUsd > maxDrawdownUsd) {
        maxDrawdownUsd = drawdownUsd;
        maxDrawdownPct = drawdownPct;
      }
    }

    const avgDrawdown =
      drawdowns.length > 0 ? drawdowns.reduce((sum, d) => sum + d, 0) / drawdowns.length : 0;

    // Calculate Sharpe ratio (assuming risk-free rate of 0)
    const avgReturn =
      dailyReturns.length > 0
        ? dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length
        : 0;
    const returnVariance =
      dailyReturns.length > 1
        ? dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
          (dailyReturns.length - 1)
        : 0;
    const returnStdDev = Math.sqrt(returnVariance);

    const sharpeRatio = returnStdDev > 0 ? (avgReturn / returnStdDev) * Math.sqrt(252) : 0;

    // Calculate Sortino ratio (only considers downside deviation)
    const negativeReturns = dailyReturns.filter((r) => r < 0);
    const downsideVariance =
      negativeReturns.length > 1
        ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / (negativeReturns.length - 1)
        : 0;
    const downsideDeviation = Math.sqrt(downsideVariance);

    const sortinoRatio = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(252) : 0;

    return {
      maxDrawdown: maxDrawdownPct,
      maxDrawdownUsd,
      avgDrawdown,
      sharpeRatio: Number.isFinite(sharpeRatio) ? sharpeRatio : 0,
      sortinoRatio: Number.isFinite(sortinoRatio) ? sortinoRatio : 0,
    };
  }

  /**
   * Analyze trader's market category specialization
   */
  analyzeSpecialization(trades: DetectedTrade[]): TraderSpecialization {
    const categoryCounts = new Map<MarketCategory, number>();

    for (const trade of trades) {
      const category = this.categorizeMarket(trade.marketTitle || '', trade.marketSlug || '');
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }

    // Find primary category
    let primaryCategory: MarketCategory = 'other';
    let maxCount = 0;
    for (const [category, count] of categoryCounts) {
      if (count > maxCount) {
        maxCount = count;
        primaryCategory = category;
      }
    }

    // Calculate diversification score (entropy-based)
    const totalTrades = trades.length;
    let entropy = 0;
    for (const count of categoryCounts.values()) {
      const p = count / totalTrades;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize to 0-1 (max entropy is log2 of number of categories)
    const maxEntropy = Math.log2(7); // 7 categories
    const diversificationScore = maxEntropy > 0 ? entropy / maxEntropy : 0;

    return {
      categories: categoryCounts,
      primaryCategory,
      diversificationScore,
    };
  }

  /**
   * Categorize market based on title/slug
   */
  private categorizeMarket(title: string, slug: string): MarketCategory {
    const text = `${title} ${slug}`.toLowerCase();

    if (
      text.includes('president') ||
      text.includes('election') ||
      text.includes('trump') ||
      text.includes('biden') ||
      text.includes('democrat') ||
      text.includes('republican') ||
      text.includes('vote') ||
      text.includes('congress') ||
      text.includes('senate')
    ) {
      return 'politics';
    }

    if (
      text.includes('bitcoin') ||
      text.includes('btc') ||
      text.includes('ethereum') ||
      text.includes('eth') ||
      text.includes('crypto') ||
      text.includes('solana') ||
      text.includes('token')
    ) {
      return 'crypto';
    }

    if (
      text.includes('nfl') ||
      text.includes('nba') ||
      text.includes('soccer') ||
      text.includes('football') ||
      text.includes('basketball') ||
      text.includes('baseball') ||
      text.includes('sports') ||
      text.includes('championship')
    ) {
      return 'sports';
    }

    if (
      text.includes('climate') ||
      text.includes('science') ||
      text.includes('research') ||
      text.includes('study') ||
      text.includes('space') ||
      text.includes('nasa')
    ) {
      return 'science';
    }

    if (
      text.includes('movie') ||
      text.includes('music') ||
      text.includes('celebrity') ||
      text.includes('award') ||
      text.includes('oscars') ||
      text.includes('grammy')
    ) {
      return 'culture';
    }

    if (
      text.includes('stock') ||
      text.includes('company') ||
      text.includes('earnings') ||
      text.includes('market') ||
      text.includes('fed') ||
      text.includes('interest rate')
    ) {
      return 'business';
    }

    return 'other';
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TraderAnalyzerConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('Analyzer config updated', this.config);
  }
}

// Export singleton instance
export const traderAnalyzer = new TraderAnalyzer();
