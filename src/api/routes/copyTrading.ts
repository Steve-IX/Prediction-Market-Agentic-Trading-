/**
 * Copy Trading API Routes
 *
 * Provides REST API endpoints for managing copy trading functionality.
 * Endpoints for managing tracked traders, viewing copied trades, and controlling the service.
 */

import { Router, type Request, type Response } from 'express';
import type { CopyTradingService } from '../../services/copyTrading/CopyTradingService.js';
import type { SizingStrategy, TieredMultiplier } from '../../services/copyTrading/types.js';

export interface CopyTradingRouterDependencies {
  copyTradingService: CopyTradingService;
}

export function createCopyTradingRouter(deps: CopyTradingRouterDependencies): Router {
  const router = Router();
  const { copyTradingService } = deps;

  /**
   * GET /api/copy-trading/status
   * Get copy trading service status
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const state = copyTradingService.getState();
      const stats = copyTradingService.getStats();

      res.json({
        status: 'ok',
        ...state,
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/copy-trading/start
   * Start copy trading service
   */
  router.post('/start', async (_req: Request, res: Response) => {
    try {
      await copyTradingService.start();

      res.json({
        status: 'ok',
        message: 'Copy trading service started',
        state: copyTradingService.getState(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to start service',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/copy-trading/stop
   * Stop copy trading service
   */
  router.post('/stop', async (_req: Request, res: Response) => {
    try {
      await copyTradingService.stop();

      res.json({
        status: 'ok',
        message: 'Copy trading service stopped',
        state: copyTradingService.getState(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to stop service',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/copy-trading/traders
   * List all tracked traders
   */
  router.get('/traders', async (_req: Request, res: Response) => {
    try {
      const traders = copyTradingService.getTrackedTraders();

      res.json({
        count: traders.length,
        traders: traders.map((t) => ({
          address: t.address,
          name: t.name,
          isActive: t.isActive,
          sizingStrategy: t.sizingStrategy,
          defaultMultiplier: t.defaultMultiplier,
          maxPositionSize: t.maxPositionSize,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch traders',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/copy-trading/traders/:address
   * Get a specific trader's details
   */
  router.get('/traders/:address', async (req: Request, res: Response) => {
    try {
      const trader = copyTradingService.getTrader(req.params['address']!);

      if (!trader) {
        res.status(404).json({ error: 'Trader not found' });
        return;
      }

      const positions = copyTradingService.getPositionsForTrader(trader.address);

      res.json({
        ...trader,
        positions: positions.map((p) => ({
          id: p.id,
          marketId: p.marketId,
          outcomeId: p.outcomeId,
          outcomeName: p.outcomeName,
          marketTitle: p.marketTitle,
          side: p.side,
          size: p.size,
          avgEntryPrice: p.avgEntryPrice,
          totalCost: p.totalCost,
          currentPrice: p.currentPrice,
          currentValue: p.currentValue,
          unrealizedPnl: p.unrealizedPnl,
          realizedPnl: p.realizedPnl,
          isOpen: p.isOpen,
          openedAt: p.openedAt.toISOString(),
        })),
        createdAt: trader.createdAt.toISOString(),
        updatedAt: trader.updatedAt.toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch trader',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/copy-trading/traders
   * Add a new trader to track
   */
  router.post('/traders', async (req: Request, res: Response) => {
    try {
      const {
        address,
        name,
        isActive = true,
        sizingStrategy = 'PERCENTAGE' as SizingStrategy,
        defaultMultiplier = 1.0,
        tieredMultipliers,
        maxPositionSize,
        minTradeSize,
      } = req.body;

      if (!address) {
        res.status(400).json({ error: 'Address is required' });
        return;
      }

      // Validate address format (basic Ethereum address check)
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        res.status(400).json({ error: 'Invalid Ethereum address format' });
        return;
      }

      const traderConfig: any = {
        address,
        name,
        isActive,
        sizingStrategy,
        defaultMultiplier,
        maxPositionSize,
        minTradeSize,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (tieredMultipliers) {
        traderConfig.tieredMultipliers = tieredMultipliers as TieredMultiplier[];
      }
      await copyTradingService.addTrader(traderConfig);

      res.status(201).json({
        status: 'ok',
        message: 'Trader added successfully',
        trader: {
          address: address.toLowerCase(),
          name,
          isActive,
          sizingStrategy,
          defaultMultiplier,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to add trader',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * PUT /api/copy-trading/traders/:address
   * Update a trader's configuration
   */
  router.put('/traders/:address', async (req: Request, res: Response) => {
    try {
      const address = req.params['address']!;
      const updates = req.body;

      const trader = copyTradingService.getTrader(address);
      if (!trader) {
        res.status(404).json({ error: 'Trader not found' });
        return;
      }

      copyTradingService.updateTrader(address, updates);

      const updatedTrader = copyTradingService.getTrader(address);

      res.json({
        status: 'ok',
        message: 'Trader updated successfully',
        trader: updatedTrader,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to update trader',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/copy-trading/traders/:address
   * Remove a trader from tracking
   */
  router.delete('/traders/:address', async (req: Request, res: Response) => {
    try {
      const address = req.params['address']!;

      const trader = copyTradingService.getTrader(address);
      if (!trader) {
        res.status(404).json({ error: 'Trader not found' });
        return;
      }

      await copyTradingService.removeTrader(address);

      res.json({
        status: 'ok',
        message: 'Trader removed successfully',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to remove trader',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/copy-trading/positions
   * List all copy trading positions
   */
  router.get('/positions', async (req: Request, res: Response) => {
    try {
      const traderAddress = req.query['trader'] as string | undefined;
      const isOpen = req.query['open'] === 'true' ? true : req.query['open'] === 'false' ? false : undefined;

      let positions = copyTradingService.getPositions();

      // Filter by trader
      if (traderAddress) {
        positions = positions.filter(
          (p) => p.traderAddress.toLowerCase() === traderAddress.toLowerCase()
        );
      }

      // Filter by open status
      if (isOpen !== undefined) {
        positions = positions.filter((p) => p.isOpen === isOpen);
      }

      res.json({
        count: positions.length,
        positions: positions.map((p) => ({
          id: p.id,
          traderId: p.traderId,
          traderAddress: p.traderAddress,
          marketId: p.marketId,
          outcomeId: p.outcomeId,
          outcomeName: p.outcomeName,
          marketTitle: p.marketTitle,
          side: p.side,
          size: p.size,
          avgEntryPrice: p.avgEntryPrice,
          totalCost: p.totalCost,
          currentPrice: p.currentPrice,
          currentValue: p.currentValue,
          unrealizedPnl: p.unrealizedPnl,
          percentPnl: p.percentPnl,
          realizedPnl: p.realizedPnl,
          buyCount: p.buyCount,
          sellCount: p.sellCount,
          isOpen: p.isOpen,
          openedAt: p.openedAt.toISOString(),
          closedAt: p.closedAt?.toISOString(),
        })),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch positions',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/copy-trading/positions/:id/close
   * Manually close a position
   */
  router.post('/positions/:id/close', async (req: Request, res: Response) => {
    try {
      const positionId = req.params['id']!;
      const { slippagePercent = 2 } = req.body;

      const result = await copyTradingService.closePosition(positionId, slippagePercent);

      if (!result) {
        res.status(404).json({ error: 'Position not found or already closed' });
        return;
      }

      res.json({
        status: 'ok',
        message: 'Position close order submitted',
        result,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to close position',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/copy-trading/trades
   * List copied trades
   */
  router.get('/trades', async (req: Request, res: Response) => {
    try {
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 100;
      const traderAddress = req.query['trader'] as string | undefined;
      const status = req.query['status'] as string | undefined;

      const filter: { traderAddress?: string; status?: 'SUCCESS' | 'FAILED' | 'SKIPPED'; limit?: number } = { limit };
      if (traderAddress) filter.traderAddress = traderAddress;
      if (status) filter.status = status as 'SUCCESS' | 'FAILED' | 'SKIPPED';

      const trades = await copyTradingService.getCopiedTrades(filter);

      res.json({
        count: trades.length,
        trades: trades.map((t) => ({
          id: t.id,
          traderAddress: t.traderAddress,
          originalTradeHash: t.originalTrade?.transactionHash,
          marketId: t.marketId,
          outcomeId: t.outcomeId,
          outcomeName: t.outcomeName,
          marketTitle: t.marketTitle,
          side: t.side,
          originalSize: t.originalSize,
          copiedSize: t.copiedSize,
          price: t.price,
          status: t.status,
          orderId: t.orderId,
          errorMessage: t.errorMessage,
          pnl: t.pnl,
          copiedAt: t.copiedAt.toISOString(),
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
   * GET /api/copy-trading/aggregations
   * Get pending trade aggregations
   */
  router.get('/aggregations', async (_req: Request, res: Response) => {
    try {
      const aggregations = copyTradingService.getPendingAggregations();

      res.json({
        count: aggregations.length,
        aggregations: aggregations.map((a) => ({
          groupId: a.groupId,
          traderAddress: a.traderAddress,
          marketId: a.marketId,
          outcomeId: a.outcomeId,
          outcomeName: a.outcomeName,
          side: a.side,
          avgPrice: a.avgPrice,
          totalSize: a.totalSize,
          totalUsdcSize: a.totalUsdcSize,
          tradeCount: a.trades.length,
          firstTradeAt: a.firstTradeAt.toISOString(),
          lastTradeAt: a.lastTradeAt.toISOString(),
          expiresAt: a.expiresAt.toISOString(),
        })),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch aggregations',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/copy-trading/aggregations/flush
   * Force flush all pending aggregations
   */
  router.post('/aggregations/flush', async (_req: Request, res: Response) => {
    try {
      const flushed = copyTradingService.flushAggregations();

      res.json({
        status: 'ok',
        message: 'Aggregations flushed',
        flushedCount: flushed.length,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to flush aggregations',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/copy-trading/stats
   * Get copy trading statistics
   */
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const stats = copyTradingService.getStats();

      res.json(stats);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch stats',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
