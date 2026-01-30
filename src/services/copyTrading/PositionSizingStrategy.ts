/**
 * Position Sizing Strategy
 *
 * Calculates the appropriate size for copy trades based on different strategies:
 * - PERCENTAGE: Copy a fixed percentage of the trader's order size
 * - FIXED: Copy a fixed USD amount per trade
 * - ADAPTIVE: Dynamically adjust percentage based on trade size
 *
 * Also supports tiered multipliers for sophisticated position sizing.
 */

import type {
  SizingStrategy,
  TieredMultiplier,
  SizingCalculation,
  AdaptiveParams,
  TraderCopyConfig,
} from './types.js';
import type { CopyTradingConfig } from '../../config/schema.js';

/**
 * Default adaptive strategy parameters
 */
const DEFAULT_ADAPTIVE_PARAMS: AdaptiveParams = {
  minPercent: 5, // Use at least 5% for large trades
  maxPercent: 20, // Use up to 20% for small trades
  thresholdUsd: 500, // Threshold for adaptation
};

/**
 * Calculate the appropriate multiplier for a given trade size using tiered multipliers
 *
 * @param tradeSize - The trader's order size in USD
 * @param tiers - Array of tiered multipliers, sorted by minSize
 * @returns The multiplier to apply
 */
export function getTieredMultiplier(
  tradeSize: number,
  tiers: TieredMultiplier[] | undefined
): number {
  if (!tiers || tiers.length === 0) {
    return 1.0;
  }

  // Sort tiers by minSize to ensure correct matching
  const sortedTiers = [...tiers].sort((a, b) => a.minSize - b.minSize);

  for (const tier of sortedTiers) {
    if (tradeSize >= tier.minSize && tradeSize < tier.maxSize) {
      return tier.multiplier;
    }
  }

  // If no tier matches, use the last tier's multiplier (for values above all tiers)
  const lastTier = sortedTiers[sortedTiers.length - 1];
  return lastTier ? lastTier.multiplier : 1.0;
}

/**
 * Calculate adaptive percentage based on trade size
 *
 * Logic:
 * - Small orders (< threshold): Use higher percentage (up to maxPercent)
 * - Large orders (> threshold): Use lower percentage (down to minPercent)
 *
 * @param tradeSize - The trader's order size in USD
 * @param basePercent - Base copy percentage
 * @param params - Adaptive strategy parameters
 * @returns The percentage to use (0-100)
 */
export function calculateAdaptivePercent(
  tradeSize: number,
  basePercent: number,
  params: AdaptiveParams
): number {
  const { minPercent, maxPercent, thresholdUsd } = params;

  if (tradeSize >= thresholdUsd) {
    // Large order: scale down towards minPercent
    const scaleFactor = Math.min(1, (tradeSize / thresholdUsd - 1) / 2);
    return lerp(basePercent, minPercent, scaleFactor);
  } else {
    // Small order: scale up towards maxPercent
    const scaleFactor = 1 - tradeSize / thresholdUsd;
    return lerp(basePercent, maxPercent, scaleFactor);
  }
}

/**
 * Linear interpolation between two values
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Calculate order size based on copy strategy
 *
 * @param config - Trader's copy configuration or global config
 * @param traderOrderSize - The trader's order size in USD
 * @param availableBalance - Your available balance in USD
 * @param currentPositionValue - Current position value in this market (for position limits)
 * @returns Sizing calculation with reasoning
 */
export function calculateOrderSize(
  config: {
    sizingStrategy: SizingStrategy;
    copyPercentage: number;
    fixedCopyAmount?: number;
    baseMultiplier: number;
    tieredMultipliers?: TieredMultiplier[];
    adaptiveParams?: AdaptiveParams;
    maxPositionSize: number;
    minTradeSize: number;
    maxExposure?: number;
  },
  traderOrderSize: number,
  availableBalance: number,
  currentPositionValue: number = 0
): SizingCalculation {
  const {
    sizingStrategy,
    copyPercentage,
    fixedCopyAmount,
    baseMultiplier,
    tieredMultipliers,
    adaptiveParams,
    maxPositionSize,
    minTradeSize,
    maxExposure,
  } = config;

  let baseAmount: number;
  let reasoning: string;

  // Step 1: Calculate base amount based on strategy
  switch (sizingStrategy) {
    case 'PERCENTAGE':
      baseAmount = traderOrderSize * (copyPercentage / 100);
      reasoning = `${copyPercentage}% of trader's $${traderOrderSize.toFixed(2)} = $${baseAmount.toFixed(2)}`;
      break;

    case 'FIXED':
      baseAmount = fixedCopyAmount ?? maxPositionSize;
      reasoning = `Fixed amount: $${baseAmount.toFixed(2)}`;
      break;

    case 'ADAPTIVE':
      const adaptivePercent = calculateAdaptivePercent(
        traderOrderSize,
        copyPercentage,
        adaptiveParams ?? DEFAULT_ADAPTIVE_PARAMS
      );
      baseAmount = traderOrderSize * (adaptivePercent / 100);
      reasoning = `Adaptive ${adaptivePercent.toFixed(1)}% of trader's $${traderOrderSize.toFixed(2)} = $${baseAmount.toFixed(2)}`;
      break;

    default:
      throw new Error(`Unknown sizing strategy: ${sizingStrategy}`);
  }

  // Step 2: Apply tiered or base multiplier
  const multiplier = tieredMultipliers && tieredMultipliers.length > 0
    ? getTieredMultiplier(traderOrderSize, tieredMultipliers)
    : baseMultiplier;

  let finalAmount = baseAmount * multiplier;

  if (multiplier !== 1.0) {
    reasoning += ` x ${multiplier}x multiplier = $${finalAmount.toFixed(2)}`;
  }

  let cappedByMax = false;
  let reducedByBalance = false;
  let belowMinimum = false;

  // Step 3: Apply maximum position size limit
  if (finalAmount > maxPositionSize) {
    finalAmount = maxPositionSize;
    cappedByMax = true;
    reasoning += ` -> Capped at max $${maxPositionSize}`;
  }

  // Step 4: Apply maximum exposure limit (if configured)
  if (maxExposure) {
    const newTotalExposure = currentPositionValue + finalAmount;
    if (newTotalExposure > maxExposure) {
      const allowedAmount = Math.max(0, maxExposure - currentPositionValue);
      if (allowedAmount < minTradeSize) {
        finalAmount = 0;
        reasoning += ` -> Exposure limit reached ($${maxExposure})`;
      } else {
        finalAmount = allowedAmount;
        cappedByMax = true;
        reasoning += ` -> Reduced to fit exposure limit ($${allowedAmount.toFixed(2)})`;
      }
    }
  }

  // Step 5: Check available balance (with 2% safety buffer)
  const maxAffordable = availableBalance * 0.98;
  if (finalAmount > maxAffordable) {
    finalAmount = maxAffordable;
    reducedByBalance = true;
    reasoning += ` -> Reduced to fit balance ($${maxAffordable.toFixed(2)})`;
  }

  // Step 6: Check minimum order size
  if (finalAmount < minTradeSize) {
    belowMinimum = true;
    reasoning += ` -> Below minimum $${minTradeSize}`;
    finalAmount = 0;
  }

  return {
    traderOrderSize,
    baseAmount,
    finalAmount,
    multiplierUsed: multiplier,
    strategy: sizingStrategy,
    cappedByMax,
    reducedByBalance,
    belowMinimum,
    reasoning,
  };
}

/**
 * Calculate order size using trader-specific config
 */
export function calculateOrderSizeForTrader(
  traderConfig: TraderCopyConfig,
  traderOrderSize: number,
  availableBalance: number,
  currentPositionValue: number = 0
): SizingCalculation {
  const config: {
    sizingStrategy: SizingStrategy;
    copyPercentage: number;
    fixedCopyAmount?: number;
    baseMultiplier: number;
    tieredMultipliers?: TieredMultiplier[];
    adaptiveParams?: AdaptiveParams;
    maxPositionSize: number;
    minTradeSize: number;
    maxExposure?: number;
  } = {
    sizingStrategy: traderConfig.sizingStrategy,
    copyPercentage: traderConfig.copyPercentage ?? 10,
    baseMultiplier: traderConfig.baseMultiplier ?? traderConfig.defaultMultiplier ?? 1.0,
    maxPositionSize: traderConfig.maxPositionSize ?? 100,
    minTradeSize: traderConfig.minTradeSize ?? 1,
  };
  if (traderConfig.fixedCopyAmount !== undefined) {
    config.fixedCopyAmount = traderConfig.fixedCopyAmount;
  }
  if (traderConfig.tieredMultipliers !== undefined) {
    config.tieredMultipliers = traderConfig.tieredMultipliers;
  }
  if (traderConfig.adaptiveParams !== undefined) {
    config.adaptiveParams = traderConfig.adaptiveParams;
  }
  if (traderConfig.maxExposure !== undefined) {
    config.maxExposure = traderConfig.maxExposure;
  }
  return calculateOrderSize(
    config,
    traderOrderSize,
    availableBalance,
    currentPositionValue
  );
}

/**
 * Calculate order size using global config (for new traders without custom config)
 */
export function calculateOrderSizeFromGlobalConfig(
  globalConfig: CopyTradingConfig,
  traderOrderSize: number,
  availableBalance: number,
  currentPositionValue: number = 0
): SizingCalculation {
  return calculateOrderSize(
    {
      sizingStrategy: globalConfig.defaultSizingStrategy,
      copyPercentage: globalConfig.defaultCopyPercentage,
      baseMultiplier: globalConfig.defaultMultiplier,
      tieredMultipliers: globalConfig.defaultTieredMultipliers,
      maxPositionSize: globalConfig.defaultMaxPositionSize,
      minTradeSize: globalConfig.defaultMinTradeSize,
      maxExposure: globalConfig.maxTotalCopyExposure,
    },
    traderOrderSize,
    availableBalance,
    currentPositionValue
  );
}

/**
 * Validate tiered multipliers configuration
 *
 * @param tiers - Array of tiered multipliers
 * @returns Array of validation errors (empty if valid)
 */
export function validateTieredMultipliers(tiers: TieredMultiplier[]): string[] {
  const errors: string[] = [];

  if (tiers.length === 0) {
    return errors; // Empty is valid (use base multiplier)
  }

  // Sort by minSize for validation
  const sortedTiers = [...tiers].sort((a, b) => a.minSize - b.minSize);

  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    if (!tier) continue;

    // Validate individual tier
    if (tier.minSize < 0) {
      errors.push(`Tier ${i}: minSize cannot be negative`);
    }
    if (tier.maxSize <= tier.minSize) {
      errors.push(`Tier ${i}: maxSize (${tier.maxSize}) must be greater than minSize (${tier.minSize})`);
    }
    if (tier.multiplier < 0) {
      errors.push(`Tier ${i}: multiplier cannot be negative`);
    }

    // Check for gaps and overlaps
    if (i > 0) {
      const prevTier = sortedTiers[i - 1];
      if (!prevTier) continue;
      if (tier.minSize < prevTier.maxSize) {
        errors.push(
          `Tiers ${i - 1} and ${i} overlap: [${prevTier.minSize}-${prevTier.maxSize}] and [${tier.minSize}-${tier.maxSize}]`
        );
      }
      if (tier.minSize > prevTier.maxSize) {
        errors.push(
          `Gap between tiers ${i - 1} and ${i}: ${prevTier.maxSize} to ${tier.minSize}`
        );
      }
    }
  }

  return errors;
}

/**
 * Get recommended position sizing config based on balance and trader profile
 *
 * @param balanceUsd - Your available balance in USD
 * @param traderAvgTradeSize - Average trade size of the trader you want to copy
 * @returns Recommended sizing configuration
 */
export function getRecommendedConfig(
  balanceUsd: number,
  traderAvgTradeSize: number = 100
): {
  sizingStrategy: SizingStrategy;
  copyPercentage: number;
  maxPositionSize: number;
  tieredMultipliers: TieredMultiplier[];
} {
  const ratio = balanceUsd / traderAvgTradeSize;

  if (ratio < 1) {
    // Much smaller than trader - use aggressive tiered multipliers
    return {
      sizingStrategy: 'PERCENTAGE',
      copyPercentage: 10,
      maxPositionSize: Math.min(balanceUsd * 0.1, 50),
      tieredMultipliers: [
        { minSize: 0, maxSize: 10, multiplier: 2.0 },
        { minSize: 10, maxSize: 50, multiplier: 1.0 },
        { minSize: 50, maxSize: 200, multiplier: 0.5 },
        { minSize: 200, maxSize: 1000, multiplier: 0.1 },
        { minSize: 1000, maxSize: Number.MAX_SAFE_INTEGER, multiplier: 0.02 },
      ],
    };
  } else if (ratio < 10) {
    // Smaller than trader - use moderate tiered multipliers
    return {
      sizingStrategy: 'PERCENTAGE',
      copyPercentage: 10,
      maxPositionSize: Math.min(balanceUsd * 0.15, 100),
      tieredMultipliers: [
        { minSize: 0, maxSize: 50, multiplier: 1.5 },
        { minSize: 50, maxSize: 200, multiplier: 1.0 },
        { minSize: 200, maxSize: 500, multiplier: 0.5 },
        { minSize: 500, maxSize: Number.MAX_SAFE_INTEGER, multiplier: 0.2 },
      ],
    };
  } else if (ratio < 100) {
    // Similar to trader - use standard percentage
    return {
      sizingStrategy: 'PERCENTAGE',
      copyPercentage: 10,
      maxPositionSize: Math.min(balanceUsd * 0.2, 500),
      tieredMultipliers: [],
    };
  } else {
    // Much larger than trader - use adaptive strategy
    return {
      sizingStrategy: 'ADAPTIVE',
      copyPercentage: 10,
      maxPositionSize: Math.min(balanceUsd * 0.1, 1000),
      tieredMultipliers: [],
    };
  }
}
