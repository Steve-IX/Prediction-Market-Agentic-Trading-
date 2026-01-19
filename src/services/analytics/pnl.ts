import type { Trade, Position } from '../../clients/shared/interfaces.js';
// Removed unused imports
import { startOfDay, startOfWeek, startOfMonth } from '../../utils/time.js';

/**
 * P&L calculation result
 */
export interface PnlResult {
  /**
   * Realized P&L in USD
   */
  realizedPnl: number;
  /**
   * Unrealized P&L in USD
   */
  unrealizedPnl: number;
  /**
   * Total P&L in USD
   */
  totalPnl: number;
  /**
   * Total fees paid
   */
  totalFees: number;
  /**
   * Net P&L (after fees)
   */
  netPnl: number;
}

/**
 * P&L breakdown by strategy
 */
export interface PnlByStrategy {
  strategyId: string;
  pnl: PnlResult;
  tradeCount: number;
}

/**
 * P&L breakdown by time period
 */
export interface PnlByPeriod {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  pnl: PnlResult;
  tradeCount: number;
}

/**
 * P&L Calculator
 */
export class PnlCalculator {
  /**
   * Calculate P&L from trades and positions
   */
  static calculatePnl(trades: Trade[], positions: Position[]): PnlResult {
    // Calculate realized P&L from trades
    let realizedPnl = 0;
    let totalFees = 0;

    for (const trade of trades) {
      if (trade.realizedPnl !== undefined) {
        realizedPnl += Number(trade.realizedPnl);
      }
      if (trade.fee !== undefined) {
        totalFees += Number(trade.fee);
      }
    }

    // Calculate unrealized P&L from open positions
    let unrealizedPnl = 0;
    for (const position of positions) {
      if (position.isOpen && position.unrealizedPnl !== undefined) {
        unrealizedPnl += Number(position.unrealizedPnl);
      }
    }

    const totalPnl = realizedPnl + unrealizedPnl;
    const netPnl = totalPnl - totalFees;

    return {
      realizedPnl,
      unrealizedPnl,
      totalPnl,
      totalFees,
      netPnl,
    };
  }

  /**
   * Calculate P&L by strategy
   */
  static calculatePnlByStrategy(trades: Trade[], positions: Position[]): PnlByStrategy[] {
    const byStrategy = new Map<string, { trades: Trade[]; positions: Position[] }>();

    // Group trades by strategy
    for (const trade of trades) {
      const strategyId = trade.strategyId || 'unknown';
      if (!byStrategy.has(strategyId)) {
        byStrategy.set(strategyId, { trades: [], positions: [] });
      }
      byStrategy.get(strategyId)!.trades.push(trade);
    }

    // Group positions by strategy
    for (const position of positions) {
      const strategyId = position.strategyId || 'unknown';
      if (!byStrategy.has(strategyId)) {
        byStrategy.set(strategyId, { trades: [], positions: [] });
      }
      byStrategy.get(strategyId)!.positions.push(position);
    }

    // Calculate P&L for each strategy
    const results: PnlByStrategy[] = [];
    for (const [strategyId, data] of byStrategy.entries()) {
      const pnl = this.calculatePnl(data.trades, data.positions);
      results.push({
        strategyId,
        pnl,
        tradeCount: data.trades.length,
      });
    }

    return results;
  }

  /**
   * Calculate P&L by time period
   */
  static calculatePnlByPeriod(
    trades: Trade[],
    positions: Position[],
    period: 'daily' | 'weekly' | 'monthly'
  ): PnlByPeriod[] {
    const periods: PnlByPeriod[] = [];

    // Get start function based on period
    const getStart = (timestamp: number) => {
      switch (period) {
        case 'daily':
          return startOfDay(timestamp);
        case 'weekly':
          return startOfWeek(timestamp);
        case 'monthly':
          return startOfMonth(timestamp);
      }
    };

    // Group trades by period
    const tradesByPeriod = new Map<number, Trade[]>();
    for (const trade of trades) {
      const periodStart = getStart(trade.executedAt.getTime());
      if (!tradesByPeriod.has(periodStart)) {
        tradesByPeriod.set(periodStart, []);
      }
      tradesByPeriod.get(periodStart)!.push(trade);
    }

    // Calculate P&L for each period
    for (const [periodStart, periodTrades] of tradesByPeriod.entries()) {
    // Get positions that were open during this period
    const periodPositions = positions.filter((p) => {
      if (!p.openedAt) return false;
      const openedAt = p.openedAt.getTime();
      const periodDuration = period === 'daily' ? 86400000 : period === 'weekly' ? 604800000 : 2592000000;
      return openedAt <= periodStart + periodDuration;
    });

      const pnl = this.calculatePnl(periodTrades, periodPositions);
      const periodDuration = period === 'daily' ? 86400000 : period === 'weekly' ? 604800000 : 2592000000;
      periods.push({
        period,
        startDate: new Date(periodStart),
        endDate: new Date(periodStart + periodDuration),
        pnl,
        tradeCount: periodTrades.length,
      });
    }

    // Sort by start date (most recent first)
    periods.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

    return periods;
  }

  /**
   * Calculate daily P&L
   */
  static calculateDailyPnl(trades: Trade[], positions: Position[]): PnlResult {
    const today = startOfDay();
    const todayTrades = trades.filter(
      (t) => t.executedAt.getTime() >= today
    );
    const todayPositions = positions.filter((p) => {
      return p.isOpen && p.openedAt && p.openedAt.getTime() >= today;
    });

    return this.calculatePnl(todayTrades, todayPositions);
  }
}
