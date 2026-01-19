import type { Trade } from '../../clients/shared/interfaces.js';
import {
  calculateSharpeRatio,
  calculateWinRate,
  calculateProfitFactor,
  calculateMaxDrawdown,
} from '../../utils/math.js';

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /**
   * Total trades
   */
  totalTrades: number;
  /**
   * Winning trades
   */
  winningTrades: number;
  /**
   * Losing trades
   */
  losingTrades: number;
  /**
   * Win rate (0-1)
   */
  winRate: number;
  /**
   * Total gross profit
   */
  grossProfit: number;
  /**
   * Total gross loss
   */
  grossLoss: number;
  /**
   * Profit factor
   */
  profitFactor: number;
  /**
   * Average win size
   */
  avgWinSize: number;
  /**
   * Average loss size
   */
  avgLossSize: number;
  /**
   * Sharpe ratio
   */
  sharpeRatio: number;
  /**
   * Maximum drawdown
   */
  maxDrawdown: number;
  /**
   * Maximum drawdown percentage
   */
  maxDrawdownPercent: number;
}

/**
 * Performance calculator
 */
export class PerformanceCalculator {
  /**
   * Calculate performance metrics from trades
   */
  static calculateMetrics(trades: Trade[]): PerformanceMetrics {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        grossProfit: 0,
        grossLoss: 0,
        profitFactor: 0,
        avgWinSize: 0,
        avgLossSize: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        maxDrawdownPercent: 0,
      };
    }

    // Separate winning and losing trades
    const winningTrades: Trade[] = [];
    const losingTrades: Trade[] = [];
    let grossProfit = 0;
    let grossLoss = 0;

    for (const trade of trades) {
      const pnl = trade.realizedPnl !== undefined ? Number(trade.realizedPnl) : 0;
      if (pnl > 0) {
        winningTrades.push(trade);
        grossProfit += pnl;
      } else if (pnl < 0) {
        losingTrades.push(trade);
        grossLoss += Math.abs(pnl);
      }
    }

    // Calculate win rate
    const winRate = calculateWinRate(winningTrades.length, losingTrades.length);

    // Calculate profit factor
    const profitFactor = calculateProfitFactor(grossProfit, grossLoss);

    // Calculate average win/loss sizes
    const avgWinSize = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const avgLossSize = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

    // Calculate Sharpe ratio (using returns)
    const returns = trades
      .map((t) => (t.realizedPnl !== undefined ? Number(t.realizedPnl) : 0))
      .filter((r) => r !== 0);
    const sharpeRatio = returns.length > 0 ? calculateSharpeRatio(returns) : 0;

    // Calculate max drawdown (using cumulative P&L)
    const equitySeries: number[] = [];
    let cumulativePnl = 0;
    for (const trade of trades) {
      cumulativePnl += trade.realizedPnl !== undefined ? Number(trade.realizedPnl) : 0;
      equitySeries.push(cumulativePnl);
    }
    const maxDrawdown = calculateMaxDrawdown(equitySeries);
    const maxDrawdownPercent = equitySeries.length > 0 && Math.max(...equitySeries) > 0
      ? (maxDrawdown / Math.max(...equitySeries)) * 100
      : 0;

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      grossProfit,
      grossLoss,
      profitFactor,
      avgWinSize,
      avgLossSize,
      sharpeRatio,
      maxDrawdown,
      maxDrawdownPercent,
    };
  }

  /**
   * Calculate performance by strategy
   */
  static calculateMetricsByStrategy(
    trades: Trade[]
  ): Map<string, PerformanceMetrics> {
    const byStrategy = new Map<string, Trade[]>();

    // Group trades by strategy
    for (const trade of trades) {
      const strategyId = trade.strategyId || 'unknown';
      if (!byStrategy.has(strategyId)) {
        byStrategy.set(strategyId, []);
      }
      byStrategy.get(strategyId)!.push(trade);
    }

    // Calculate metrics for each strategy
    const results = new Map<string, PerformanceMetrics>();
    for (const [strategyId, strategyTrades] of byStrategy.entries()) {
      results.set(strategyId, this.calculateMetrics(strategyTrades));
    }

    return results;
  }
}
