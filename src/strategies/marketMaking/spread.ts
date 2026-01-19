/**
 * Spread calculation configuration
 */
export interface SpreadConfig {
  /**
   * Base spread in basis points (e.g., 10 = 0.1%)
   */
  baseSpreadBps: number;
  /**
   * Minimum spread in basis points
   */
  minSpreadBps: number;
  /**
   * Maximum spread in basis points
   */
  maxSpreadBps: number;
  /**
   * Volatility multiplier (increase spread for volatile markets)
   */
  volatilityMultiplier: number;
  /**
   * Inventory skew factor (adjust spread based on inventory)
   */
  inventorySkewFactor: number;
}

/**
 * Calculate dynamic spread based on market conditions
 */
export function calculateSpread(
  config: SpreadConfig,
  inventory: number,
  volatility: number = 0,
  baseMidPrice: number
): { bid: number; ask: number; spread: number } {
  // Base spread
  let spreadBps = config.baseSpreadBps;

  // Adjust for volatility
  spreadBps *= 1 + volatility * config.volatilityMultiplier;

  // Adjust for inventory (widen spread when inventory is large)
  const inventorySkew = Math.abs(inventory) * config.inventorySkewFactor;
  spreadBps *= 1 + inventorySkew;

  // Clamp to min/max
  spreadBps = Math.max(config.minSpreadBps, Math.min(config.maxSpreadBps, spreadBps));

  // Convert to decimal
  const spread = spreadBps / 10000;

  // Calculate bid and ask
  const halfSpread = spread / 2;
  const bid = Math.max(0, baseMidPrice - halfSpread);
  const ask = Math.min(1, baseMidPrice + halfSpread);

  return { bid, ask, spread };
}

/**
 * Default spread configuration
 */
export const DEFAULT_SPREAD_CONFIG: SpreadConfig = {
  baseSpreadBps: 20, // 0.2%
  minSpreadBps: 5, // 0.05%
  maxSpreadBps: 100, // 1%
  volatilityMultiplier: 0.5,
  inventorySkewFactor: 0.1,
};
