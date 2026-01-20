import { getConfig, isPaperTrading, validateCredentials } from './config/index.js';
import { PLATFORMS } from './config/constants.js';
import { logger } from './utils/logger.js';
import { initializeDb, closeDb } from './database/index.js';
import { PolymarketClient } from './clients/polymarket/index.js';
import { KalshiClient } from './clients/kalshi/index.js';
import { OrderManager } from './services/orderManager/index.js';
import { SessionTracker } from './services/sessions/index.js';
import { TradingEngine } from './tradingEngine.js';
import { getMetrics, getContentType } from './utils/metrics.js';
import type { AccountBalance } from './clients/shared/interfaces.js';
import express from 'express';

const log = logger('Main');

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  log.info('Starting Prediction Market Trading Bot');

  // Load and validate configuration
  const config = getConfig();
  log.info('Configuration loaded', {
    env: config.env,
    paperTrading: isPaperTrading(),
    features: config.features,
  });

  // Validate credentials
  const polymarketCreds = validateCredentials('polymarket');
  const kalshiCreds = validateCredentials('kalshi');

  log.info('Credential validation', {
    polymarket: polymarketCreds.valid ? 'ready' : `missing: ${polymarketCreds.missing.join(', ')}`,
    kalshi: kalshiCreds.valid ? 'ready' : `missing: ${kalshiCreds.missing.join(', ')}`,
  });

  // Initialize database
  try {
    await initializeDb();
    log.info('Database initialized');
  } catch (error) {
    log.error('Database initialization failed', { error });
    // Continue in demo mode without database
  }

  // Initialize clients
  const polymarket = new PolymarketClient(config.polymarket);
  const kalshi = new KalshiClient(config.kalshi);

  // Connect to platforms
  try {
    if (polymarketCreds.valid || !config.polymarket.privateKey) {
      await polymarket.connect();
      log.info('Polymarket client connected');
    }
  } catch (error) {
    log.error('Failed to connect to Polymarket', { error });
  }

  try {
    if (kalshiCreds.valid) {
      await kalshi.connect();
      log.info('Kalshi client connected');
    }
  } catch (error) {
    log.error('Failed to connect to Kalshi', { error });
  }

  // Initialize Order Manager
  const orderManager = new OrderManager();

  // Register platform clients with order manager
  orderManager.registerClient(polymarket);
  orderManager.registerClient(kalshi);

  // Initialize Session Tracker
  let sessionTracker: SessionTracker | null = null;
  let tradingEngine: TradingEngine | null = null;

  if (config.features.enableWebSocket || config.features.enableCrossPlatformArb || config.features.enableSinglePlatformArb) {
    tradingEngine = new TradingEngine(polymarket, kalshi, orderManager, {
      enableSinglePlatformArb: config.features.enableSinglePlatformArb,
      enableCrossPlatformArb: config.features.enableCrossPlatformArb,
      enableWebSocket: config.features.enableWebSocket,
    });

    // Initialize trading engine (connects WebSockets, fetches markets)
    if (config.features.enableWebSocket) {
      try {
        await tradingEngine.initialize();
        log.info('Trading engine initialized');
      } catch (error) {
        log.error('Failed to initialize trading engine', { error });
      }
    }

    // Initialize Session Tracker with callbacks
    sessionTracker = new SessionTracker(
      {
        getBalance: async () => orderManager.getBalance(PLATFORMS.POLYMARKET),
        getTrades: async (limit?: number) => orderManager.getTrades(limit),
        getPositions: async () => orderManager.getPositions(),
        getTradingState: () => ({
          opportunitiesDetected: tradingEngine?.getState().opportunitiesDetected ?? 0,
          executionsSucceeded: tradingEngine?.getState().executionsSucceeded ?? 0,
        }),
      },
      isPaperTrading() ? 'paper' : 'live'
    );
    log.info('Session tracker initialized');
  }

  // Start API server
  const app = express();
  app.use(express.json());

  // Add metrics endpoint to main API server (for Railway compatibility)
  if (config.api.enableMetrics) {
    app.get('/metrics', async (_req, res) => {
      try {
        const metrics = await getMetrics();
        res.set('Content-Type', getContentType());
        res.send(metrics);
      } catch (error) {
        res.status(500).send('Error collecting metrics');
      }
    });
    log.info('Metrics endpoint available at /metrics on port', { port: config.api.port });
  }

  // Import API routes
  const { createHealthRouter } = await import('./api/routes/health.js');
  const { createTradesRouter } = await import('./api/routes/trades.js');
  const { createStrategiesRouter } = await import('./api/routes/strategies.js');
  const { createOrdersRouter } = await import('./api/routes/orders.js');
  const { StrategyRegistry } = await import('./strategies/index.js');

  // Create strategy registry (empty for now - strategies would be registered here)
  const strategyRegistry = new StrategyRegistry();

  // Register API routes
  app.use('/api/health', createHealthRouter({
    polymarket,
    kalshi,
    orderManager,
    tradingEngine,
  }));

  app.use('/api/trades', createTradesRouter(orderManager));
  app.use('/api/orders', createOrdersRouter(orderManager));
  app.use('/api/strategies', createStrategiesRouter(strategyRegistry));

  // Legacy health check endpoint (keep for backward compatibility)
  app.get('/health', async (_req, res) => {
    res.json({
      status: 'ok',
      paperTrading: isPaperTrading(),
      polymarket: polymarket.isConnected(),
      kalshi: kalshi.isConnected(),
      tradingEngine: tradingEngine
        ? {
            initialized: tradingEngine.getState().isInitialized,
            running: tradingEngine.getState().isRunning,
          }
        : null,
      timestamp: new Date().toISOString(),
    });
  });

  // Get markets endpoint
  app.get('/api/markets', async (_req, res) => {
    try {
      const [polymarkets, kalshiMarkets] = await Promise.allSettled([
        polymarket.isConnected() ? polymarket.getMarkets({ limit: 50 }) : Promise.resolve([]),
        kalshi.isConnected() ? kalshi.getMarkets({ limit: 50 }) : Promise.resolve([]),
      ]);

      res.json({
        polymarket: polymarkets.status === 'fulfilled' ? polymarkets.value : [],
        kalshi: kalshiMarkets.status === 'fulfilled' ? kalshiMarkets.value : [],
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch markets' });
    }
  });

  // Get positions endpoint
  app.get('/api/positions', async (_req, res) => {
    try {
      const [polyPositions, kalshiPositions] = await Promise.allSettled([
        polymarket.isConnected() && !config.polymarket.privateKey
          ? Promise.resolve([])
          : polymarket.isConnected()
            ? polymarket.getPositions()
            : Promise.resolve([]),
        kalshi.isConnected() ? kalshi.getPositions() : Promise.resolve([]),
      ]);

      res.json({
        polymarket: polyPositions.status === 'fulfilled' ? polyPositions.value : [],
        kalshi: kalshiPositions.status === 'fulfilled' ? kalshiPositions.value : [],
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch positions' });
    }
  });

  // Get balances endpoint
  app.get('/api/balances', async (_req, res) => {
    try {
      // In paper trading mode, get paper balances from OrderManager
      if (isPaperTrading() && orderManager.isPaperTrading()) {
        try {
          const paperBalances: Record<string, AccountBalance> = {};
          
          // Get paper balance for each platform
          for (const platform of [PLATFORMS.POLYMARKET, PLATFORMS.KALSHI]) {
            try {
              paperBalances[platform] = await orderManager.getBalance(platform);
            } catch {
              // Platform might not be initialized
            }
          }

          res.json({
            paper: {
              total: Object.values(paperBalances).reduce((sum, b) => sum + b.total, 0),
              available: Object.values(paperBalances).reduce((sum, b) => sum + b.available, 0),
              locked: Object.values(paperBalances).reduce((sum, b) => sum + b.locked, 0),
              currency: 'USDC',
            },
            polymarket: paperBalances[PLATFORMS.POLYMARKET] || { available: 0, locked: 0, total: 0, currency: 'USDC' },
            kalshi: paperBalances[PLATFORMS.KALSHI] || { available: 0, locked: 0, total: 0, currency: 'USD' },
          });
          return;
        } catch (paperError) {
          // Fall through to real balances if paper balance fetch fails
        }
      }

      // Live trading mode - get real balances
      const [polyBalance, kalshiBalance] = await Promise.allSettled([
        polymarket.isConnected() && config.polymarket.privateKey
          ? polymarket.getBalance()
          : Promise.resolve({ available: 0, locked: 0, total: 0, currency: 'USDC' }),
        kalshi.isConnected() ? kalshi.getBalance() : Promise.resolve({ available: 0, locked: 0, total: 0, currency: 'USD' }),
      ]);

      res.json({
        polymarket: polyBalance.status === 'fulfilled' ? polyBalance.value : null,
        kalshi: kalshiBalance.status === 'fulfilled' ? kalshiBalance.value : null,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch balances' });
    }
  });

  // ============================================
  // Trading Engine Endpoints
  // ============================================

  // Get trading engine status
  app.get('/api/trading/status', (_req, res) => {
    if (!tradingEngine) {
      res.status(404).json({ error: 'Trading engine not initialized' });
      return;
    }
    res.json(tradingEngine.getState());
  });

  // Get matched market pairs
  app.get('/api/trading/pairs', (_req, res) => {
    if (!tradingEngine) {
      res.status(404).json({ error: 'Trading engine not initialized' });
      return;
    }
    res.json(tradingEngine.getMatchedPairs());
  });

  // Start trading
  app.post('/api/trading/start', async (req, res) => {
    if (!tradingEngine) {
      return res.status(404).json({ error: 'Trading engine not initialized' });
    }

    const state = tradingEngine.getState();
    if (state.isRunning) {
      res.status(400).json({ error: 'Trading engine already running' });
      return;
    }

    try {
      // Start session tracking
      const notes = req.body?.notes as string | undefined;
      let session = null;
      if (sessionTracker) {
        session = await sessionTracker.startSession(notes);
      }

      await tradingEngine.start();
      res.json({ 
        status: 'started', 
        state: tradingEngine.getState(),
        session: session ? { id: session.id, startTime: session.startTime } : null,
      });
      return;
    } catch (error) {
      res.status(500).json({
        error: 'Failed to start trading engine',
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  });

  // Stop trading
  app.post('/api/trading/stop', async (req, res) => {
    if (!tradingEngine) {
      return res.status(404).json({ error: 'Trading engine not initialized' });
    }

    const state = tradingEngine.getState();
    if (!state.isRunning) {
      res.status(400).json({ error: 'Trading engine not running' });
      return;
    }

    try {
      await tradingEngine.stop();
      
      // End session tracking
      const notes = req.body?.notes as string | undefined;
      let session = null;
      if (sessionTracker && sessionTracker.isSessionActive()) {
        session = await sessionTracker.endSession(notes);
      }

      res.json({ 
        status: 'stopped', 
        state: tradingEngine.getState(),
        session: session ? {
          id: session.id,
          startTime: session.startTime,
          endTime: session.endTime,
          durationHours: session.durationSeconds ? (session.durationSeconds / 3600).toFixed(2) : null,
          netPnl: session.netPnl?.toFixed(2),
          tradesExecuted: session.tradesExecuted,
          winRate: session.winRate ? (session.winRate * 100).toFixed(1) + '%' : null,
          profitFactor: session.profitFactor?.toFixed(2),
          strategiesUsed: session.strategiesUsed,
        } : null,
      });
      return;
    } catch (error) {
      res.status(500).json({
        error: 'Failed to stop trading engine',
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  });

  // Manually trigger a scan for opportunities
  app.post('/api/trading/scan', async (_req, res) => {
    if (!tradingEngine) {
      return res.status(404).json({ error: 'Trading engine not initialized' });
    }

    try {
      const opportunities = await tradingEngine.triggerScan();
      res.json({
        count: opportunities.length,
        opportunities: opportunities.map((opp) => ({
          id: opp.id,
          type: opp.type,
          spreadBps: opp.spreadBps,
          maxProfit: opp.maxProfit,
          maxSize: opp.maxSize,
          confidence: opp.confidence,
        })),
      });
      return;
    } catch (error) {
      res.status(500).json({
        error: 'Failed to scan for opportunities',
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  });

  // Kill switch endpoint
  app.post('/api/kill-switch', async (_req, res) => {
    log.warn('Kill switch triggered via API');

    try {
      // Stop trading engine
      if (tradingEngine) {
        await tradingEngine.stop();
      }

      // Cancel all orders
      await orderManager.cancelAllOrders();

      res.json({ status: 'kill_switch_activated', timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(500).json({
        error: 'Kill switch error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================
  // Debug Endpoints (NEW)
  // ============================================

  // Get detailed strategy debug info
  app.get('/api/trading/debug', async (_req, res): Promise<void> => {
    if (!tradingEngine) {
      res.status(404).json({ error: 'Trading engine not initialized' });
      return;
    }

    try {
      const state = tradingEngine.getState();
      const markets = tradingEngine.getMarkets();
      
      // Get market counts by platform
      const polymarketMarkets = markets.get(PLATFORMS.POLYMARKET) ?? [];
      const kalshiMarkets = markets.get(PLATFORMS.KALSHI) ?? [];
      
      // Analyze a sample of markets for probability sum opportunities
      const probabilitySumAnalysis: Array<{
        title: string;
        yesAsk: number | undefined;
        noAsk: number | undefined;
        sum: number | undefined;
        deviation: string;
      }> = [];
      
      for (const market of polymarketMarkets.slice(0, 100)) {
        if (market.outcomes.length === 2) {
          const yesOutcome = market.outcomes.find(o => o.type === 'yes');
          const noOutcome = market.outcomes.find(o => o.type === 'no');
          if (yesOutcome && noOutcome && yesOutcome.bestAsk && noOutcome.bestAsk) {
            const sum = yesOutcome.bestAsk + noOutcome.bestAsk;
            probabilitySumAnalysis.push({
              title: market.title.substring(0, 50),
              yesAsk: yesOutcome.bestAsk,
              noAsk: noOutcome.bestAsk,
              sum,
              deviation: ((sum - 1) * 100).toFixed(3) + '%',
            });
          }
        }
      }
      
      // Sort by deviation from 1.0
      probabilitySumAnalysis.sort((a, b) => {
        const devA = Math.abs((a.sum ?? 1) - 1);
        const devB = Math.abs((b.sum ?? 1) - 1);
        return devB - devA;
      });

      res.json({
        engineState: state,
        config: {
          paperTrading: isPaperTrading(),
          strategies: config.strategies,
          features: config.features,
        },
        marketCounts: {
          polymarket: polymarketMarkets.length,
          kalshi: kalshiMarkets.length,
          binaryMarkets: polymarketMarkets.filter(m => m.outcomes.length === 2).length,
        },
        probabilitySumAnalysis: probabilitySumAnalysis.slice(0, 10),
        topMispricing: probabilitySumAnalysis.length > 0 ? probabilitySumAnalysis[0] : null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Debug info error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get all markets with their current prices
  app.get('/api/trading/markets/analysis', async (_req, res): Promise<void> => {
    if (!tradingEngine) {
      res.status(404).json({ error: 'Trading engine not initialized' });
      return;
    }

    try {
      const markets = tradingEngine.getMarkets();
      const polymarketMarkets = markets.get(PLATFORMS.POLYMARKET) ?? [];
      
      const analysis = polymarketMarkets
        .filter(m => m.outcomes.length === 2 && m.isActive)
        .map(market => {
          const yesOutcome = market.outcomes.find(o => o.type === 'yes');
          const noOutcome = market.outcomes.find(o => o.type === 'no');
          
          const yesAsk = yesOutcome?.bestAsk ?? 0;
          const noAsk = noOutcome?.bestAsk ?? 0;
          const yesBid = yesOutcome?.bestBid ?? 0;
          const noBid = noOutcome?.bestBid ?? 0;
          
          const sumOfAsks = yesAsk + noAsk;
          const sumOfBids = yesBid + noBid;
          
          return {
            id: market.externalId,
            title: market.title.substring(0, 60),
            yesAsk,
            noAsk,
            yesBid,
            noBid,
            sumOfAsks: sumOfAsks.toFixed(4),
            sumOfBids: sumOfBids.toFixed(4),
            askMispricing: ((1 - sumOfAsks) * 100).toFixed(3) + '%',
            bidMispricing: ((sumOfBids - 1) * 100).toFixed(3) + '%',
            isArbOpportunity: sumOfAsks < 0.995, // Less than $0.995 for both = profit
            spread: ((yesAsk - yesBid) * 100).toFixed(2) + '%',
          };
        })
        .sort((a, b) => {
          // Sort by arbitrage opportunity (lowest sum first)
          return parseFloat(a.sumOfAsks) - parseFloat(b.sumOfAsks);
        });

      res.json({
        totalMarkets: analysis.length,
        arbOpportunities: analysis.filter(m => m.isArbOpportunity).length,
        markets: analysis.slice(0, 50),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Market analysis error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================
  // Session Tracking Endpoints
  // ============================================

  // Get all sessions
  app.get('/api/sessions', async (_req, res) => {
    if (!sessionTracker) {
      res.status(404).json({ error: 'Session tracker not initialized' });
      return;
    }

    try {
      const sessions = sessionTracker.getCompletedSessions();
      const currentSession = await sessionTracker.getCurrentSession();

      res.json({
        current: currentSession ? {
          id: currentSession.id,
          startTime: currentSession.startTime,
          durationHours: currentSession.durationSeconds ? (currentSession.durationSeconds / 3600).toFixed(2) : null,
          netPnl: currentSession.netPnl?.toFixed(2),
          tradesExecuted: currentSession.tradesExecuted,
          isActive: currentSession.isActive,
        } : null,
        completed: sessions.map(s => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          durationHours: s.durationSeconds ? (s.durationSeconds / 3600).toFixed(2) : null,
          netPnl: s.netPnl?.toFixed(2),
          tradesExecuted: s.tradesExecuted,
          winRate: s.winRate ? (s.winRate * 100).toFixed(1) + '%' : null,
          profitFactor: s.profitFactor?.toFixed(2),
          mode: s.mode,
          notes: s.notes,
        })),
        count: sessions.length,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch sessions',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get current session details
  app.get('/api/sessions/current', async (_req, res) => {
    if (!sessionTracker) {
      res.status(404).json({ error: 'Session tracker not initialized' });
      return;
    }

    try {
      const session = await sessionTracker.getCurrentSession();
      
      if (!session) {
        res.json({ active: false, session: null });
        return;
      }

      res.json({
        active: true,
        session: {
          id: session.id,
          startTime: session.startTime,
          durationHours: session.durationSeconds ? (session.durationSeconds / 3600).toFixed(2) : null,
          startBalance: session.startBalance?.toFixed(2),
          currentBalance: session.endBalance?.toFixed(2),
          netPnl: session.netPnl?.toFixed(2),
          tradesExecuted: session.tradesExecuted,
          opportunitiesDetected: session.opportunitiesDetected,
          executionsSucceeded: session.executionsSucceeded,
          winRate: session.winRate ? (session.winRate * 100).toFixed(1) + '%' : null,
          profitFactor: session.profitFactor?.toFixed(2),
          maxDrawdown: session.maxDrawdown?.toFixed(2),
          strategiesUsed: session.strategiesUsed,
          pnlByStrategy: session.pnlByStrategy,
          mode: session.mode,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch current session',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Export sessions data (must come before /:id route)
  app.get('/api/sessions/export', async (_req, res) => {
    if (!sessionTracker) {
      res.status(404).json({ error: 'Session tracker not initialized' });
      return;
    }

    try {
      const json = sessionTracker.exportToJson();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="sessions-${new Date().toISOString().split('T')[0]}.json"`);
      res.send(json);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to export sessions',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get session by ID
  app.get('/api/sessions/:id', async (req, res) => {
    if (!sessionTracker) {
      res.status(404).json({ error: 'Session tracker not initialized' });
      return;
    }

    try {
      const session = sessionTracker.getSession(req.params['id'] || '');
      
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({
        id: session.id,
        startTime: session.startTime,
        endTime: session.endTime,
        durationHours: session.durationSeconds ? (session.durationSeconds / 3600).toFixed(2) : null,
        startBalance: session.startBalance?.toFixed(2),
        endBalance: session.endBalance?.toFixed(2),
        netPnl: session.netPnl?.toFixed(2),
        tradesExecuted: session.tradesExecuted,
        opportunitiesDetected: session.opportunitiesDetected,
        executionsSucceeded: session.executionsSucceeded,
        winRate: session.winRate ? (session.winRate * 100).toFixed(1) + '%' : null,
        profitFactor: session.profitFactor?.toFixed(2),
        sharpeRatio: session.sharpeRatio?.toFixed(2),
        maxDrawdown: session.maxDrawdown?.toFixed(2),
        maxDrawdownPercent: session.maxDrawdownPercent?.toFixed(2) + '%',
        strategiesUsed: session.strategiesUsed,
        pnlByStrategy: session.pnlByStrategy,
        mode: session.mode,
        notes: session.notes,
        isActive: session.isActive,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch session',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get session summary statistics
  app.get('/api/sessions/stats/summary', async (_req, res) => {
    if (!sessionTracker) {
      res.status(404).json({ error: 'Session tracker not initialized' });
      return;
    }

    try {
      const summary = sessionTracker.getSummary();
      
      res.json({
        totalSessions: summary.totalSessions,
        activeSessions: summary.activeSessions,
        totalTrades: summary.totalTrades,
        totalPnl: summary.totalPnl.toFixed(2),
        avgPnlPerSession: summary.avgPnlPerSession.toFixed(2),
        avgWinRate: (summary.avgWinRate * 100).toFixed(1) + '%',
        avgProfitFactor: summary.avgProfitFactor.toFixed(2),
        totalDurationHours: summary.totalDurationHours.toFixed(2),
        bestSession: summary.bestSession ? {
          id: summary.bestSession.id,
          netPnl: summary.bestSession.netPnl?.toFixed(2),
          startTime: summary.bestSession.startTime,
        } : null,
        worstSession: summary.worstSession ? {
          id: summary.worstSession.id,
          netPnl: summary.worstSession.netPnl?.toFixed(2),
          startTime: summary.worstSession.startTime,
        } : null,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to calculate session summary',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Manually start a session (if trading already running)
  app.post('/api/sessions/start', async (req, res) => {
    if (!sessionTracker) {
      res.status(404).json({ error: 'Session tracker not initialized' });
      return;
    }

    try {
      const notes = req.body?.notes as string | undefined;
      const session = await sessionTracker.startSession(notes);
      
      res.json({
        status: 'session_started',
        session: {
          id: session.id,
          startTime: session.startTime,
          startBalance: session.startBalance?.toFixed(2),
          mode: session.mode,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to start session',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Manually end a session
  app.post('/api/sessions/end', async (req, res) => {
    if (!sessionTracker) {
      res.status(404).json({ error: 'Session tracker not initialized' });
      return;
    }

    if (!sessionTracker.isSessionActive()) {
      res.status(400).json({ error: 'No active session to end' });
      return;
    }

    try {
      const notes = req.body?.notes as string | undefined;
      const session = await sessionTracker.endSession(notes);
      
      if (!session) {
        res.status(400).json({ error: 'Failed to end session' });
        return;
      }

      res.json({
        status: 'session_ended',
        session: {
          id: session.id,
          startTime: session.startTime,
          endTime: session.endTime,
          durationHours: session.durationSeconds ? (session.durationSeconds / 3600).toFixed(2) : null,
          netPnl: session.netPnl?.toFixed(2),
          tradesExecuted: session.tradesExecuted,
          winRate: session.winRate ? (session.winRate * 100).toFixed(1) + '%' : null,
          profitFactor: session.profitFactor?.toFixed(2),
          strategiesUsed: session.strategiesUsed,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to end session',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.listen(config.api.port, () => {
    log.info(`API server listening on port ${config.api.port}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down...`);

    try {
      // Stop trading engine first
      if (tradingEngine) {
        await tradingEngine.stop();
      }

      await polymarket.disconnect();
      await kalshi.disconnect();
      await closeDb();
      log.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      log.error('Error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  log.info('Trading bot started successfully');
  log.info(`Paper trading mode: ${isPaperTrading() ? 'ENABLED' : 'DISABLED - LIVE TRADING'}`);

  if (!isPaperTrading()) {
    log.warn('WARNING: Live trading is enabled. Real money is at risk!');
  }

  // Log available endpoints
  log.info('API Endpoints available:', {
    health: 'GET /health',
    markets: 'GET /api/markets',
    positions: 'GET /api/positions',
    balances: 'GET /api/balances',
    orders: 'GET /api/orders',
    orderById: 'GET /api/orders/:id',
    cancelOrder: 'DELETE /api/orders/:id',
    cancelAllOrders: 'DELETE /api/orders',
    trades: 'GET /api/trades',
    strategies: 'GET /api/strategies',
    tradingStatus: 'GET /api/trading/status',
    tradingPairs: 'GET /api/trading/pairs',
    tradingStart: 'POST /api/trading/start',
    tradingStop: 'POST /api/trading/stop',
    tradingScan: 'POST /api/trading/scan',
    killSwitch: 'POST /api/kill-switch',
    tradingDebug: 'GET /api/trading/debug',
    marketAnalysis: 'GET /api/trading/markets/analysis',
    // Session tracking endpoints
    sessions: 'GET /api/sessions',
    sessionCurrent: 'GET /api/sessions/current',
    sessionById: 'GET /api/sessions/:id',
    sessionSummary: 'GET /api/sessions/stats/summary',
    sessionExport: 'GET /api/sessions/export',
    sessionStart: 'POST /api/sessions/start',
    sessionEnd: 'POST /api/sessions/end',
  });
}

// Run main
main().catch((error) => {
  log.error('Fatal error', { error });
  process.exit(1);
});
