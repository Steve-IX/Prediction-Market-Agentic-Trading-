import { Router, type Request, type Response } from 'express';
import type { StrategyRegistry } from '../../strategies/index.js';

export function createStrategiesRouter(strategyRegistry: StrategyRegistry): Router {
  const router = Router();

  /**
   * GET /api/strategies
   * List all strategies
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
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
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch strategies',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/strategies/:id
   * Get strategy details
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const strategyId = req.params['id'];
      if (!strategyId) {
        res.status(400).json({ error: 'Strategy ID is required' });
        return;
      }
      const strategy = strategyRegistry.get(strategyId);

      if (!strategy) {
        res.status(404).json({ error: 'Strategy not found' });
        return;
      }

      const state = strategy.getState();
      const config = strategy.getConfig();
      const configId = config['id'];
      if (!configId) {
        res.status(500).json({ error: 'Strategy ID is missing' });
        return;
      }

      res.json({
        id: configId,
        name: config.name,
        enabled: config.enabled,
        config: config,
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

  /**
   * POST /api/strategies/:id/start
   * Start a strategy
   */
  router.post('/:id/start', async (req: Request, res: Response) => {
    try {
      const strategyId = req.params['id'];
      if (!strategyId) {
        res.status(400).json({ error: 'Strategy ID is required' });
        return;
      }
      const strategy = strategyRegistry.get(strategyId);

      if (!strategy) {
        res.status(404).json({ error: 'Strategy not found' });
        return;
      }

      const state = strategy.getState();
      if (state.isRunning) {
        res.status(400).json({ error: 'Strategy is already running' });
        return;
      }

      await strategy.start();

      res.json({
        status: 'started',
        strategy: {
          id: strategyId,
          state: strategy.getState(),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to start strategy',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/strategies/:id/stop
   * Stop a strategy
   */
  router.post('/:id/stop', async (req: Request, res: Response) => {
    try {
      const strategyId = req.params['id'];
      if (!strategyId) {
        res.status(400).json({ error: 'Strategy ID is required' });
        return;
      }
      const strategy = strategyRegistry.get(strategyId);

      if (!strategy) {
        res.status(404).json({ error: 'Strategy not found' });
        return;
      }

      const state = strategy.getState();
      if (!state.isRunning) {
        res.status(400).json({ error: 'Strategy is not running' });
        return;
      }

      await strategy.stop();

      res.json({
        status: 'stopped',
        strategy: {
          id: strategyId,
          state: strategy.getState(),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to stop strategy',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
