import type { NormalizedMarket, OrderBook } from '../../clients/shared/interfaces.js';
import type { MarketPair } from '../../services/matching/index.js';
import { logger, type Logger } from '../../utils/logger.js';
import { arbitrageOpportunities, arbitrageSpread } from '../../utils/metrics.js';
import { getConfig } from '../../config/index.js';
import { PLATFORMS, OUTCOMES } from '../../config/constants.js';

/**
 * Arbitrage opportunity types
 */
export enum ArbitrageType {
  SINGLE_PLATFORM = 'single_platform',
  CROSS_PLATFORM = 'cross_platform',
}

/**
 * Leg of an arbitrage trade
 */
export interface ArbitrageLeg {
  platform: string;
  marketId: string;
  outcomeId: string;
  outcomeName: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  maxSize: number;
}

/**
 * Arbitrage opportunity
 */
export interface ArbitrageOpportunity {
  id: string;
  type: ArbitrageType;
  legs: ArbitrageLeg[];
  grossSpread: number; // Raw spread before fees
  netSpread: number; // Spread after fees
  spreadBps: number; // Spread in basis points
  maxProfit: number; // Maximum profit at full size
  maxSize: number; // Maximum executable size
  confidence: number; // For cross-platform, from matching
  detectedAt: Date;
  expiresAt: Date;
  isValid: boolean;
}

/**
 * Fee structure by platform
 */
interface FeeStructure {
  makerFee: number;
  takerFee: number;
}

/**
 * Arbitrage Detector
 * Detects arbitrage opportunities both within a single platform and across platforms
 */
export class ArbitrageDetector {
  private log: Logger;
  private minSpreadBps: number;
  private crossPlatformBuffer: number;
  private fees: Map<string, FeeStructure>;

  constructor() {
    this.log = logger('ArbitrageDetector');

    const config = getConfig();
    this.minSpreadBps = config.risk.minArbitrageSpreadBps;

    // Cross-platform buffer to account for oracle risk, settlement timing, etc.
    this.crossPlatformBuffer = 0.15; // 15 cents buffer for cross-platform arb

    // Platform fee structures
    this.fees = new Map([
      [PLATFORMS.POLYMARKET, { makerFee: 0, takerFee: 0 }],
      [PLATFORMS.KALSHI, { makerFee: 0, takerFee: 0.01 }], // 1% taker fee
    ]);
  }

  /**
   * Detect single-platform arbitrage
   * Occurs when YES ask + NO ask < $1.00
   */
  detectSinglePlatform(market: NormalizedMarket, orderBook?: { yes: OrderBook; no: OrderBook }): ArbitrageOpportunity | null {
    if (!market.isActive) return null;

    // Get YES and NO outcomes
    const yesOutcome = market.outcomes.find((o) => o.type === OUTCOMES.YES);
    const noOutcome = market.outcomes.find((o) => o.type === OUTCOMES.NO);

    if (!yesOutcome || !noOutcome) return null;

    // Get best ask prices (buy prices)
    let yesBestAsk = yesOutcome.bestAsk;
    let noBestAsk = noOutcome.bestAsk;
    let yesAskSize = yesOutcome.askSize;
    let noAskSize = noOutcome.askSize;

    // Use order book if provided for more accurate pricing
    if (orderBook) {
      if (orderBook.yes.asks.length > 0) {
        yesBestAsk = orderBook.yes.asks[0]!.price;
        yesAskSize = orderBook.yes.asks[0]!.size;
      }
      if (orderBook.no.asks.length > 0) {
        noBestAsk = orderBook.no.asks[0]!.price;
        noAskSize = orderBook.no.asks[0]!.size;
      }
    }

    // Calculate spread
    const totalCost = yesBestAsk + noBestAsk;
    const grossSpread = 1 - totalCost;

    if (grossSpread <= 0) return null;

    // Calculate fees
    const fees = this.fees.get(market.platform)!;
    const totalFees = (yesBestAsk + noBestAsk) * fees.takerFee;
    const netSpread = grossSpread - totalFees;
    const spreadBps = (netSpread / 1) * 10000;

    // Check minimum spread
    if (spreadBps < this.minSpreadBps) return null;

    // Calculate max size (limited by smaller order book depth)
    const maxSize = Math.min(yesAskSize, noAskSize);

    const opportunity: ArbitrageOpportunity = {
      id: `single:${market.platform}:${market.externalId}:${Date.now()}`,
      type: ArbitrageType.SINGLE_PLATFORM,
      legs: [
        {
          platform: market.platform,
          marketId: market.externalId,
          outcomeId: yesOutcome.externalId,
          outcomeName: 'YES',
          side: 'BUY',
          price: yesBestAsk,
          size: maxSize,
          maxSize: yesAskSize,
        },
        {
          platform: market.platform,
          marketId: market.externalId,
          outcomeId: noOutcome.externalId,
          outcomeName: 'NO',
          side: 'BUY',
          price: noBestAsk,
          size: maxSize,
          maxSize: noAskSize,
        },
      ],
      grossSpread,
      netSpread,
      spreadBps,
      maxProfit: netSpread * maxSize,
      maxSize,
      confidence: 1.0, // Same platform, no matching uncertainty
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 5000), // 5 second validity
      isValid: true,
    };

    // Record metrics
    arbitrageOpportunities.labels(ArbitrageType.SINGLE_PLATFORM).inc();
    arbitrageSpread.observe(spreadBps);

    this.log.info('Single-platform arbitrage detected', {
      market: market.title,
      platform: market.platform,
      spreadBps: spreadBps.toFixed(2),
      maxProfit: opportunity.maxProfit.toFixed(4),
    });

    return opportunity;
  }

  /**
   * Detect cross-platform arbitrage
   * Occurs when Polymarket YES + Kalshi NO < $1.00 (or vice versa)
   */
  detectCrossPlatform(
    pair: MarketPair,
    orderBooks?: {
      polymarket: { yes: OrderBook; no: OrderBook };
      kalshi: { yes: OrderBook; no: OrderBook };
    }
  ): ArbitrageOpportunity | null {
    const { polymarketMarket, kalshiMarket } = pair;

    if (!polymarketMarket.isActive || !kalshiMarket.isActive) return null;

    // Get outcomes
    const polyYes = polymarketMarket.outcomes.find((o) => o.type === OUTCOMES.YES);
    const polyNo = polymarketMarket.outcomes.find((o) => o.type === OUTCOMES.NO);
    const kalshiYes = kalshiMarket.outcomes.find((o) => o.type === OUTCOMES.YES);
    const kalshiNo = kalshiMarket.outcomes.find((o) => o.type === OUTCOMES.NO);

    if (!polyYes || !polyNo || !kalshiYes || !kalshiNo) return null;

    // Get prices from order books or outcomes
    let polyYesBestAsk = polyYes.bestAsk;
    let polyNoBestAsk = polyNo.bestAsk;
    let kalshiYesBestAsk = kalshiYes.bestAsk;
    let kalshiNoBestAsk = kalshiNo.bestAsk;

    let polyYesSize = polyYes.askSize;
    let polyNoSize = polyNo.askSize;
    let kalshiYesSize = kalshiYes.askSize;
    let kalshiNoSize = kalshiNo.askSize;

    if (orderBooks) {
      if (orderBooks.polymarket.yes.asks[0]) {
        polyYesBestAsk = orderBooks.polymarket.yes.asks[0].price;
        polyYesSize = orderBooks.polymarket.yes.asks[0].size;
      }
      if (orderBooks.polymarket.no.asks[0]) {
        polyNoBestAsk = orderBooks.polymarket.no.asks[0].price;
        polyNoSize = orderBooks.polymarket.no.asks[0].size;
      }
      if (orderBooks.kalshi.yes.asks[0]) {
        kalshiYesBestAsk = orderBooks.kalshi.yes.asks[0].price;
        kalshiYesSize = orderBooks.kalshi.yes.asks[0].size;
      }
      if (orderBooks.kalshi.no.asks[0]) {
        kalshiNoBestAsk = orderBooks.kalshi.no.asks[0].price;
        kalshiNoSize = orderBooks.kalshi.no.asks[0].size;
      }
    }

    // Check both directions:
    // 1. Buy Polymarket YES + Kalshi NO
    // 2. Buy Polymarket NO + Kalshi YES

    const opportunities: ArbitrageOpportunity[] = [];

    // Direction 1: Poly YES + Kalshi NO
    const cost1 = polyYesBestAsk + kalshiNoBestAsk;
    const gross1 = 1 - cost1 - this.crossPlatformBuffer;

    if (gross1 > 0) {
      const fees1 = this.calculateCrossPlatformFees(polyYesBestAsk, kalshiNoBestAsk);
      const net1 = gross1 - fees1;
      const spreadBps1 = (net1 / 1) * 10000;

      if (spreadBps1 >= this.minSpreadBps) {
        const maxSize1 = Math.min(polyYesSize, kalshiNoSize);

        opportunities.push({
          id: `cross:${pair.id}:poly-yes-kalshi-no:${Date.now()}`,
          type: ArbitrageType.CROSS_PLATFORM,
          legs: [
            {
              platform: PLATFORMS.POLYMARKET,
              marketId: polymarketMarket.externalId,
              outcomeId: polyYes.externalId,
              outcomeName: 'YES',
              side: 'BUY',
              price: polyYesBestAsk,
              size: maxSize1,
              maxSize: polyYesSize,
            },
            {
              platform: PLATFORMS.KALSHI,
              marketId: kalshiMarket.externalId,
              outcomeId: kalshiNo.externalId,
              outcomeName: 'NO',
              side: 'BUY',
              price: kalshiNoBestAsk,
              size: maxSize1,
              maxSize: kalshiNoSize,
            },
          ],
          grossSpread: gross1 + this.crossPlatformBuffer, // Add buffer back for reporting
          netSpread: net1,
          spreadBps: spreadBps1,
          maxProfit: net1 * maxSize1,
          maxSize: maxSize1,
          confidence: pair.confidence,
          detectedAt: new Date(),
          expiresAt: new Date(Date.now() + 5000),
          isValid: true,
        });
      }
    }

    // Direction 2: Poly NO + Kalshi YES
    const cost2 = polyNoBestAsk + kalshiYesBestAsk;
    const gross2 = 1 - cost2 - this.crossPlatformBuffer;

    if (gross2 > 0) {
      const fees2 = this.calculateCrossPlatformFees(polyNoBestAsk, kalshiYesBestAsk);
      const net2 = gross2 - fees2;
      const spreadBps2 = (net2 / 1) * 10000;

      if (spreadBps2 >= this.minSpreadBps) {
        const maxSize2 = Math.min(polyNoSize, kalshiYesSize);

        opportunities.push({
          id: `cross:${pair.id}:poly-no-kalshi-yes:${Date.now()}`,
          type: ArbitrageType.CROSS_PLATFORM,
          legs: [
            {
              platform: PLATFORMS.POLYMARKET,
              marketId: polymarketMarket.externalId,
              outcomeId: polyNo.externalId,
              outcomeName: 'NO',
              side: 'BUY',
              price: polyNoBestAsk,
              size: maxSize2,
              maxSize: polyNoSize,
            },
            {
              platform: PLATFORMS.KALSHI,
              marketId: kalshiMarket.externalId,
              outcomeId: kalshiYes.externalId,
              outcomeName: 'YES',
              side: 'BUY',
              price: kalshiYesBestAsk,
              size: maxSize2,
              maxSize: kalshiYesSize,
            },
          ],
          grossSpread: gross2 + this.crossPlatformBuffer,
          netSpread: net2,
          spreadBps: spreadBps2,
          maxProfit: net2 * maxSize2,
          maxSize: maxSize2,
          confidence: pair.confidence,
          detectedAt: new Date(),
          expiresAt: new Date(Date.now() + 5000),
          isValid: true,
        });
      }
    }

    // Return best opportunity if any found
    if (opportunities.length === 0) return null;

    const best = opportunities.reduce((a, b) => (a.maxProfit > b.maxProfit ? a : b));

    // Record metrics
    arbitrageOpportunities.labels(ArbitrageType.CROSS_PLATFORM).inc();
    arbitrageSpread.observe(best.spreadBps);

    this.log.info('Cross-platform arbitrage detected', {
      pair: pair.id,
      direction: best.id.includes('poly-yes') ? 'Poly YES + Kalshi NO' : 'Poly NO + Kalshi YES',
      spreadBps: best.spreadBps.toFixed(2),
      maxProfit: best.maxProfit.toFixed(4),
      confidence: best.confidence,
    });

    return best;
  }

  /**
   * Calculate fees for cross-platform trade
   */
  private calculateCrossPlatformFees(polyPrice: number, kalshiPrice: number): number {
    const polyFees = this.fees.get(PLATFORMS.POLYMARKET)!;
    const kalshiFees = this.fees.get(PLATFORMS.KALSHI)!;

    return polyPrice * polyFees.takerFee + kalshiPrice * kalshiFees.takerFee;
  }

  /**
   * Validate an opportunity is still viable
   */
  validateOpportunity(
    opportunity: ArbitrageOpportunity,
    currentOrderBooks: Map<string, OrderBook>
  ): boolean {
    // Check expiry
    if (new Date() > opportunity.expiresAt) {
      this.log.debug('Opportunity expired', { id: opportunity.id });
      return false;
    }

    // Recalculate with current order book
    for (const leg of opportunity.legs) {
      const bookKey = `${leg.platform}:${leg.outcomeId}`;
      const book = currentOrderBooks.get(bookKey);

      if (!book || book.asks.length === 0) {
        this.log.debug('Order book unavailable', { leg: bookKey });
        return false;
      }

      const currentBestAsk = book.asks[0]!.price;
      const currentBestSize = book.asks[0]!.size;

      // Check if price moved unfavorably
      if (currentBestAsk > leg.price * 1.01) {
        // 1% tolerance
        this.log.debug('Price moved unfavorably', {
          leg: bookKey,
          expected: leg.price,
          current: currentBestAsk,
        });
        return false;
      }

      // Check if size is still available
      if (currentBestSize < leg.size * 0.5) {
        // Need at least 50% of size
        this.log.debug('Insufficient size', {
          leg: bookKey,
          expected: leg.size,
          current: currentBestSize,
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Scan all markets for single-platform arbitrage
   */
  scanSinglePlatform(markets: NormalizedMarket[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const market of markets) {
      const opp = this.detectSinglePlatform(market);
      if (opp) {
        opportunities.push(opp);
      }
    }

    // Sort by profit potential
    opportunities.sort((a, b) => b.maxProfit - a.maxProfit);

    return opportunities;
  }

  /**
   * Scan all pairs for cross-platform arbitrage
   */
  scanCrossPlatform(pairs: MarketPair[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const pair of pairs) {
      const opp = this.detectCrossPlatform(pair);
      if (opp) {
        opportunities.push(opp);
      }
    }

    // Sort by profit potential
    opportunities.sort((a, b) => b.maxProfit - a.maxProfit);

    return opportunities;
  }

  /**
   * Update fee structure for a platform
   */
  setFees(platform: string, fees: FeeStructure): void {
    this.fees.set(platform, fees);
  }

  /**
   * Update minimum spread threshold
   */
  setMinSpreadBps(bps: number): void {
    this.minSpreadBps = bps;
    this.log.info('Minimum spread updated', { minSpreadBps: bps });
  }
}
