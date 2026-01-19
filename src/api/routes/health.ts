import { Router, type Request, type Response } from 'express';
import type { PolymarketClient } from '../../clients/polymarket/index.js';
import type { KalshiClient } from '../../clients/kalshi/index.js';
import type { OrderManager } from '../../services/orderManager/index.js';
import type { TradingEngine } from '../../tradingEngine.js';
import type { KillSwitch } from '../../risk/index.js';

export interface HealthCheckDependencies {
  polymarket?: PolymarketClient;
  kalshi?: KalshiClient;
  orderManager?: OrderManager;
  tradingEngine?: TradingEngine | null;
  killSwitch?: KillSwitch;
}

export function createHealthRouter(deps: HealthCheckDependencies): Router {
  const router = Router();

  /**
   * GET /api/health
   * Enhanced health check with component status
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const health: {
        status: 'healthy' | 'degraded' | 'unhealthy';
        timestamp: string;
        components: Record<string, unknown>;
      } = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        components: {},
      };

      // Check Polymarket
      if (deps.polymarket) {
        const polymarketConnected = deps.polymarket.isConnected();
        health.components['polymarket'] = {
          status: polymarketConnected ? 'connected' : 'disconnected',
          connected: polymarketConnected,
        };
        if (!polymarketConnected) {
          health.status = 'degraded';
        }
      }

      // Check Kalshi
      if (deps.kalshi) {
        const kalshiConnected = deps.kalshi.isConnected();
        health.components['kalshi'] = {
          status: kalshiConnected ? 'connected' : 'disconnected',
          connected: kalshiConnected,
        };
        if (!kalshiConnected) {
          health.status = 'degraded';
        }
      }

      // Check Order Manager
      if (deps.orderManager) {
        const isPaperTrading = deps.orderManager.isPaperTrading();
        health.components['orderManager'] = {
          status: 'operational',
          paperTrading: isPaperTrading,
        };
      }

      // Check Trading Engine
      if (deps.tradingEngine) {
        const state = deps.tradingEngine.getState();
        health.components['tradingEngine'] = {
          status: state.isInitialized ? (state.isRunning ? 'running' : 'stopped') : 'not_initialized',
          initialized: state.isInitialized,
          running: state.isRunning,
          opportunitiesDetected: state.opportunitiesDetected,
          executionsAttempted: state.executionsAttempted,
          executionsSucceeded: state.executionsSucceeded,
        };
        if (!state.isInitialized) {
          health.status = 'degraded';
        }
      }

      // Check Kill Switch
      if (deps.killSwitch) {
        const isActive = deps.killSwitch.isActive();
        health.components['killSwitch'] = {
          status: isActive ? 'active' : 'inactive',
          active: isActive,
        };
        if (isActive) {
          health.status = 'unhealthy';
        }
      }

      // Database health (if available)
      // TODO: Add database health check

      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
