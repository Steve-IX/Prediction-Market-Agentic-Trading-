/**
 * Trader Discovery API Routes
 *
 * Provides REST API endpoints for discovering and analyzing profitable traders.
 * Endpoints for trader analysis, ranking, and copy trading simulation.
 */

import { Router, type Request, type Response } from 'express';
import type { TraderDiscoveryService } from '../../services/traderDiscovery/TraderDiscoveryService.js';
import type { RankingCriteria } from '../../services/traderDiscovery/types.js';
import type { SizingStrategy } from '../../services/copyTrading/types.js';

export interface TraderDiscoveryRouterDependencies {
  traderDiscoveryService: TraderDiscoveryService;
}

export function createTraderDiscoveryRouter(deps: TraderDiscoveryRouterDependencies): Router {
  const router = Router();
  const { traderDiscoveryService } = deps;

  /**
   * GET /api/trader-discovery/status
   * Get trader discovery service status
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const state = traderDiscoveryService.getState();
      const cacheStats = traderDiscoveryService.getCacheStats();

      res.json({
        status: 'ok',
        ...state,
        cache: cacheStats,
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
   * GET /api/trader-discovery/top
   * Get top ranked traders
   */
  router.get('/top', async (req: Request, res: Response) => {
    try {
      const count = req.query['count'] ? parseInt(req.query['count'] as string, 10) : 10;

      // Optional filters - only include defined values
      const filter: Record<string, number> = {};
      if (req.query['minVolume']) filter['minVolume'] = parseFloat(req.query['minVolume'] as string);
      if (req.query['minTrades']) filter['minTrades'] = parseInt(req.query['minTrades'] as string, 10);
      if (req.query['minWinRate']) filter['minWinRate'] = parseFloat(req.query['minWinRate'] as string);
      if (req.query['minRoi']) filter['minRoi'] = parseFloat(req.query['minRoi'] as string);
      if (req.query['maxDrawdown']) filter['maxDrawdown'] = parseFloat(req.query['maxDrawdown'] as string);
      if (req.query['timeframeDays']) filter['timeframeDays'] = parseInt(req.query['timeframeDays'] as string, 10);

      const traders = await traderDiscoveryService.getTopTraders(count, filter as any);

      res.json({
        count: traders.length,
        traders: traders.map((t) => ({
          rank: t.rank,
          address: t.address,
          name: t.name,
          rankScore: t.rankScore,
          recommendation: t.recommendation,
          notes: t.notes,
          scores: t.scores,
          performance: {
            totalTrades: t.performance.totalTrades,
            winRate: t.performance.winRate,
            roi: t.performance.roi,
            profitFactor: t.performance.profitFactor,
            totalVolume: t.performance.totalVolume,
            totalPnl: t.performance.totalPnl,
            maxDrawdown: t.performance.maxDrawdown,
            sharpeRatio: t.performance.sharpeRatio,
            avgTradeSize: t.performance.avgTradeSize,
            activeDays: t.performance.activeDays,
            openPositions: t.performance.openPositions,
            firstTradeAt: t.performance.firstTradeAt.toISOString(),
            lastTradeAt: t.performance.lastTradeAt.toISOString(),
          },
        })),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch top traders',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/trader-discovery/discover
   * Discover new traders from leaderboard
   */
  router.get('/discover', async (req: Request, res: Response) => {
    try {
      const count = req.query['count'] ? parseInt(req.query['count'] as string, 10) : 20;

      const addresses = await traderDiscoveryService.discoverTopTraders(count);

      res.json({
        count: addresses.length,
        addresses,
        message: 'Use /analyze/:address to get detailed performance for each trader',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to discover traders',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/trader-discovery/analyze/:address
   * Analyze a specific trader's performance
   */
  router.get('/analyze/:address', async (req: Request, res: Response) => {
    try {
      const address = req.params['address']!;
      const bypassCache = req.query['bypassCache'] === 'true';
      const timeframeDays = req.query['timeframeDays']
        ? parseInt(req.query['timeframeDays'] as string, 10)
        : undefined;

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        res.status(400).json({ error: 'Invalid Ethereum address format' });
        return;
      }

      const options: { bypassCache?: boolean; timeframeDays?: number } = { bypassCache };
      if (timeframeDays !== undefined) options.timeframeDays = timeframeDays;

      const performance = await traderDiscoveryService.analyzeTrader(address, options);

      res.json({
        address: performance.address,
        name: performance.name,
        profileUrl: performance.profileUrl,
        // Trade metrics
        totalTrades: performance.totalTrades,
        winningTrades: performance.winningTrades,
        losingTrades: performance.losingTrades,
        winRate: performance.winRate,
        // Volume metrics
        totalVolume: performance.totalVolume,
        avgTradeSize: performance.avgTradeSize,
        largestTrade: performance.largestTrade,
        smallestTrade: performance.smallestTrade,
        // P&L metrics
        totalPnl: performance.totalPnl,
        realizedPnl: performance.realizedPnl,
        unrealizedPnl: performance.unrealizedPnl,
        roi: performance.roi,
        profitFactor: performance.profitFactor,
        // Risk metrics
        maxDrawdown: performance.maxDrawdown,
        maxDrawdownUsd: performance.maxDrawdownUsd,
        avgDrawdown: performance.avgDrawdown,
        sharpeRatio: performance.sharpeRatio,
        sortinoRatio: performance.sortinoRatio,
        // Time metrics
        activeDays: performance.activeDays,
        avgTradesPerDay: performance.avgTradesPerDay,
        avgHoldingPeriodHours: performance.avgHoldingPeriodHours,
        // Current state
        openPositions: performance.openPositions,
        currentExposure: performance.currentExposure,
        // Timestamps
        firstTradeAt: performance.firstTradeAt.toISOString(),
        lastTradeAt: performance.lastTradeAt.toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to analyze trader',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/trader-discovery/trades/:address
   * Get a trader's trade history
   */
  router.get('/trades/:address', async (req: Request, res: Response) => {
    try {
      const address = req.params['address']!;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 100;
      const startDate = req.query['startDate'] ? new Date(req.query['startDate'] as string) : undefined;
      const endDate = req.query['endDate'] ? new Date(req.query['endDate'] as string) : undefined;

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        res.status(400).json({ error: 'Invalid Ethereum address format' });
        return;
      }

      const options: { startDate?: Date; endDate?: Date; limit?: number } = { limit };
      if (startDate) options.startDate = startDate;
      if (endDate) options.endDate = endDate;

      const trades = await traderDiscoveryService.getTraderTrades(address, options);

      res.json({
        count: trades.length,
        trades: trades.map((t) => ({
          id: t.id,
          transactionHash: t.transactionHash,
          marketId: t.marketId,
          outcomeId: t.outcomeId,
          outcomeName: t.outcomeName,
          marketTitle: t.marketTitle,
          marketSlug: t.marketSlug,
          side: t.side,
          price: t.price,
          size: t.size,
          usdcSize: t.usdcSize,
          timestamp: t.timestamp.toISOString(),
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
   * POST /api/trader-discovery/simulate
   * Simulate copy trading for a trader
   */
  router.post('/simulate', async (req: Request, res: Response) => {
    try {
      const {
        traderAddress,
        startDate,
        endDate,
        initialCapital = 10000,
        sizingStrategy = 'PERCENTAGE' as SizingStrategy,
        copyPercentage = 10,
        fixedAmount,
        multiplier = 1.0,
        maxPositionSize = 1000,
        minTradeSize = 1,
        includeSlippage = true,
        slippagePercent = 0.5,
        includeFees = true,
        makerFeePercent = 0,
        takerFeePercent = 1,
      } = req.body;

      if (!traderAddress) {
        res.status(400).json({ error: 'traderAddress is required' });
        return;
      }

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(traderAddress)) {
        res.status(400).json({ error: 'Invalid Ethereum address format' });
        return;
      }

      const result = await traderDiscoveryService.simulateCopyTrading({
        traderAddress,
        startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate) : new Date(),
        initialCapital,
        sizingStrategy,
        copyPercentage,
        fixedAmount,
        multiplier,
        maxPositionSize,
        minTradeSize,
        includeSlippage,
        slippagePercent,
        includeFees,
        makerFeePercent,
        takerFeePercent,
      });

      res.json({
        id: result.id,
        // Summary
        finalCapital: result.finalCapital,
        totalPnl: result.totalPnl,
        roi: result.roi,
        // Trade metrics
        totalTrades: result.totalTrades,
        copiedTrades: result.copiedTrades,
        skippedTrades: result.skippedTrades,
        winningTrades: result.winningTrades,
        losingTrades: result.losingTrades,
        winRate: result.winRate,
        // Risk metrics
        maxDrawdown: result.maxDrawdown,
        maxDrawdownUsd: result.maxDrawdownUsd,
        sharpeRatio: result.sharpeRatio,
        sortinoRatio: result.sortinoRatio,
        profitFactor: result.profitFactor,
        // Trade stats
        avgTradeProfit: result.avgTradeProfit,
        avgWinningTrade: result.avgWinningTrade,
        avgLosingTrade: result.avgLosingTrade,
        largestWin: result.largestWin,
        largestLoss: result.largestLoss,
        avgHoldingPeriodHours: result.avgHoldingPeriodHours,
        // Equity curve (sampled for response size)
        equityCurve: result.equityCurve.filter((_, i) => i % Math.max(1, Math.floor(result.equityCurve.length / 100)) === 0).map((p) => ({
          timestamp: p.timestamp.toISOString(),
          equity: p.equity,
          drawdown: p.drawdown,
          drawdownPercent: p.drawdownPercent,
        })),
        // Metadata
        simulatedAt: result.simulatedAt.toISOString(),
        executionTimeMs: result.executionTimeMs,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to run simulation',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/trader-discovery/simulate/batch
   * Simulate copy trading for multiple traders
   */
  router.post('/simulate/batch', async (req: Request, res: Response) => {
    try {
      const { traderAddresses, ...params } = req.body;

      if (!traderAddresses || !Array.isArray(traderAddresses) || traderAddresses.length === 0) {
        res.status(400).json({ error: 'traderAddresses array is required' });
        return;
      }

      // Validate addresses
      for (const address of traderAddresses) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          res.status(400).json({ error: `Invalid Ethereum address format: ${address}` });
          return;
        }
      }

      const result = await traderDiscoveryService.simulateBatch({
        traderAddresses,
        params: {
          startDate: params.startDate
            ? new Date(params.startDate)
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: params.endDate ? new Date(params.endDate) : new Date(),
          initialCapital: params.initialCapital || 10000,
          sizingStrategy: params.sizingStrategy || 'PERCENTAGE',
          copyPercentage: params.copyPercentage || 10,
          fixedAmount: params.fixedAmount,
          multiplier: params.multiplier || 1.0,
          maxPositionSize: params.maxPositionSize || 1000,
          minTradeSize: params.minTradeSize || 1,
          includeSlippage: params.includeSlippage !== false,
          slippagePercent: params.slippagePercent || 0.5,
          includeFees: params.includeFees !== false,
          makerFeePercent: params.makerFeePercent || 0,
          takerFeePercent: params.takerFeePercent || 1,
        },
      });

      res.json({
        summary: result.summary,
        rankings: result.rankings.map((r) => ({
          rank: r.rank,
          address: r.address,
          name: r.name,
          rankScore: r.rankScore,
          recommendation: r.recommendation,
          roi: r.performance.roi,
          winRate: r.performance.winRate,
        })),
        tradersSimulated: result.results.size,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to run batch simulation',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/trader-discovery/compare-strategies
   * Compare different sizing strategies for a trader
   */
  router.post('/compare-strategies', async (req: Request, res: Response) => {
    try {
      const { traderAddress, ...params } = req.body;

      if (!traderAddress) {
        res.status(400).json({ error: 'traderAddress is required' });
        return;
      }

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(traderAddress)) {
        res.status(400).json({ error: 'Invalid Ethereum address format' });
        return;
      }

      const result = await traderDiscoveryService.compareStrategies(traderAddress, {
        startDate: params.startDate
          ? new Date(params.startDate)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: params.endDate ? new Date(params.endDate) : new Date(),
        initialCapital: params.initialCapital || 10000,
        copyPercentage: params.copyPercentage || 10,
        multiplier: params.multiplier || 1.0,
        maxPositionSize: params.maxPositionSize || 1000,
        minTradeSize: params.minTradeSize || 1,
        includeSlippage: params.includeSlippage !== false,
        slippagePercent: params.slippagePercent || 0.5,
        includeFees: params.includeFees !== false,
        makerFeePercent: params.makerFeePercent || 0,
        takerFeePercent: params.takerFeePercent || 1,
      });

      res.json({
        recommendation: result.recommendation,
        strategies: {
          PERCENTAGE: {
            roi: result.percentage.roi,
            totalPnl: result.percentage.totalPnl,
            winRate: result.percentage.winRate,
            maxDrawdown: result.percentage.maxDrawdown,
            sharpeRatio: result.percentage.sharpeRatio,
          },
          FIXED: {
            roi: result.fixed.roi,
            totalPnl: result.fixed.totalPnl,
            winRate: result.fixed.winRate,
            maxDrawdown: result.fixed.maxDrawdown,
            sharpeRatio: result.fixed.sharpeRatio,
          },
          ADAPTIVE: {
            roi: result.adaptive.roi,
            totalPnl: result.adaptive.totalPnl,
            winRate: result.adaptive.winRate,
            maxDrawdown: result.adaptive.maxDrawdown,
            sharpeRatio: result.adaptive.sharpeRatio,
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to compare strategies',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/trader-discovery/similar/:address
   * Find traders similar to a reference trader
   */
  router.get('/similar/:address', async (req: Request, res: Response) => {
    try {
      const address = req.params['address']!;
      const count = req.query['count'] ? parseInt(req.query['count'] as string, 10) : 5;

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        res.status(400).json({ error: 'Invalid Ethereum address format' });
        return;
      }

      const similar = await traderDiscoveryService.findSimilarTraders(address, count);

      res.json({
        referenceAddress: address,
        count: similar.length,
        similarTraders: similar.map((t) => ({
          rank: t.rank,
          address: t.address,
          name: t.name,
          rankScore: t.rankScore,
          recommendation: t.recommendation,
          performance: {
            roi: t.performance.roi,
            winRate: t.performance.winRate,
            totalVolume: t.performance.totalVolume,
            avgHoldingPeriodHours: t.performance.avgHoldingPeriodHours,
          },
        })),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to find similar traders',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/trader-discovery/ranking-presets
   * Get available ranking criteria presets
   */
  router.get('/ranking-presets', async (_req: Request, res: Response) => {
    try {
      const presets = traderDiscoveryService.getRankingPresets();

      res.json({
        presets,
        currentCriteria: traderDiscoveryService.getRankingCriteria(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch presets',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * PUT /api/trader-discovery/ranking-criteria
   * Update ranking criteria
   */
  router.put('/ranking-criteria', async (req: Request, res: Response) => {
    try {
      const criteria: Partial<RankingCriteria> = req.body;

      traderDiscoveryService.updateRankingCriteria(criteria);

      res.json({
        status: 'ok',
        message: 'Ranking criteria updated',
        criteria: traderDiscoveryService.getRankingCriteria(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to update criteria',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/trader-discovery/cache
   * Get cache statistics
   */
  router.get('/cache', async (_req: Request, res: Response) => {
    try {
      const stats = traderDiscoveryService.getCacheStats();

      res.json(stats);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch cache stats',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/trader-discovery/cache
   * Clear the cache
   */
  router.delete('/cache', async (_req: Request, res: Response) => {
    try {
      traderDiscoveryService.clearCache();

      res.json({
        status: 'ok',
        message: 'Cache cleared',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to clear cache',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
