import { EventEmitter } from 'events';

/**
 * Price data point
 */
export interface PricePoint {
  timestamp: Date;
  price: number;
  volume: number | undefined;
  bidSize: number | undefined;
  askSize: number | undefined;
}

/**
 * Price statistics for analysis
 */
export interface PriceStats {
  current: number;
  open: number; // Price at start of window
  high: number;
  low: number;
  change: number; // Absolute change
  changePercent: number;
  volatility: number; // Standard deviation
  momentum: number; // Rate of change (-1 to 1)
  trend: 'up' | 'down' | 'neutral';
  sma5: number; // 5-period simple moving average
  sma20: number; // 20-period SMA
  ema12: number; // 12-period exponential moving average
  rsi: number; // Relative strength index (0-100)
  vwap: number; // Volume-weighted average price
  volumeSpike: boolean; // True if recent volume > 2x average
}

/**
 * Price History Tracker
 * Tracks price movements over time for technical analysis
 */
export class PriceHistoryTracker extends EventEmitter {
  private history: Map<string, PricePoint[]> = new Map(); // marketId -> price points
  private maxHistorySize: number;
  private updateInterval: number; // ms between price captures

  constructor(maxHistorySize = 1000, updateIntervalMs = 1000) {
    super();
    this.maxHistorySize = maxHistorySize;
    this.updateInterval = updateIntervalMs;
  }

  /**
   * Record a new price point
   */
  recordPrice(
    marketId: string,
    price: number,
    volume?: number,
    bidSize?: number,
    askSize?: number
  ): void {
    if (!this.history.has(marketId)) {
      this.history.set(marketId, []);
    }

    const points = this.history.get(marketId)!;
    const now = new Date();

    // Dedupe - don't record if too recent
    if (points.length > 0) {
      const lastPoint = points[points.length - 1]!;
      if (now.getTime() - lastPoint.timestamp.getTime() < this.updateInterval) {
        // Update the last point instead
        lastPoint.price = price;
        if (volume !== undefined) lastPoint.volume = volume;
        if (bidSize !== undefined) lastPoint.bidSize = bidSize;
        if (askSize !== undefined) lastPoint.askSize = askSize;
        return;
      }
    }

    // Add new point
    points.push({
      timestamp: now,
      price,
      volume,
      bidSize,
      askSize,
    });

    // Trim if too large
    while (points.length > this.maxHistorySize) {
      points.shift();
    }

    // Emit event for significant price changes
    if (points.length >= 2) {
      const prevPrice = points[points.length - 2]!.price;
      const changePct = Math.abs((price - prevPrice) / prevPrice) * 100;
      if (changePct >= 1) {
        // 1% move
        this.emit('significantMove', {
          marketId,
          price,
          prevPrice,
          changePct,
          direction: price > prevPrice ? 'up' : 'down',
        });
      }
    }
  }

  /**
   * Get price statistics for a market
   */
  getStats(marketId: string, windowMinutes = 60): PriceStats | null {
    const points = this.history.get(marketId);
    if (!points || points.length < 5) return null;

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

    // Filter to window
    const windowPoints = points.filter((p) => p.timestamp >= windowStart);
    if (windowPoints.length < 5) return null;

    const prices = windowPoints.map((p) => p.price);
    const volumes = windowPoints.map((p) => p.volume ?? 0);
    const current = prices[prices.length - 1]!;
    const open = prices[0]!;

    // Basic stats
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const change = current - open;
    const changePercent = (change / open) * 100;

    // Volatility (standard deviation)
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
    const volatility = Math.sqrt(variance);

    // Moving averages
    const sma5 = this.calculateSMA(prices, 5);
    const sma20 = this.calculateSMA(prices, 20);
    const ema12 = this.calculateEMA(prices, 12);

    // RSI
    const rsi = this.calculateRSI(prices, 14);

    // VWAP
    const vwap = this.calculateVWAP(windowPoints);

    // Momentum (-1 to 1)
    const momentum = this.calculateMomentum(prices);

    // Trend
    let trend: 'up' | 'down' | 'neutral' = 'neutral';
    if (momentum > 0.3 && current > sma5) trend = 'up';
    else if (momentum < -0.3 && current < sma5) trend = 'down';

    // Volume spike detection
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const volumeSpike = recentVolume > avgVolume * 2;

    return {
      current,
      open,
      high,
      low,
      change,
      changePercent,
      volatility,
      momentum,
      trend,
      sma5,
      sma20,
      ema12,
      rsi,
      vwap,
      volumeSpike,
    };
  }

  /**
   * Get recent price points
   */
  getRecentPrices(marketId: string, count = 100): PricePoint[] {
    const points = this.history.get(marketId);
    if (!points) return [];
    return points.slice(-count);
  }

  /**
   * Check if price crossed a threshold
   */
  checkCrossover(marketId: string, threshold: number, direction: 'above' | 'below'): boolean {
    const points = this.history.get(marketId);
    if (!points || points.length < 2) return false;

    const current = points[points.length - 1]!.price;
    const previous = points[points.length - 2]!.price;

    if (direction === 'above') {
      return previous <= threshold && current > threshold;
    } else {
      return previous >= threshold && current < threshold;
    }
  }

  /**
   * Clear history for a market
   */
  clearHistory(marketId: string): void {
    this.history.delete(marketId);
  }

  /**
   * Get all tracked market IDs
   */
  getTrackedMarkets(): string[] {
    return Array.from(this.history.keys());
  }

  // ============================================
  // Technical Analysis Helpers
  // ============================================

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1]!;
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1]!;
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i]! - ema) * multiplier + ema;
    }
    
    return ema;
  }

  private calculateRSI(prices: number[], period = 14): number {
    if (prices.length < period + 1) return 50; // Neutral

    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i]! - prices[i - 1]!);
    }

    const recentChanges = changes.slice(-period);
    const gains = recentChanges.filter((c) => c > 0);
    const losses = recentChanges.filter((c) => c < 0).map((c) => Math.abs(c));

    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateVWAP(points: PricePoint[]): number {
    let sumPV = 0;
    let sumVolume = 0;

    for (const point of points) {
      const volume = point.volume ?? 1;
      sumPV += point.price * volume;
      sumVolume += volume;
    }

    return sumVolume > 0 ? sumPV / sumVolume : points[points.length - 1]?.price ?? 0;
  }

  private calculateMomentum(prices: number[]): number {
    if (prices.length < 10) return 0;

    // Linear regression slope normalized to -1 to 1
    const n = Math.min(prices.length, 20);
    const recentPrices = prices.slice(-n);

    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recentPrices[i]!;
      sumXY += i * recentPrices[i]!;
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Normalize to -1 to 1 based on price range
    const priceRange = Math.max(...recentPrices) - Math.min(...recentPrices);
    if (priceRange === 0) return 0;

    const normalizedSlope = (slope * n) / priceRange;
    return Math.max(-1, Math.min(1, normalizedSlope));
  }
}
