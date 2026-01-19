/**
 * Calculate spread between two prices
 * @param bid Bid price (0-1)
 * @param ask Ask price (0-1)
 * @returns Spread as decimal (e.g., 0.01 = 1%)
 */
export function calculateSpread(bid: number, ask: number): number {
  if (bid <= 0 || ask <= 0 || ask < bid) {
    return 0;
  }
  return ask - bid;
}

/**
 * Calculate spread in basis points
 * @param bid Bid price (0-1)
 * @param ask Ask price (0-1)
 * @returns Spread in basis points (e.g., 100 = 1%)
 */
export function calculateSpreadBps(bid: number, ask: number): number {
  return calculateSpread(bid, ask) * 10000;
}

/**
 * Calculate mid price
 * @param bid Bid price (0-1)
 * @param ask Ask price (0-1)
 * @returns Mid price
 */
export function calculateMidPrice(bid: number, ask: number): number {
  if (bid <= 0 || ask <= 0) {
    return 0;
  }
  return (bid + ask) / 2;
}

/**
 * Calculate realized P&L for a closed position
 * @param entryPrice Entry price (0-1)
 * @param exitPrice Exit price (0-1)
 * @param size Position size in USD
 * @param side 'buy' or 'sell'
 * @returns Realized P&L in USD
 */
export function calculateRealizedPnl(
  entryPrice: number,
  exitPrice: number,
  size: number,
  side: 'buy' | 'sell'
): number {
  if (side === 'buy') {
    // Long position: profit when price goes up
    return (exitPrice - entryPrice) * size;
  } else {
    // Short position: profit when price goes down
    return (entryPrice - exitPrice) * size;
  }
}

/**
 * Calculate unrealized P&L for an open position
 * @param entryPrice Entry price (0-1)
 * @param currentPrice Current market price (0-1)
 * @param size Position size in USD
 * @param side 'buy' or 'sell'
 * @returns Unrealized P&L in USD
 */
export function calculateUnrealizedPnl(
  entryPrice: number,
  currentPrice: number,
  size: number,
  side: 'buy' | 'sell'
): number {
  return calculateRealizedPnl(entryPrice, currentPrice, size, side);
}

/**
 * Calculate fees for a trade
 * @param size Trade size in USD
 * @param feeRate Fee rate as decimal (e.g., 0.01 = 1%)
 * @returns Fee amount in USD
 */
export function calculateFee(size: number, feeRate: number): number {
  return size * feeRate;
}

/**
 * Calculate net profit after fees
 * @param grossProfit Gross profit in USD
 * @param fees Total fees in USD
 * @returns Net profit in USD
 */
export function calculateNetProfit(grossProfit: number, fees: number): number {
  return grossProfit - fees;
}

/**
 * Calculate arbitrage profit
 * @param buyPrice Price to buy at (0-1)
 * @param sellPrice Price to sell at (0-1)
 * @param size Trade size in USD
 * @param buyFee Fee rate for buy (decimal)
 * @param sellFee Fee rate for sell (decimal)
 * @returns Net profit in USD
 */
export function calculateArbitrageProfit(
  buyPrice: number,
  sellPrice: number,
  size: number,
  buyFee: number = 0,
  sellFee: number = 0
): number {
  // Gross profit from price difference
  const grossProfit = (sellPrice - buyPrice) * size;
  
  // Fees
  const buyFeeAmount = calculateFee(size, buyFee);
  const sellFeeAmount = calculateFee(size, sellFee);
  const totalFees = buyFeeAmount + sellFeeAmount;
  
  // Net profit
  return calculateNetProfit(grossProfit, totalFees);
}

/**
 * Calculate percentage change
 * @param oldValue Old value
 * @param newValue New value
 * @returns Percentage change (e.g., 0.05 = 5%)
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) {
    return 0;
  }
  return (newValue - oldValue) / oldValue;
}

/**
 * Calculate percentage change in basis points
 * @param oldValue Old value
 * @param newValue New value
 * @returns Percentage change in basis points
 */
export function calculatePercentageChangeBps(oldValue: number, newValue: number): number {
  return calculatePercentageChange(oldValue, newValue) * 10000;
}

/**
 * Round to specified decimal places
 * @param value Value to round
 * @param decimals Number of decimal places
 * @returns Rounded value
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Round price to tick size
 * @param price Price to round
 * @param tickSize Tick size (e.g., 0.01 for $0.01 ticks)
 * @param direction 'up', 'down', or 'nearest'
 * @returns Rounded price
 */
export function roundToTick(price: number, tickSize: number, direction: 'up' | 'down' | 'nearest' = 'nearest'): number {
  if (tickSize <= 0) {
    return price;
  }

  const rounded = Math.round(price / tickSize) * tickSize;

  if (direction === 'up') {
    return price > rounded ? rounded + tickSize : rounded;
  } else if (direction === 'down') {
    return price < rounded ? rounded - tickSize : rounded;
  } else {
    return rounded;
  }
}

/**
 * Calculate Sharpe ratio
 * @param returns Array of returns (as decimals, e.g., 0.01 = 1%)
 * @param riskFreeRate Risk-free rate (default: 0)
 * @returns Sharpe ratio
 */
export function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0): number {
  if (returns.length === 0) {
    return 0;
  }

  // Calculate mean return
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  // Calculate excess return
  const excessReturn = meanReturn - riskFreeRate;

  // Calculate standard deviation
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return 0;
  }

  return excessReturn / stdDev;
}

/**
 * Calculate win rate
 * @param wins Number of winning trades
 * @param losses Number of losing trades
 * @returns Win rate as decimal (e.g., 0.6 = 60%)
 */
export function calculateWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) {
    return 0;
  }
  return wins / total;
}

/**
 * Calculate profit factor
 * @param grossProfit Total gross profit from winning trades
 * @param grossLoss Total gross loss from losing trades
 * @returns Profit factor (ratio of gross profit to gross loss)
 */
export function calculateProfitFactor(grossProfit: number, grossLoss: number): number {
  if (grossLoss === 0) {
    return grossProfit > 0 ? Infinity : 0;
  }
  return grossProfit / Math.abs(grossLoss);
}

/**
 * Calculate maximum drawdown
 * @param equitySeries Array of equity values over time
 * @returns Maximum drawdown as decimal (e.g., 0.1 = 10%)
 */
export function calculateMaxDrawdown(equitySeries: number[]): number {
  if (equitySeries.length === 0) {
    return 0;
  }

  let peak: number | undefined = equitySeries[0];
  let maxDrawdown = 0;

  for (const equity of equitySeries) {
    if (peak !== undefined && equity > peak) {
      peak = equity;
    }
    if (peak !== undefined && peak > 0) {
      const drawdown = (peak - equity) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  return maxDrawdown;
}

/**
 * Calculate position size based on risk
 * @param accountBalance Account balance in USD
 * @param riskPercent Risk percentage per trade (e.g., 0.01 = 1%)
 * @param stopLossPercent Stop loss percentage (e.g., 0.02 = 2%)
 * @returns Position size in USD
 */
export function calculatePositionSize(
  accountBalance: number,
  riskPercent: number,
  stopLossPercent: number
): number {
  if (stopLossPercent <= 0) {
    return 0;
  }
  const riskAmount = accountBalance * riskPercent;
  return riskAmount / stopLossPercent;
}

/**
 * Normalize price to 0-1 range
 * @param price Price in cents or dollars
 * @param maxPrice Maximum price (e.g., 100 for cents, 1 for normalized)
 * @returns Normalized price (0-1)
 */
export function normalizePrice(price: number, maxPrice: number = 100): number {
  return price / maxPrice;
}

/**
 * Denormalize price from 0-1 range
 * @param normalizedPrice Normalized price (0-1)
 * @param maxPrice Maximum price (e.g., 100 for cents, 1 for normalized)
 * @returns Denormalized price
 */
export function denormalizePrice(normalizedPrice: number, maxPrice: number = 100): number {
  return normalizedPrice * maxPrice;
}
