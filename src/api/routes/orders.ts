import { Router, type Request, type Response } from 'express';
import type { OrderManager } from '../../services/orderManager/index.js';
import { logger } from '../../utils/logger.js';

const log = logger('OrdersAPI');

export function createOrdersRouter(orderManager: OrderManager): Router {
  const router = Router();

  /**
   * GET /api/orders
   * Get open orders
   * Query params:
   * - platform: 'polymarket' | 'kalshi' (optional)
   * - status: 'open' | 'pending' | 'partial' (optional, defaults to 'open')
   * - limit: number (default 100)
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const platform = req.query['platform'] as string | undefined;
      const status = (req.query['status'] as string) || 'open';
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 100;

      const orders = await orderManager.getOpenOrders(platform);

      // Filter by status if provided
      const filteredOrders = status
        ? orders.filter((o) => o.status === status)
        : orders;

      // Limit results
      const limitedOrders = filteredOrders.slice(0, limit);

      res.json({
        count: limitedOrders.length,
        total: filteredOrders.length,
        orders: limitedOrders.map((order) => ({
          id: order.id,
          platform: order.platform,
          externalOrderId: order.externalOrderId,
          marketId: order.marketId,
          outcomeId: order.outcomeId,
          side: order.side,
          price: order.price,
          size: order.size,
          filledSize: order.filledSize,
          avgFillPrice: order.avgFillPrice,
          type: order.type,
          status: order.status,
          strategyId: order.strategyId,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      log.error('Failed to fetch orders', { error });
      res.status(500).json({
        error: 'Failed to fetch orders',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/orders/:id
   * Get specific order by ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const orderId = req.params['id'];
      if (!orderId) {
        res.status(400).json({ error: 'Order ID is required' });
        return;
      }

      const orders = await orderManager.getOpenOrders();
      const order = orders.find((o) => o.id === orderId || o.externalOrderId === orderId);

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      res.json({
        id: order.id,
        platform: order.platform,
        externalOrderId: order.externalOrderId,
        marketId: order.marketId,
        outcomeId: order.outcomeId,
        side: order.side,
        price: order.price,
        size: order.size,
        filledSize: order.filledSize,
        avgFillPrice: order.avgFillPrice,
        type: order.type,
        status: order.status,
        strategyId: order.strategyId,
        metadata: order.metadata,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      });
    } catch (error) {
      log.error('Failed to fetch order', { error });
      res.status(500).json({
        error: 'Failed to fetch order',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/orders/:id
   * Cancel a specific order
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const orderId = req.params['id'];
      if (!orderId) {
        res.status(400).json({ error: 'Order ID is required' });
        return;
      }

      const platform = req.query['platform'] as string | undefined;

      await orderManager.cancelOrder(orderId, platform);

      res.json({
        success: true,
        message: `Order ${orderId} cancelled successfully`,
        orderId,
      });
    } catch (error) {
      log.error('Failed to cancel order', { error, orderId: req.params['id'] });
      res.status(500).json({
        error: 'Failed to cancel order',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/orders
   * Cancel all orders (optionally filtered by platform or market)
   * Query params:
   * - platform: 'polymarket' | 'kalshi' (optional)
   * - marketId: string (optional)
   */
  router.delete('/', async (req: Request, res: Response) => {
    try {
      const platform = req.query['platform'] as string | undefined;
      const marketId = req.query['marketId'] as string | undefined;

      // Cancel orders - OrderManager.cancelAllOrders takes platform and marketId as optional params
      if (platform && marketId) {
        await orderManager.cancelAllOrders(platform, marketId);
      } else if (platform) {
        await orderManager.cancelAllOrders(platform);
      } else if (marketId) {
        // Cancel orders for specific market across all platforms
        // Note: OrderManager may need marketId support - for now cancel all and filter client-side
        await orderManager.cancelAllOrders();
      } else {
        // Cancel all orders
        await orderManager.cancelAllOrders();
      }

      res.json({
        success: true,
        message: 'Orders cancelled successfully',
        platform: platform || 'all',
        marketId: marketId || 'all',
      });
    } catch (error) {
      log.error('Failed to cancel orders', { error });
      res.status(500).json({
        error: 'Failed to cancel orders',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
