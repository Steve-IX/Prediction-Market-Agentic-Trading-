import { getConfig, isPaperTrading, validateCredentials } from './config/index.js';
import { logger } from './utils/logger.js';
import { initializeDb, closeDb } from './database/index.js';
import { PolymarketClient } from './clients/polymarket/index.js';
import { KalshiClient } from './clients/kalshi/index.js';
import { OrderManager } from './services/orderManager/index.js';
import { TradingEngine } from './tradingEngine.js';
import { getMetrics, getContentType } from './utils/metrics.js';
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

  // Initialize Trading Engine
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
  }

  // Start metrics server
  if (config.api.enableMetrics) {
    const metricsApp = express();

    metricsApp.get('/metrics', async (_req, res) => {
      try {
        const metrics = await getMetrics();
        res.set('Content-Type', getContentType());
        res.send(metrics);
      } catch (error) {
        res.status(500).send('Error collecting metrics');
      }
    });

    metricsApp.listen(config.api.metricsPort, () => {
      log.info(`Metrics server listening on port ${config.api.metricsPort}`);
    });
  }

  // Start API server
  const app = express();
  app.use(express.json());

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
  app.post('/api/trading/start', async (_req, res) => {
    if (!tradingEngine) {
      return res.status(404).json({ error: 'Trading engine not initialized' });
    }

    const state = tradingEngine.getState();
    if (state.isRunning) {
      res.status(400).json({ error: 'Trading engine already running' });
      return;
    }

    try {
      await tradingEngine.start();
      res.json({ status: 'started', state: tradingEngine.getState() });
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
  app.post('/api/trading/stop', async (_req, res) => {
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
      res.json({ status: 'stopped', state: tradingEngine.getState() });
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
  });
}

// Run main
main().catch((error) => {
  log.error('Fatal error', { error });
  process.exit(1);
});
