import { describe, it, expect, beforeEach } from 'vitest';
import { OrderManager } from '../../src/services/orderManager/OrderManager.js';
import { KillSwitch, KillSwitchTrigger } from '../../src/risk/KillSwitch.js';
import { PositionLimitsManager } from '../../src/risk/positionLimits.js';
import { DrawdownMonitor } from '../../src/risk/drawdownMonitor.js';
import type { OrderRequest, Position } from '../../src/clients/shared/interfaces.js';
import { PLATFORMS, ORDER_SIDES, ORDER_TYPES } from '../../src/config/constants.js';

describe('Risk Management Integration', () => {
  let orderManager: OrderManager;
  let killSwitch: KillSwitch;
  let positionLimits: PositionLimitsManager;

  beforeEach(() => {
    orderManager = new OrderManager();
    killSwitch = new KillSwitch(orderManager);
    orderManager.setKillSwitch(killSwitch);
    positionLimits = orderManager.getPositionLimits();
  });

  it('should prevent order placement when kill switch is active', async () => {
    // Activate kill switch
    await killSwitch.activateManually('Test');

    const order: OrderRequest = {
      platform: PLATFORMS.POLYMARKET,
      marketId: 'test-market',
      outcomeId: 'yes',
      side: ORDER_SIDES.BUY,
      price: 0.5,
      size: 100,
      type: ORDER_TYPES.GTC,
    };

    // Order should be rejected
    await expect(orderManager.placeOrder(order)).rejects.toThrow();
  });

  it('should enforce position limits before order placement', async () => {
    // Set a small limit
    positionLimits = new PositionLimitsManager({
      maxPositionSizeUsd: 100,
      maxTotalExposureUsd: 500,
    });
    orderManager['positionLimits'] = positionLimits;

    const order: OrderRequest = {
      platform: PLATFORMS.POLYMARKET,
      marketId: 'test-market',
      outcomeId: 'yes',
      side: ORDER_SIDES.BUY,
      price: 0.5,
      size: 500, // Exceeds limit
      type: ORDER_TYPES.GTC,
    };

    const check = positionLimits.checkOrder(order);
    expect(check.isAllowed).toBe(false);
  });

  it('should trigger kill switch on daily loss limit', async () => {
    killSwitch.updateDailyPnl(-1500);
    killSwitch.start();
    // Wait for check interval
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(killSwitch.isActive()).toBe(true);
    const state = killSwitch.getState();
    expect(state.trigger).toBe(KillSwitchTrigger.DAILY_LOSS_LIMIT);
    killSwitch.stop();
  });

  it('should track exposure across multiple positions', () => {
    const positions: Position[] = [
      {
        id: '1',
        platform: PLATFORMS.POLYMARKET,
        marketId: 'm1',
        outcomeId: 'yes',
        outcomeName: 'Yes',
        side: 'long',
        size: 2000,
        avgEntryPrice: 0.5,
        currentPrice: 0.5,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isOpen: true,
      },
      {
        id: '2',
        platform: PLATFORMS.KALSHI,
        marketId: 'm2',
        outcomeId: 'yes',
        outcomeName: 'Yes',
        side: 'long',
        size: 3000,
        avgEntryPrice: 0.5,
        currentPrice: 0.5,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isOpen: true,
      },
    ];

    const exposureTracker = orderManager.getExposureTracker();
    exposureTracker.updateExposure(positions);

    const metrics = exposureTracker.getMetrics();
    expect(metrics.totalExposure).toBe(5000);
    expect(metrics.platformExposure['polymarket']).toBe(2000);
    expect(metrics.platformExposure['kalshi']).toBe(3000);
  });

  it('should prevent orders when total exposure limit is reached', () => {
    // Set up positions that reach exposure limit
    const positions: Position[] = [
      {
        id: '1',
        platform: PLATFORMS.POLYMARKET,
        marketId: 'm1',
        outcomeId: 'yes',
        outcomeName: 'Yes',
        side: 'long',
        size: 40000, // Close to limit
        avgEntryPrice: 0.5,
        currentPrice: 0.5,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isOpen: true,
      },
    ];

    positionLimits = new PositionLimitsManager({
      maxPositionSizeUsd: 10000,
      maxTotalExposureUsd: 50000,
    });

    // Update with existing position
    positions.forEach((p) => positionLimits.updatePosition(p));

    // Try to place order that would exceed limit
    const order: OrderRequest = {
      platform: PLATFORMS.POLYMARKET,
      marketId: 'm2',
      outcomeId: 'yes',
      side: ORDER_SIDES.BUY,
      price: 0.5,
      size: 25000, // Would exceed 50000 limit
      type: ORDER_TYPES.GTC,
    };

    const check = positionLimits.checkOrder(order);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('total exposure limit');
  });
});
