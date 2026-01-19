/**
 * Unit tests for math utilities
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSpread,
  calculateSpreadBps,
  calculateMidPrice,
  calculateRealizedPnl,
  calculateUnrealizedPnl,
  calculateFee,
  calculateArbitrageProfit,
  calculateSharpeRatio,
  calculateWinRate,
  calculateProfitFactor,
  calculateMaxDrawdown,
} from '../../src/utils/math.js';

describe('Math Utilities', () => {
  describe('calculateSpread', () => {
    it('should calculate spread correctly', () => {
      expect(calculateSpread(0.49, 0.51)).toBeCloseTo(0.02, 5);
      expect(calculateSpread(0.5, 0.5)).toBe(0);
    });

    it('should return 0 for invalid inputs', () => {
      expect(calculateSpread(0, 0)).toBe(0);
      expect(calculateSpread(0.6, 0.5)).toBe(0); // ask < bid
    });
  });

  describe('calculateSpreadBps', () => {
    it('should calculate spread in basis points', () => {
      expect(calculateSpreadBps(0.49, 0.51)).toBeCloseTo(200, 1); // 2% = 200 bps
    });
  });

  describe('calculateMidPrice', () => {
    it('should calculate mid price correctly', () => {
      expect(calculateMidPrice(0.49, 0.51)).toBe(0.5);
    });
  });

  describe('calculateRealizedPnl', () => {
    it('should calculate P&L for long position', () => {
      // Buy at 0.5, sell at 0.6, size 100
      expect(calculateRealizedPnl(0.5, 0.6, 100, 'buy')).toBeCloseTo(10, 5);
    });

    it('should calculate P&L for short position', () => {
      // Sell at 0.6, buy back at 0.5, size 100
      expect(calculateRealizedPnl(0.6, 0.5, 100, 'sell')).toBeCloseTo(10, 5);
    });
  });

  describe('calculateFee', () => {
    it('should calculate fee correctly', () => {
      expect(calculateFee(1000, 0.01)).toBe(10); // 1% of 1000
    });
  });

  describe('calculateArbitrageProfit', () => {
    it('should calculate arbitrage profit after fees', () => {
      // Buy at 0.48, sell at 0.52, size 1000, 1% fees each
      const profit = calculateArbitrageProfit(0.48, 0.52, 1000, 0.01, 0.01);
      expect(profit).toBeCloseTo(20, 2); // 40 - 20 fees = 20
    });
  });

  describe('calculateWinRate', () => {
    it('should calculate win rate correctly', () => {
      expect(calculateWinRate(6, 4)).toBe(0.6); // 60%
      expect(calculateWinRate(0, 0)).toBe(0);
    });
  });

  describe('calculateProfitFactor', () => {
    it('should calculate profit factor correctly', () => {
      expect(calculateProfitFactor(100, 50)).toBe(2); // 2:1
      expect(calculateProfitFactor(0, 0)).toBe(0);
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('should calculate max drawdown correctly', () => {
      const equitySeries = [100, 110, 105, 120, 100, 130];
      const drawdown = calculateMaxDrawdown(equitySeries);
      expect(drawdown).toBeGreaterThan(0);
    });
  });
});
