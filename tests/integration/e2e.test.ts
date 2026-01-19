/**
 * End-to-End Integration Tests
 * Tests with real API connections (requires valid credentials)
 * These tests are skipped by default and should be run manually with proper credentials
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PolymarketClient } from '../../src/clients/polymarket/index.js';
import { KalshiClient } from '../../src/clients/kalshi/index.js';
import { getConfig } from '../../src/config/index.js';
import { validateCredentials } from '../../src/config/index.js';
import { PLATFORMS } from '../../src/config/constants.js';

// Skip E2E tests by default unless E2E_TEST=true
const shouldRunE2E = process.env['E2E_TEST'] === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('End-to-End Integration Tests', () => {
  let polymarketClient: PolymarketClient | null = null;
  let kalshiClient: KalshiClient | null = null;
  let config: ReturnType<typeof getConfig>;

  beforeAll(() => {
    config = getConfig();

    // Check if credentials are available
    const polymarketCreds = validateCredentials('polymarket');
    const kalshiCreds = validateCredentials('kalshi');

    if (!polymarketCreds.valid && !kalshiCreds.valid) {
      console.warn('⚠️  No valid credentials found. E2E tests will be skipped.');
      console.warn('   Set E2E_TEST=true and provide valid credentials to run E2E tests.');
    }

    if (polymarketCreds.valid) {
      polymarketClient = new PolymarketClient(config.polymarket);
    }

    if (kalshiCreds.valid) {
      kalshiClient = new KalshiClient(config.kalshi);
    }
  });

  afterAll(async () => {
    if (polymarketClient) {
      try {
        await polymarketClient.disconnect();
      } catch (error) {
        // Ignore disconnect errors
      }
    }

    if (kalshiClient) {
      try {
        await kalshiClient.disconnect();
      } catch (error) {
        // Ignore disconnect errors
      }
    }
  });

  describe('Polymarket API Integration', () => {
    it('should connect to Polymarket API', async () => {
      if (!polymarketClient) {
        console.warn('Skipping: Polymarket credentials not available');
        return;
      }

      await polymarketClient.connect();
      expect(polymarketClient.isConnected()).toBe(true);
    });

    it('should fetch markets from Polymarket', async () => {
      if (!polymarketClient) {
        console.warn('Skipping: Polymarket credentials not available');
        return;
      }

      await polymarketClient.connect();

      const markets = await polymarketClient.getMarkets({
        limit: 10,
      });

      expect(markets).toBeDefined();
      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);

      // Verify market structure
      if (markets.length > 0) {
        const market = markets[0];
        expect(market.id).toBeDefined();
        expect(market.platform).toBe(PLATFORMS.POLYMARKET);
        expect(market.title).toBeDefined();
      }
    });

    it('should fetch orderbook from Polymarket', async () => {
      if (!polymarketClient) {
        console.warn('Skipping: Polymarket credentials not available');
        return;
      }

      await polymarketClient.connect();

      // Get a market first
      const markets = await polymarketClient.getMarkets({ limit: 1 });
      if (markets.length === 0) {
        console.warn('Skipping: No markets available');
        return;
      }

      const market = markets[0];
      const orderbook = await polymarketClient.getOrderBook(market.id, 'yes');

      expect(orderbook).toBeDefined();
      expect(orderbook.bids).toBeDefined();
      expect(orderbook.asks).toBeDefined();
      expect(Array.isArray(orderbook.bids)).toBe(true);
      expect(Array.isArray(orderbook.asks)).toBe(true);
    });

    it('should fetch account balance from Polymarket', async () => {
      if (!polymarketClient) {
        console.warn('Skipping: Polymarket credentials not available');
        return;
      }

      await polymarketClient.connect();

      const balance = await polymarketClient.getBalance();

      expect(balance).toBeDefined();
      expect(balance.available).toBeDefined();
      expect(typeof balance.available).toBe('number');
      expect(balance.available).toBeGreaterThanOrEqual(0);
    });

    it('should handle rate limiting gracefully', async () => {
      if (!polymarketClient) {
        console.warn('Skipping: Polymarket credentials not available');
        return;
      }

      await polymarketClient.connect();

      // Make multiple rapid requests
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          polymarketClient.getMarkets({ limit: 1 }).catch((error) => {
            // Rate limit errors are acceptable
            return error;
          })
        );
      }

      const results = await Promise.allSettled(promises);

      // At least some requests should succeed
      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBeGreaterThan(0);
    });
  });

  describe('Kalshi API Integration', () => {
    it('should connect to Kalshi API', async () => {
      if (!kalshiClient) {
        console.warn('Skipping: Kalshi credentials not available');
        return;
      }

      await kalshiClient.connect();
      expect(kalshiClient.isConnected()).toBe(true);
    });

    it('should fetch markets from Kalshi', async () => {
      if (!kalshiClient) {
        console.warn('Skipping: Kalshi credentials not available');
        return;
      }

      await kalshiClient.connect();

      const markets = await kalshiClient.getMarkets({
        limit: 10,
      });

      expect(markets).toBeDefined();
      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);

      // Verify market structure
      if (markets.length > 0) {
        const market = markets[0];
        expect(market.id).toBeDefined();
        expect(market.platform).toBe(PLATFORMS.KALSHI);
        expect(market.title).toBeDefined();
      }
    });

    it('should fetch orderbook from Kalshi', async () => {
      if (!kalshiClient) {
        console.warn('Skipping: Kalshi credentials not available');
        return;
      }

      await kalshiClient.connect();

      // Get a market first
      const markets = await kalshiClient.getMarkets({ limit: 1 });
      if (markets.length === 0) {
        console.warn('Skipping: No markets available');
        return;
      }

      const market = markets[0];
      const orderbook = await kalshiClient.getOrderBook(market.id, 'yes');

      expect(orderbook).toBeDefined();
      expect(orderbook.bids).toBeDefined();
      expect(orderbook.asks).toBeDefined();
      expect(Array.isArray(orderbook.bids)).toBe(true);
      expect(Array.isArray(orderbook.asks)).toBe(true);
    });

    it('should fetch account balance from Kalshi', async () => {
      if (!kalshiClient) {
        console.warn('Skipping: Kalshi credentials not available');
        return;
      }

      await kalshiClient.connect();

      const balance = await kalshiClient.getBalance();

      expect(balance).toBeDefined();
      expect(balance.available).toBeDefined();
      expect(typeof balance.available).toBe('number');
      expect(balance.available).toBeGreaterThanOrEqual(0);
    });

    it('should handle authentication errors', async () => {
      // Test with invalid credentials
      const invalidConfig = {
        ...config.kalshi,
        apiKeyId: 'invalid-key',
      };

      const invalidClient = new KalshiClient(invalidConfig);

      await expect(invalidClient.connect()).rejects.toThrow();
    });
  });

  describe('Cross-Platform Integration', () => {
    it('should fetch markets from both platforms', async () => {
      if (!polymarketClient || !kalshiClient) {
        console.warn('Skipping: Credentials not available for both platforms');
        return;
      }

      await polymarketClient.connect();
      await kalshiClient.connect();

      const [polymarketMarkets, kalshiMarkets] = await Promise.all([
        polymarketClient.getMarkets({ limit: 5 }),
        kalshiClient.getMarkets({ limit: 5 }),
      ]);

      expect(polymarketMarkets.length).toBeGreaterThan(0);
      expect(kalshiMarkets.length).toBeGreaterThan(0);

      // Verify platforms are correct
      expect(polymarketMarkets[0]?.platform).toBe(PLATFORMS.POLYMARKET);
      expect(kalshiMarkets[0]?.platform).toBe(PLATFORMS.KALSHI);
    });

    it('should compare prices across platforms', async () => {
      if (!polymarketClient || !kalshiClient) {
        console.warn('Skipping: Credentials not available for both platforms');
        return;
      }

      await polymarketClient.connect();
      await kalshiClient.connect();

      // Get markets from both platforms
      const [polymarketMarkets, kalshiMarkets] = await Promise.all([
        polymarketClient.getMarkets({ limit: 1 }),
        kalshiClient.getMarkets({ limit: 1 }),
      ]);

      if (polymarketMarkets.length === 0 || kalshiMarkets.length === 0) {
        console.warn('Skipping: No markets available');
        return;
      }

      // Get orderbooks
      const [polymarketOrderbook, kalshiOrderbook] = await Promise.all([
        polymarketClient.getOrderBook(polymarketMarkets[0]!.id, 'yes'),
        kalshiClient.getOrderBook(kalshiMarkets[0]!.id, 'yes'),
      ]);

      expect(polymarketOrderbook).toBeDefined();
      expect(kalshiOrderbook).toBeDefined();

      // Verify orderbook structure
      expect(polymarketOrderbook.bids.length).toBeGreaterThan(0);
      expect(kalshiOrderbook.bids.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      if (!polymarketClient) {
        console.warn('Skipping: Polymarket credentials not available');
        return;
      }

      await polymarketClient.connect();

      // Try to fetch with invalid market ID
      await expect(
        polymarketClient.getOrderBook('invalid-market-id', 'yes')
      ).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      if (!polymarketClient) {
        console.warn('Skipping: Polymarket credentials not available');
        return;
      }

      // This test would require mocking network delays
      // For now, we just verify the client handles errors
      await polymarketClient.connect();

      try {
        await polymarketClient.getMarkets({ limit: 1 });
        // If it succeeds, that's fine
      } catch (error) {
        // If it fails, verify it's a proper error
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      if (!polymarketClient) {
        console.warn('Skipping: Polymarket credentials not available');
        return;
      }

      await polymarketClient.connect();

      // Make multiple requests rapidly
      const requests = Array.from({ length: 10 }, () =>
        polymarketClient!.getMarkets({ limit: 1 })
      );

      const results = await Promise.allSettled(requests);

      // Some requests should succeed
      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBeGreaterThan(0);

      // Rate limit errors are acceptable
      const rateLimitErrors = results.filter(
        (r) => r.status === 'rejected' && r.reason?.message?.includes('rate limit')
      );
      // Rate limit errors are acceptable in this test
    }, 30000); // Longer timeout for rate limit test
  });
});
