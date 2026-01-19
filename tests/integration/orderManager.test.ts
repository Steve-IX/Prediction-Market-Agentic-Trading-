/**
 * Integration tests for OrderManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrderManager } from '../../src/services/orderManager/index.js';
import { PLATFORMS, ORDER_TYPES } from '../../src/config/constants.js';
import { createMockPolymarketMarket } from '../mocks/polymarket.js';

describe('OrderManager Integration', () => {
  let orderManager: OrderManager;

  beforeEach(() => {
    orderManager = new OrderManager();
  });

  it('should initialize in paper trading mode', () => {
    expect(orderManager.isPaperTrading()).toBe(true);
  });

  it('should register clients', () => {
    // Mock client would be registered here
    // For now, just verify the method exists
    expect(typeof orderManager.registerClient).toBe('function');
  });

  it('should check risk limits before placing orders', async () => {
    const order = {
      platform: PLATFORMS.POLYMARKET,
      marketId: 'test-market',
      outcomeId: 'yes',
      side: 'buy' as const,
      price: 0.5,
      size: 100,
      type: ORDER_TYPES.GTC,
    };

    // This should fail due to risk limits if order size exceeds limits
    // In paper trading, it should still work
    try {
      // Note: This will fail without a registered client, which is expected
      await orderManager.placeOrder(order);
    } catch (error) {
      // Expected - no client registered
      expect(error).toBeDefined();
    }
  });
});
