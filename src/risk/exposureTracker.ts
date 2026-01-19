import { EventEmitter } from 'events';
import type { Position } from '../clients/shared/interfaces.js';
import { logger, type Logger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import { totalExposure, riskLimitUtilization } from '../utils/metrics.js';
// Removed unused import

/**
 * Exposure tracker configuration
 */
export interface ExposureTrackerConfig {
  /**
   * Maximum total exposure across all positions in USD
   */
  maxTotalExposureUsd: number;
  /**
   * Maximum exposure per platform in USD
   */
  maxPlatformExposureUsd?: number;
  /**
   * Alert threshold percentage (0-100) - alert when approaching limit
   */
  alertThresholdPercent?: number;
}

/**
 * Exposure metrics
 */
export interface ExposureMetrics {
  /**
   * Total exposure across all platforms
   */
  totalExposure: number;
  /**
   * Exposure per platform
   */
  platformExposure: Record<string, number>;
  /**
   * Total exposure utilization percentage
   */
  totalUtilization: number;
  /**
   * Platform exposure utilization percentages
   */
  platformUtilization: Record<string, number>;
  /**
   * Number of open positions
   */
  openPositionsCount: number;
  /**
   * Positions per platform
   */
  platformPositionsCount: Record<string, number>;
}

/**
 * Exposure Tracker
 * Tracks total exposure across all positions and platforms
 */
export class ExposureTracker extends EventEmitter {
  private log: Logger;
  private config: ExposureTrackerConfig;
  private positions: Map<string, Position> = new Map(); // positionId -> Position
  private platformPositions: Map<string, Set<string>> = new Map(); // platform -> Set<positionId>

  constructor(config?: Partial<ExposureTrackerConfig>) {
    super();
    this.log = logger('ExposureTracker');
    const riskConfig = getConfig().risk;

    this.config = {
      maxTotalExposureUsd: config?.maxTotalExposureUsd ?? riskConfig.maxTotalExposureUsd,
      ...(config?.maxPlatformExposureUsd !== undefined && { maxPlatformExposureUsd: config.maxPlatformExposureUsd }),
      alertThresholdPercent: config?.alertThresholdPercent ?? 80, // Alert at 80% utilization
    };

    this.log.info('Exposure tracker initialized', { ...this.config });
  }

  /**
   * Update position (called when position changes)
   */
  updatePosition(position: Position): void {
    const positionId = this.getPositionId(position);

    if (position.size === 0 || !position.isOpen) {
      // Position closed or zero size
      this.removePosition(positionId);
    } else {
      this.positions.set(positionId, position);
      this.updatePlatformPositions(position.platform, positionId);
    }

    this.updateMetrics();
    this.checkLimits();
  }

  /**
   * Remove position
   */
  removePosition(positionId: string): void {
    const position = this.positions.get(positionId);
    if (position) {
      const platform = position.platform;
      this.positions.delete(positionId);
      const platformSet = this.platformPositions.get(platform);
      if (platformSet) {
        platformSet.delete(positionId);
        if (platformSet.size === 0) {
          this.platformPositions.delete(platform);
        }
      }
    }
    this.updateMetrics();
  }

  /**
   * Get total exposure across all positions
   */
  getTotalExposure(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      if (position.isOpen) {
        total += Math.abs(Number(position.size));
      }
    }
    return total;
  }

  /**
   * Get exposure for a specific platform
   */
  getPlatformExposure(platform: string): number {
    let exposure = 0;
    const platformSet = this.platformPositions.get(platform);
    if (platformSet) {
      for (const positionId of platformSet) {
        const position = this.positions.get(positionId);
        if (position && position.isOpen) {
          exposure += Math.abs(Number(position.size));
        }
      }
    }
    return exposure;
  }

  /**
   * Get exposure metrics
   */
  getMetrics(): ExposureMetrics {
    const totalExposure = this.getTotalExposure();
    const totalUtilization = (totalExposure / this.config.maxTotalExposureUsd) * 100;

    const platformExposure: Record<string, number> = {};
    const platformUtilization: Record<string, number> = {};
    const platformPositionsCount: Record<string, number> = {};

    // Calculate per-platform metrics
    for (const platform of this.platformPositions.keys()) {
      const exposure = this.getPlatformExposure(platform);
      platformExposure[platform] = exposure;
      
      if (this.config.maxPlatformExposureUsd) {
        platformUtilization[platform] = (exposure / this.config.maxPlatformExposureUsd) * 100;
      } else {
        platformUtilization[platform] = 0;
      }

      const platformSet = this.platformPositions.get(platform);
      platformPositionsCount[platform] = platformSet ? platformSet.size : 0;
    }

    return {
      totalExposure,
      platformExposure,
      totalUtilization,
      platformUtilization,
      openPositionsCount: this.positions.size,
      platformPositionsCount,
    };
  }

  /**
   * Check if exposure would exceed limits for a new position
   */
  checkExposure(newPositionSize: number, platform: string): {
    allowed: boolean;
    reason?: string;
    currentExposure: number;
    newExposure: number;
    utilization: number;
  } {
    const currentTotalExposure = this.getTotalExposure();
    const newTotalExposure = currentTotalExposure + newPositionSize;

    // Check total exposure limit
    if (newTotalExposure > this.config.maxTotalExposureUsd) {
      const utilization = (newTotalExposure / this.config.maxTotalExposureUsd) * 100;
      return {
        allowed: false,
        reason: `Total exposure would exceed limit: ${newTotalExposure.toFixed(2)} > ${this.config.maxTotalExposureUsd}`,
        currentExposure: currentTotalExposure,
        newExposure: newTotalExposure,
        utilization,
      };
    }

    // Check platform exposure limit
    if (this.config.maxPlatformExposureUsd) {
      const currentPlatformExposure = this.getPlatformExposure(platform);
      const newPlatformExposure = currentPlatformExposure + newPositionSize;

      if (newPlatformExposure > this.config.maxPlatformExposureUsd) {
        const utilization = (newPlatformExposure / this.config.maxPlatformExposureUsd) * 100;
        return {
          allowed: false,
          reason: `Platform exposure would exceed limit: ${newPlatformExposure.toFixed(2)} > ${this.config.maxPlatformExposureUsd}`,
          currentExposure: currentPlatformExposure,
          newExposure: newPlatformExposure,
          utilization,
        };
      }
    }

    const utilization = (newTotalExposure / this.config.maxTotalExposureUsd) * 100;
    return {
      allowed: true,
      currentExposure: currentTotalExposure,
      newExposure: newTotalExposure,
      utilization,
    };
  }

  /**
   * Check limits and emit alerts if needed
   */
  private checkLimits(): void {
    const metrics = this.getMetrics();

    // Check total exposure limit
    if (metrics.totalUtilization >= 100) {
      this.log.error('Total exposure limit exceeded!', metrics as unknown as Record<string, unknown>);
      this.emit('exposureLimitExceeded', metrics);
      return;
    }

    // Check alert threshold
    if (this.config.alertThresholdPercent && metrics.totalUtilization >= this.config.alertThresholdPercent) {
      this.log.warn('Exposure approaching limit', metrics as unknown as Record<string, unknown>);
      this.emit('exposureAlert', metrics);
    }

    // Check platform limits
    if (this.config.maxPlatformExposureUsd) {
      for (const [platform, utilization] of Object.entries(metrics.platformUtilization)) {
        if (utilization >= 100) {
          this.log.error(`Platform exposure limit exceeded for ${platform}!`, metrics as unknown as Record<string, unknown>);
          this.emit('platformExposureLimitExceeded', { platform, metrics });
        } else if (
          this.config.alertThresholdPercent &&
          utilization >= this.config.alertThresholdPercent
        ) {
          this.log.warn(`Platform exposure approaching limit for ${platform}`, { platform, utilization });
          this.emit('platformExposureAlert', { platform, utilization, metrics });
        }
      }
    }
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    const metrics = this.getMetrics();
    totalExposure.set(metrics.totalExposure);
    riskLimitUtilization.labels('total_exposure').set(metrics.totalUtilization);

    // Update per-platform metrics
    for (const [platform, utilization] of Object.entries(metrics.platformUtilization)) {
      riskLimitUtilization.labels(`platform_${platform}`).set(utilization);
    }
  }

  /**
   * Update platform positions map
   */
  private updatePlatformPositions(platform: string, positionId: string): void {
    if (!this.platformPositions.has(platform)) {
      this.platformPositions.set(platform, new Set());
    }
    this.platformPositions.get(platform)!.add(positionId);
  }

  /**
   * Get position ID
   */
  private getPositionId(position: Position): string {
    return `${position.platform}:${position.marketId}:${position.outcomeId}`;
  }

  /**
   * Get all positions
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get positions for a platform
   */
  getPlatformPositions(platform: string): Position[] {
    const platformSet = this.platformPositions.get(platform);
    if (!platformSet) {
      return [];
    }

    const positions: Position[] = [];
    for (const positionId of platformSet) {
      const position = this.positions.get(positionId);
      if (position) {
        positions.push(position);
      }
    }
    return positions;
  }

  /**
   * Reset all positions (for testing)
   */
  reset(): void {
    this.positions.clear();
    this.platformPositions.clear();
    this.updateMetrics();
    this.log.info('Exposure tracker reset');
  }

  /**
   * Get current state
   */
  getState(): {
    totalPositions: number;
    metrics: ExposureMetrics;
  } {
    return {
      totalPositions: this.positions.size,
      metrics: this.getMetrics(),
    };
  }
}
