import { describe, it, expect } from 'vitest';
import {
  calculateMidPrice,
  calculateSpread,
  calculateRealizedPnl,
  calculateMaxDrawdown,
  roundToTick,
  calculateArbitrageProfit,
} from '../../src/utils/math.js';
import { sha256, signRSAPSS } from '../../src/utils/crypto.js';
import * as crypto from 'crypto';

describe('Math Utilities', () => {
  describe('calculateRealizedPnl', () => {
    it('should calculate profit for long position', () => {
      const pnl = calculateRealizedPnl(0.5, 0.6, 100, 'buy');
      expect(pnl).toBeCloseTo(10, 5); // (0.6 - 0.5) * 100 = 10
    });

    it('should calculate loss for long position', () => {
      const pnl = calculateRealizedPnl(0.5, 0.4, 100, 'buy');
      expect(pnl).toBeCloseTo(-10, 5); // (0.4 - 0.5) * 100 = -10
    });

    it('should calculate profit for short position', () => {
      const pnl = calculateRealizedPnl(0.6, 0.5, 100, 'sell');
      expect(pnl).toBeCloseTo(10, 5); // (0.6 - 0.5) * 100 = 10
    });
  });

  describe('calculateMidPrice', () => {
    it('should calculate mid price correctly', () => {
      const mid = calculateMidPrice(0.4, 0.6);
      expect(mid).toBe(0.5);
    });

    it('should handle equal bid and ask', () => {
      const mid = calculateMidPrice(0.5, 0.5);
      expect(mid).toBe(0.5);
    });
  });

  describe('calculateSpread', () => {
    it('should calculate spread correctly', () => {
      const spread = calculateSpread(0.4, 0.6);
      expect(spread).toBeCloseTo(0.2, 5);
    });

    it('should return zero for equal prices', () => {
      const spread = calculateSpread(0.5, 0.5);
      expect(spread).toBe(0);
    });
  });

  describe('calculateArbitrageProfit', () => {
    it('should calculate profit after fees', () => {
      const profit = calculateArbitrageProfit(0.48, 0.52, 1000, 0.01, 0.01);
      // Gross: (0.52 - 0.48) * 1000 = 40
      // Fees: 1000 * 0.01 + 1000 * 0.01 = 20
      // Net: 40 - 20 = 20
      expect(profit).toBeCloseTo(20, 2);
    });

    it('should handle zero fees', () => {
      const profit = calculateArbitrageProfit(0.48, 0.52, 1000, 0, 0);
      expect(profit).toBeCloseTo(40, 2);
    });
  });

  describe('roundToTick', () => {
    it('should round to nearest tick', () => {
      expect(roundToTick(0.523, 0.01)).toBeCloseTo(0.52, 5);
      expect(roundToTick(0.527, 0.01)).toBeCloseTo(0.53, 5);
    });

    it('should round up when specified', () => {
      expect(roundToTick(0.521, 0.01, 'up')).toBeCloseTo(0.53, 5);
    });

    it('should round down when specified', () => {
      expect(roundToTick(0.529, 0.01, 'down')).toBeCloseTo(0.52, 5);
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('should calculate max drawdown correctly', () => {
      const equitySeries = [10000, 11000, 10500, 12000, 10000, 11500];
      const drawdown = calculateMaxDrawdown(equitySeries);
      expect(drawdown).toBeGreaterThan(0);
      expect(drawdown).toBeLessThanOrEqual(1);
    });

    it('should return 0 for empty series', () => {
      const drawdown = calculateMaxDrawdown([]);
      expect(drawdown).toBe(0);
    });

    it('should return 0 for increasing series', () => {
      const equitySeries = [10000, 11000, 12000, 13000];
      const drawdown = calculateMaxDrawdown(equitySeries);
      expect(drawdown).toBe(0);
    });
  });
});

describe('Crypto Utilities', () => {
  describe('sha256', () => {
    it('should hash string correctly', () => {
      const hash = sha256('test');
      expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });

    it('should produce consistent hashes', () => {
      const hash1 = sha256('test');
      const hash2 = sha256('test');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = sha256('test1');
      const hash2 = sha256('test2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('signRSAPSS', () => {
    it('should sign message with RSA-PSS', () => {
      // Generate a test key pair
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const message = 'test message';
      const signature = signRSAPSS(privateKey, message);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should produce different signatures for different messages', () => {
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const sig1 = signRSAPSS(privateKey, 'message1');
      const sig2 = signRSAPSS(privateKey, 'message2');

      expect(sig1).not.toBe(sig2);
    });
  });
});
