import { Router, type Request, type Response } from 'express';
import type { OrderManager } from '../../services/orderManager/index.js';
import { PnlCalculator } from '../../services/analytics/index.js';

export function createTradesRouter(orderManager: OrderManager): Router {
  const router = Router();

  /**
   * GET /api/trades
   * List trades with optional filters
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 100;
      const platform = req.query['platform'] as string | undefined;
      const strategyId = req.query['strategyId'] as string | undefined;

      const trades = await orderManager.getTrades(limit, platform);

      // Filter by strategy if provided
      const filteredTrades = strategyId
        ? trades.filter((t) => t.strategyId === strategyId)
        : trades;

      res.json({
        count: filteredTrades.length,
        trades: filteredTrades.map((t) => ({
          id: t.id,
          platform: t.platform,
          marketId: t.marketId,
          outcomeId: t.outcomeId,
          side: t.side,
          price: t.price,
          size: t.size,
          fee: t.fee,
          realizedPnl: t.realizedPnl,
          strategyId: t.strategyId,
          executedAt: t.executedAt.toISOString(),
        })),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch trades',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/trades/:id
   * Get specific trade
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const trades = await orderManager.getTrades();
      const trade = trades.find((t) => t['id'] === req.params['id']);

      if (!trade) {
        res.status(404).json({ error: 'Trade not found' });
        return;
      }

      res.json({
        id: trade['id'],
        platform: trade.platform,
        marketId: trade.marketId,
        outcomeId: trade.outcomeId,
        side: trade.side,
        price: trade.price,
        size: trade.size,
        fee: trade.fee,
        realizedPnl: trade.realizedPnl,
        strategyId: trade.strategyId,
        executedAt: trade.executedAt.toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch trade',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/trades/stats/pnl
   * Get P&L statistics
   */
  router.get('/stats/pnl', async (req: Request, res: Response) => {
    try {
      const period = (req.query['period'] as 'daily' | 'weekly' | 'monthly') || 'daily';
      const strategyId = req.query['strategyId'] as string | undefined;

      const trades = await orderManager.getTrades();
      const positions = await orderManager.getPositions();

      const filteredTrades = strategyId
        ? trades.filter((t) => t.strategyId === strategyId)
        : trades;
      const filteredPositions = strategyId
        ? positions.filter((p) => p.strategyId === strategyId)
        : positions;

      const pnl = PnlCalculator.calculatePnl(filteredTrades, filteredPositions);
      const dailyPnl = PnlCalculator.calculateDailyPnl(filteredTrades, filteredPositions);
      const byPeriod = PnlCalculator.calculatePnlByPeriod(filteredTrades, filteredPositions, period);
      const byStrategy = PnlCalculator.calculatePnlByStrategy(filteredTrades, filteredPositions);

      res.json({
        total: pnl,
        daily: dailyPnl,
        byPeriod,
        byStrategy,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to calculate P&L',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
