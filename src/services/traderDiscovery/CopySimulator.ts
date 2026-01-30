/**
 * Copy Simulator
 *
 * Simulates copy trading to backtest profitability before committing real funds.
 * Replays historical trades with configurable position sizing and calculates
 * what the results would have been.
 *
 * Features:
 * - Historical trade replay
 * - Position sizing simulation (PERCENTAGE, FIXED, ADAPTIVE)
 * - Slippage and fee simulation
 * - Equity curve generation
 * - Risk metric calculation
 */

import { EventEmitter } from 'events';
import type {
  SimulationParams,
  SimulationResult,
  SimulatedTradeResult,
  EquityPoint,
  PositionSnapshot,
  BatchSimulationRequest,
  BatchSimulationResult,
} from './types.js';
import type { TraderCopyConfig } from '../copyTrading/types.js';
import { calculateOrderSizeForTrader } from '../copyTrading/PositionSizingStrategy.js';
import { TraderAnalyzer } from './TraderAnalyzer.js';
import { TraderRanker } from './TraderRanker.js';
import { createComponentLogger } from '../../utils/logger.js';
import * as metrics from '../../utils/metrics.js';

const log = createComponentLogger('CopySimulator');

/**
 * Simulator configuration
 */
export interface CopySimulatorConfig {
  defaultSlippagePercent: number;
  defaultMakerFee: number;
  defaultTakerFee: number;
}

const DEFAULT_CONFIG: CopySimulatorConfig = {
  defaultSlippagePercent: 0.5,
  defaultMakerFee: 0,
  defaultTakerFee: 0.01, // 1% taker fee
};

/**
 * Simulated position for tracking
 */
interface SimulatedPosition {
  marketId: string;
  outcomeId: string;
  size: number;
  avgEntryPrice: number;
  totalCost: number;
  enteredAt: Date;
}

/**
 * Copy Simulator service
 */
export class CopySimulator extends EventEmitter {
  private config: CopySimulatorConfig;
  private analyzer: TraderAnalyzer;
  private ranker: TraderRanker;

  constructor(config: Partial<CopySimulatorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.analyzer = new TraderAnalyzer();
    this.ranker = new TraderRanker();
  }

  /**
   * Run a copy trading simulation for a single trader
   */
  async simulate(params: SimulationParams): Promise<SimulationResult> {
    const startTime = Date.now();
    const simulationId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    log.info('Starting simulation', {
      simulationId,
      trader: params.traderAddress.slice(0, 10) + '...',
      capital: params.initialCapital,
      strategy: params.sizingStrategy,
    });

    this.emit('simulationStarted', params);

    // Fetch historical trades
    const trades = await this.analyzer.fetchTradeHistory(params.traderAddress, {
      startDate: params.startDate,
      endDate: params.endDate,
    });

    // Sort by timestamp
    const sortedTrades = [...trades].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Initialize simulation state
    let capital = params.initialCapital;
    let peakCapital = capital;
    const positions = new Map<string, SimulatedPosition>();
    const tradeResults: SimulatedTradeResult[] = [];
    const equityCurve: EquityPoint[] = [];
    const positionSnapshots: PositionSnapshot[] = [];

    // Track statistics
    let maxDrawdown = 0;
    let maxDrawdownUsd = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    let copiedTrades = 0;
    let skippedTrades = 0;

    // Process each trade
    for (const trade of sortedTrades) {
      const positionKey = `${trade.marketId}:${trade.outcomeId}`;

      // Calculate copy size using sizing strategy
      const traderConfig: TraderCopyConfig = {
        address: params.traderAddress,
        isActive: true,
        sizingStrategy: params.sizingStrategy,
        defaultMultiplier: params.multiplier,
        copyPercentage: params.copyPercentage,
        maxPositionSize: params.maxPositionSize,
        minTradeSize: params.minTradeSize,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (params.fixedAmount !== undefined) {
        traderConfig.fixedCopyAmount = params.fixedAmount;
      }

      const sizeCalc = calculateOrderSizeForTrader(
        traderConfig,
        trade.usdcSize,
        capital,
        0
      );

      // Check if trade should be skipped
      if (sizeCalc.belowMinimum || sizeCalc.finalAmount < params.minTradeSize) {
        tradeResults.push({
          originalTrade: trade,
          copiedSize: 0,
          entryPrice: trade.price,
          pnl: 0,
          pnlPercent: 0,
          wasSkipped: true,
          skipReason: sizeCalc.reasoning || 'Below minimum trade size',
        });
        skippedTrades++;
        continue;
      }

      // Check if we have enough capital
      if (trade.side === 'BUY' && sizeCalc.finalAmount > capital) {
        tradeResults.push({
          originalTrade: trade,
          copiedSize: 0,
          entryPrice: trade.price,
          pnl: 0,
          pnlPercent: 0,
          wasSkipped: true,
          skipReason: 'Insufficient capital',
        });
        skippedTrades++;
        continue;
      }

      copiedTrades++;

      // Apply slippage
      let executionPrice = trade.price;
      if (params.includeSlippage) {
        const slippage = params.slippagePercent / 100;
        if (trade.side === 'BUY') {
          executionPrice = trade.price * (1 + slippage);
        } else {
          executionPrice = trade.price * (1 - slippage);
        }
      }

      // Calculate trade result
      let tradePnl = 0;
      let exitPrice: number | undefined;
      let holdingPeriodHours: number | undefined;

      // Calculate size from the sizing result
      const copiedUsdcSize = sizeCalc.finalAmount;
      const copiedSize = copiedUsdcSize / executionPrice;

      if (trade.side === 'BUY') {
        // Opening or adding to position
        const tradeCost = copiedUsdcSize;

        // Apply fees
        let fees = 0;
        if (params.includeFees) {
          fees = tradeCost * (params.takerFeePercent / 100);
        }

        capital -= tradeCost + fees;

        // Update position
        const existingPosition = positions.get(positionKey);
        if (existingPosition) {
          const newTotalCost = existingPosition.totalCost + tradeCost;
          const newSize = existingPosition.size + copiedSize;
          existingPosition.avgEntryPrice = newTotalCost / newSize;
          existingPosition.size = newSize;
          existingPosition.totalCost = newTotalCost;
        } else {
          positions.set(positionKey, {
            marketId: trade.marketId,
            outcomeId: trade.outcomeId,
            size: copiedSize,
            avgEntryPrice: executionPrice,
            totalCost: tradeCost,
            enteredAt: trade.timestamp,
          });
        }
      } else {
        // Closing or reducing position
        const position = positions.get(positionKey);

        if (position && position.size > 0) {
          const sizeToSell = Math.min(copiedSize, position.size);
          const costBasis = sizeToSell * position.avgEntryPrice;
          const proceeds = sizeToSell * executionPrice;

          // Apply fees
          let fees = 0;
          if (params.includeFees) {
            fees = proceeds * (params.takerFeePercent / 100);
          }

          tradePnl = proceeds - fees - costBasis;
          exitPrice = executionPrice;
          holdingPeriodHours =
            (trade.timestamp.getTime() - position.enteredAt.getTime()) / (1000 * 60 * 60);

          capital += proceeds - fees;

          // Update position
          position.size -= sizeToSell;
          position.totalCost -= costBasis;

          if (position.size < 0.0001) {
            positions.delete(positionKey);
          }

          // Track win/loss
          if (tradePnl > 0) {
            winningTrades++;
            totalProfit += tradePnl;
          } else if (tradePnl < 0) {
            losingTrades++;
            totalLoss += Math.abs(tradePnl);
          }
        }
      }

      // Record trade result
      const tradeResult: SimulatedTradeResult = {
        originalTrade: trade,
        copiedSize,
        entryPrice: executionPrice,
        pnl: tradePnl,
        pnlPercent: tradePnl !== 0 ? (tradePnl / copiedUsdcSize) * 100 : 0,
        wasSkipped: false,
      };
      if (exitPrice !== undefined) {
        tradeResult.exitPrice = exitPrice;
      }
      if (holdingPeriodHours !== undefined) {
        tradeResult.holdingPeriodHours = holdingPeriodHours;
      }
      tradeResults.push(tradeResult);

      // Calculate current equity (capital + position values)
      let positionValue = 0;
      for (const pos of positions.values()) {
        // Estimate current position value at entry price (simplified)
        positionValue += pos.totalCost;
      }
      const equity = capital + positionValue;

      // Update peak and drawdown
      if (equity > peakCapital) {
        peakCapital = equity;
      }
      const drawdownUsd = peakCapital - equity;
      const drawdownPct = peakCapital > 0 ? (drawdownUsd / peakCapital) * 100 : 0;

      if (drawdownUsd > maxDrawdownUsd) {
        maxDrawdownUsd = drawdownUsd;
        maxDrawdown = drawdownPct;
      }

      // Record equity point
      equityCurve.push({
        timestamp: trade.timestamp,
        equity,
        drawdown: drawdownUsd,
        drawdownPercent: drawdownPct,
      });

      // Snapshot positions
      for (const pos of positions.values()) {
        positionSnapshots.push({
          timestamp: trade.timestamp,
          marketId: pos.marketId,
          outcomeId: pos.outcomeId,
          side: 'long',
          size: pos.size,
          entryPrice: pos.avgEntryPrice,
          currentPrice: pos.avgEntryPrice, // Simplified
          unrealizedPnl: 0,
        });
      }
    }

    // Calculate final metrics
    const finalEquity = capital + Array.from(positions.values()).reduce((sum, p) => sum + p.totalCost, 0);
    const totalPnl = finalEquity - params.initialCapital;
    const roi = (totalPnl / params.initialCapital) * 100;

    const winRate = copiedTrades > 0 ? winningTrades / (winningTrades + losingTrades) : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

    // Calculate Sharpe ratio from equity curve
    const { sharpeRatio, sortinoRatio } = this.calculateRatios(equityCurve, params.initialCapital);

    // Trade statistics
    const completedTrades = tradeResults.filter((t) => !t.wasSkipped && t.exitPrice !== undefined);
    const avgTradeProfit =
      completedTrades.length > 0
        ? completedTrades.reduce((sum, t) => sum + t.pnl, 0) / completedTrades.length
        : 0;

    const winningTradeResults = completedTrades.filter((t) => t.pnl > 0);
    const losingTradeResults = completedTrades.filter((t) => t.pnl < 0);

    const avgWinningTrade =
      winningTradeResults.length > 0
        ? winningTradeResults.reduce((sum, t) => sum + t.pnl, 0) / winningTradeResults.length
        : 0;
    const avgLosingTrade =
      losingTradeResults.length > 0
        ? losingTradeResults.reduce((sum, t) => sum + t.pnl, 0) / losingTradeResults.length
        : 0;

    const pnlValues = completedTrades.map((t) => t.pnl);
    const largestWin = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
    const largestLoss = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;

    const holdingPeriods = completedTrades
      .filter((t) => t.holdingPeriodHours !== undefined)
      .map((t) => t.holdingPeriodHours!);
    const avgHoldingPeriodHours =
      holdingPeriods.length > 0
        ? holdingPeriods.reduce((sum, h) => sum + h, 0) / holdingPeriods.length
        : 0;

    const executionTimeMs = Date.now() - startTime;

    const result: SimulationResult = {
      id: simulationId,
      params,
      finalCapital: finalEquity,
      totalPnl,
      roi,
      totalTrades: sortedTrades.length,
      copiedTrades,
      skippedTrades,
      winningTrades,
      losingTrades,
      winRate,
      maxDrawdown,
      maxDrawdownUsd,
      sharpeRatio,
      sortinoRatio,
      profitFactor: Number.isFinite(profitFactor) ? profitFactor : 0,
      avgTradeProfit,
      avgWinningTrade,
      avgLosingTrade,
      largestWin,
      largestLoss,
      avgHoldingPeriodHours,
      tradeResults,
      equityCurve,
      positionSnapshots,
      simulatedAt: new Date(),
      executionTimeMs,
    };

    log.info('Simulation complete', {
      simulationId,
      totalTrades: sortedTrades.length,
      copiedTrades,
      roi: roi.toFixed(2) + '%',
      winRate: (winRate * 100).toFixed(1) + '%',
      maxDrawdown: maxDrawdown.toFixed(1) + '%',
      executionTimeMs,
    });

    metrics.traderDiscoverySimulations.inc();

    this.emit('simulationCompleted', result);

    return result;
  }

  /**
   * Calculate Sharpe and Sortino ratios from equity curve
   */
  private calculateRatios(
    equityCurve: EquityPoint[],
    initialCapital: number
  ): { sharpeRatio: number; sortinoRatio: number } {
    if (equityCurve.length < 2) {
      return { sharpeRatio: 0, sortinoRatio: 0 };
    }

    // Calculate daily returns
    const dailyReturns: number[] = [];
    let previousEquity = initialCapital;

    for (const point of equityCurve) {
      if (previousEquity > 0) {
        const dailyReturn = (point.equity - previousEquity) / previousEquity;
        dailyReturns.push(dailyReturn);
      }
      previousEquity = point.equity;
    }

    if (dailyReturns.length < 2) {
      return { sharpeRatio: 0, sortinoRatio: 0 };
    }

    // Average return
    const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;

    // Standard deviation
    const variance =
      dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
      (dailyReturns.length - 1);
    const stdDev = Math.sqrt(variance);

    // Sharpe ratio (annualized)
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Downside deviation (for Sortino)
    const negativeReturns = dailyReturns.filter((r) => r < 0);
    const downsideVariance =
      negativeReturns.length > 1
        ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / (negativeReturns.length - 1)
        : 0;
    const downsideDeviation = Math.sqrt(downsideVariance);

    // Sortino ratio
    const sortinoRatio = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(252) : 0;

    return {
      sharpeRatio: Number.isFinite(sharpeRatio) ? sharpeRatio : 0,
      sortinoRatio: Number.isFinite(sortinoRatio) ? sortinoRatio : 0,
    };
  }

  /**
   * Run batch simulation for multiple traders
   */
  async simulateBatch(request: BatchSimulationRequest): Promise<BatchSimulationResult> {
    const startTime = Date.now();

    log.info('Starting batch simulation', {
      traderCount: request.traderAddresses.length,
    });

    const results = new Map<string, SimulationResult>();

    // Run simulations sequentially to avoid rate limiting
    for (const address of request.traderAddresses) {
      try {
        const params: SimulationParams = {
          ...request.params,
          traderAddress: address,
        };

        const result = await this.simulate(params);
        results.set(address, result);
      } catch (error) {
        log.error('Simulation failed for trader', {
          address: address.slice(0, 10) + '...',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Small delay between simulations
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Analyze and rank results
    const performances = Array.from(results.values()).map((result) => ({
      address: result.params.traderAddress,
      totalTrades: result.copiedTrades,
      winningTrades: result.winningTrades,
      losingTrades: result.losingTrades,
      totalVolume: result.tradeResults.reduce((sum, t) => sum + (t.wasSkipped ? 0 : t.copiedSize * t.entryPrice), 0),
      avgTradeSize: result.avgTradeProfit,
      largestTrade: result.largestWin,
      smallestTrade: Math.abs(result.largestLoss),
      totalPnl: result.totalPnl,
      realizedPnl: result.totalPnl,
      unrealizedPnl: 0,
      winRate: result.winRate,
      roi: result.roi,
      profitFactor: result.profitFactor,
      sharpeRatio: result.sharpeRatio,
      sortinoRatio: result.sortinoRatio,
      maxDrawdown: result.maxDrawdown,
      maxDrawdownUsd: result.maxDrawdownUsd,
      avgDrawdown: result.maxDrawdown / 2, // Approximation
      activeDays: Math.ceil(
        (result.params.endDate.getTime() - result.params.startDate.getTime()) / (24 * 60 * 60 * 1000)
      ),
      avgTradesPerDay: result.copiedTrades / Math.max(1, Math.ceil(
        (result.params.endDate.getTime() - result.params.startDate.getTime()) / (24 * 60 * 60 * 1000)
      )),
      avgHoldingPeriodHours: result.avgHoldingPeriodHours,
      openPositions: 0,
      currentExposure: 0,
      firstTradeAt: result.params.startDate,
      lastTradeAt: result.params.endDate,
    }));

    const rankings = this.ranker.rankTraders(performances);

    // Find best performer
    const sortedResults = Array.from(results.entries()).sort((a, b) => b[1].roi - a[1].roi);
    const bestTrader = sortedResults[0]?.[0] || '';
    const bestRoi = sortedResults[0]?.[1]?.roi || 0;
    const avgRoi =
      Array.from(results.values()).reduce((sum, r) => sum + r.roi, 0) / Math.max(results.size, 1);

    const totalSimulationTimeMs = Date.now() - startTime;

    const batchResult: BatchSimulationResult = {
      results,
      rankings,
      summary: {
        bestTrader,
        bestRoi,
        avgRoi,
        totalSimulationTimeMs,
      },
    };

    log.info('Batch simulation complete', {
      tradersSimulated: results.size,
      bestRoi: bestRoi.toFixed(2) + '%',
      avgRoi: avgRoi.toFixed(2) + '%',
      totalTimeMs: totalSimulationTimeMs,
    });

    this.emit('batchSimulationCompleted', batchResult);

    return batchResult;
  }

  /**
   * Compare different sizing strategies for a trader
   */
  async compareStrategies(
    traderAddress: string,
    baseParams: Omit<SimulationParams, 'traderAddress' | 'sizingStrategy'>
  ): Promise<{
    percentage: SimulationResult;
    fixed: SimulationResult;
    adaptive: SimulationResult;
    recommendation: 'PERCENTAGE' | 'FIXED' | 'ADAPTIVE';
  }> {
    log.info('Comparing sizing strategies', {
      trader: traderAddress.slice(0, 10) + '...',
    });

    // Run simulations with each strategy
    const [percentageResult, fixedResult, adaptiveResult] = await Promise.all([
      this.simulate({
        ...baseParams,
        traderAddress,
        sizingStrategy: 'PERCENTAGE',
      }),
      this.simulate({
        ...baseParams,
        traderAddress,
        sizingStrategy: 'FIXED',
        fixedAmount: baseParams.initialCapital * 0.05, // 5% of capital
      }),
      this.simulate({
        ...baseParams,
        traderAddress,
        sizingStrategy: 'ADAPTIVE',
      }),
    ]);

    // Score each strategy (ROI-adjusted for risk)
    const scoreStrategy = (result: SimulationResult): number => {
      const riskAdjustedReturn = result.sharpeRatio;
      const roiComponent = result.roi / 100;
      const winRateComponent = result.winRate;
      const drawdownPenalty = result.maxDrawdown / 100;

      return riskAdjustedReturn * 0.4 + roiComponent * 0.3 + winRateComponent * 0.2 - drawdownPenalty * 0.1;
    };

    const scores = {
      PERCENTAGE: scoreStrategy(percentageResult),
      FIXED: scoreStrategy(fixedResult),
      ADAPTIVE: scoreStrategy(adaptiveResult),
    };

    const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const recommendation = (sortedScores[0]?.[0] ?? 'PERCENTAGE') as
      | 'PERCENTAGE'
      | 'FIXED'
      | 'ADAPTIVE';

    log.info('Strategy comparison complete', {
      percentageRoi: percentageResult.roi.toFixed(2) + '%',
      fixedRoi: fixedResult.roi.toFixed(2) + '%',
      adaptiveRoi: adaptiveResult.roi.toFixed(2) + '%',
      recommendation,
    });

    return {
      percentage: percentageResult,
      fixed: fixedResult,
      adaptive: adaptiveResult,
      recommendation,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CopySimulatorConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('Simulator config updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): CopySimulatorConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const copySimulator = new CopySimulator();
