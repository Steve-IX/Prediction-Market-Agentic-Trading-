import { Router, type Request, type Response } from 'express';
import type { StrategyRegistry } from '../../strategies/index.js';
import type { TradingEngine } from '../../tradingEngine.js';
import { getStrategyApiEntries } from '../../strategies/strategyApiAdapter.js';

export function createStrategiesRouter(
  strategyRegistry: StrategyRegistry,
  tradingEngine?: TradingEngine | null
): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      if (tradingEngine) {
        const strategies = getStrategyApiEntries(
          tradingEngine.getStrategyManager(),
          tradingEngine
        );
        res.json({ count: strategies.length, strategies, source: 'strategy-manager' });
        return;
      }

      const strategies = strategyRegistry.getAll();
      res.json({
        count: strategies.length,
        strategies: strategies.map((s) => {
          const state = s.getState();
          const config = s.getConfig();
          return {
            id: config.id,
            name: config.name,
            enabled: config.enabled,
            isRunning: state.isRunning,
            ordersPlaced: state.ordersPlaced,
            tradesExecuted: state.tradesExecuted,
            totalPnl: state.totalPnl,
            startedAt: state.startedAt?.toISOString() || null,
            lastError: state.lastError,
          };
        }),
        source: 'legacy-registry',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch strategies',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const strategyId = req.params['id'];
      if (!strategyId) {
        res.status(400).json({ error: 'Strategy ID is required' });
        return;
      }

      if (tradingEngine) {
        const entry = getStrategyApiEntries(
          tradingEngine.getStrategyManager(),
          tradingEngine
        ).find((s) => s.id === strategyId);
        if (!entry) {
          res.status(404).json({ error: 'Strategy not found' });
          return;
        }
        res.json({ ...entry, engineState: tradingEngine.getState() });
        return;
      }

      const strategy = strategyRegistry.get(strategyId);
      if (!strategy) {
        res.status(404).json({ error: 'Strategy not found' });
        return;
      }

      const state = strategy.getState();
      const config = strategy.getConfig();
      res.json({
        id: config.id,
        name: config.name,
        enabled: config.enabled,
        config,
        state: {
          isRunning: state.isRunning,
          ordersPlaced: state.ordersPlaced,
          tradesExecuted: state.tradesExecuted,
          totalPnl: state.totalPnl,
          startedAt: state.startedAt?.toISOString() || null,
          lastError: state.lastError,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch strategy',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
