/**
 * Trader Ranker
 *
 * Ranks traders based on weighted performance criteria.
 * Applies filters to exclude traders not meeting minimum requirements,
 * then calculates a composite score for ranking.
 *
 * Scoring uses percentile-based normalization to ensure fair comparisons
 * across different metrics with different scales.
 */

import type { TraderPerformance, RankingCriteria, RankedTrader } from './types.js';
import { createComponentLogger } from '../../utils/logger.js';

const log = createComponentLogger('TraderRanker');

/**
 * Default ranking criteria
 */
export const DEFAULT_RANKING_CRITERIA: RankingCriteria = {
  // Weights (sum to 1.0)
  roiWeight: 0.35,
  winRateWeight: 0.25,
  profitFactorWeight: 0.20,
  consistencyWeight: 0.20,
  volumeWeight: 0,
  // Minimum requirements
  minTrades: 10,
  minActiveDays: 7,
  minWinRate: 0.45,
  minRoi: -50, // Allow some negative ROI
  maxDrawdown: 80, // Max 80% drawdown
  // Optional filters
  minProfitFactor: 0.5,
};

/**
 * Trader Ranker class
 */
export class TraderRanker {
  private criteria: RankingCriteria;

  constructor(criteria: Partial<RankingCriteria> = {}) {
    this.criteria = { ...DEFAULT_RANKING_CRITERIA, ...criteria };
    this.validateWeights();
  }

  /**
   * Validate that weights sum to 1.0
   */
  private validateWeights(): void {
    const totalWeight =
      this.criteria.roiWeight +
      this.criteria.winRateWeight +
      this.criteria.profitFactorWeight +
      this.criteria.consistencyWeight +
      (this.criteria.volumeWeight || 0);

    if (Math.abs(totalWeight - 1.0) > 0.001) {
      log.warn('Ranking weights do not sum to 1.0', {
        total: totalWeight,
        adjusting: true,
      });

      // Normalize weights
      const factor = 1.0 / totalWeight;
      this.criteria.roiWeight *= factor;
      this.criteria.winRateWeight *= factor;
      this.criteria.profitFactorWeight *= factor;
      this.criteria.consistencyWeight *= factor;
      if (this.criteria.volumeWeight) {
        this.criteria.volumeWeight *= factor;
      }
    }
  }

  /**
   * Check if a trader passes minimum filters
   */
  passesFilters(performance: TraderPerformance): { passes: boolean; reason?: string } {
    const c = this.criteria;

    if (performance.totalTrades < c.minTrades) {
      return {
        passes: false,
        reason: `Insufficient trades: ${performance.totalTrades} < ${c.minTrades}`,
      };
    }

    if (performance.activeDays < c.minActiveDays) {
      return {
        passes: false,
        reason: `Insufficient active days: ${performance.activeDays} < ${c.minActiveDays}`,
      };
    }

    if (performance.winRate < c.minWinRate) {
      return {
        passes: false,
        reason: `Win rate too low: ${(performance.winRate * 100).toFixed(1)}% < ${c.minWinRate * 100}%`,
      };
    }

    if (performance.roi < c.minRoi) {
      return {
        passes: false,
        reason: `ROI too low: ${performance.roi.toFixed(1)}% < ${c.minRoi}%`,
      };
    }

    if (performance.maxDrawdown > c.maxDrawdown) {
      return {
        passes: false,
        reason: `Drawdown too high: ${performance.maxDrawdown.toFixed(1)}% > ${c.maxDrawdown}%`,
      };
    }

    if (c.minVolume && performance.totalVolume < c.minVolume) {
      return {
        passes: false,
        reason: `Volume too low: $${performance.totalVolume.toFixed(0)} < $${c.minVolume}`,
      };
    }

    if (c.minProfitFactor && performance.profitFactor < c.minProfitFactor) {
      return {
        passes: false,
        reason: `Profit factor too low: ${performance.profitFactor.toFixed(2)} < ${c.minProfitFactor}`,
      };
    }

    return { passes: true };
  }

  /**
   * Calculate individual score components (0-100 scale)
   */
  private calculateScores(
    performance: TraderPerformance,
    allPerformances: TraderPerformance[]
  ): {
    roi: number;
    winRate: number;
    profitFactor: number;
    consistency: number;
    volume?: number;
  } {
    // Get percentile ranks for normalization
    const roiValues = allPerformances.map((p) => p.roi);
    const sharpeValues = allPerformances.map((p) => p.sharpeRatio);
    const drawdownValues = allPerformances.map((p) => p.maxDrawdown);
    const volumeValues = allPerformances.map((p) => p.totalVolume);

    // ROI score (percentile)
    const roiScore = this.percentileScore(performance.roi, roiValues);

    // Win rate score (direct scale, 0-100)
    const winRateScore = performance.winRate * 100;

    // Profit factor score (capped at 3.0 for scaling)
    const cappedProfitFactor = Math.min(performance.profitFactor, 3);
    const profitFactorScore = (cappedProfitFactor / 3) * 100;

    // Consistency score (combination of Sharpe and inverse drawdown)
    const sharpePercentile = this.percentileScore(performance.sharpeRatio, sharpeValues);
    const drawdownScore = this.inversePercentileScore(performance.maxDrawdown, drawdownValues);
    const consistencyScore = (sharpePercentile + drawdownScore) / 2;

    // Volume score (percentile, optional)
    const result: {
      roi: number;
      winRate: number;
      profitFactor: number;
      consistency: number;
      volume?: number;
    } = {
      roi: roiScore,
      winRate: winRateScore,
      profitFactor: profitFactorScore,
      consistency: consistencyScore,
    };
    if (this.criteria.volumeWeight && this.criteria.volumeWeight > 0) {
      result.volume = this.percentileScore(performance.totalVolume, volumeValues);
    }

    return result;
  }

  /**
   * Calculate percentile score (0-100)
   */
  private percentileScore(value: number, allValues: number[]): number {
    const sorted = [...allValues].sort((a, b) => a - b);
    const rank = sorted.filter((v) => v < value).length;
    return (rank / Math.max(sorted.length - 1, 1)) * 100;
  }

  /**
   * Calculate inverse percentile (lower is better)
   */
  private inversePercentileScore(value: number, allValues: number[]): number {
    return 100 - this.percentileScore(value, allValues);
  }

  /**
   * Calculate composite rank score
   */
  private calculateRankScore(scores: {
    roi: number;
    winRate: number;
    profitFactor: number;
    consistency: number;
    volume?: number;
  }): number {
    const c = this.criteria;

    let weightedScore =
      scores.roi * c.roiWeight +
      scores.winRate * c.winRateWeight +
      scores.profitFactor * c.profitFactorWeight +
      scores.consistency * c.consistencyWeight;

    if (c.volumeWeight && scores.volume !== undefined) {
      weightedScore += scores.volume * c.volumeWeight;
    }

    return Math.min(100, Math.max(0, weightedScore));
  }

  /**
   * Generate recommendation based on scores
   */
  private getRecommendation(
    rankScore: number,
    performance: TraderPerformance
  ): {
    recommendation: RankedTrader['recommendation'];
    notes?: string;
  } {
    // Check for warning signs
    const warnings: string[] = [];

    if (performance.maxDrawdown > 50) {
      warnings.push('High drawdown risk');
    }

    if (performance.avgTradesPerDay > 20) {
      warnings.push('Very frequent trading');
    }

    if (performance.avgHoldingPeriodHours < 1) {
      warnings.push('Very short holding periods');
    }

    if (performance.profitFactor < 1) {
      warnings.push('Profit factor below 1');
    }

    // Determine recommendation
    let recommendation: RankedTrader['recommendation'];

    if (rankScore >= 80 && warnings.length === 0) {
      recommendation = 'highly_recommended';
    } else if (rankScore >= 60 && warnings.length <= 1) {
      recommendation = 'recommended';
    } else if (rankScore >= 40 || (rankScore >= 30 && warnings.length === 0)) {
      recommendation = 'neutral';
    } else if (rankScore >= 20) {
      recommendation = 'caution';
    } else {
      recommendation = 'not_recommended';
    }

    const result: {
      recommendation: RankedTrader['recommendation'];
      notes?: string;
    } = {
      recommendation,
    };
    if (warnings.length > 0) {
      result.notes = warnings.join('; ');
    }
    return result;
  }

  /**
   * Rank a list of traders
   */
  rankTraders(performances: TraderPerformance[]): RankedTrader[] {
    // Filter traders that pass minimum requirements
    const qualified: { performance: TraderPerformance; filterReason?: string }[] = [];
    const disqualified: { performance: TraderPerformance; reason: string }[] = [];

    for (const performance of performances) {
      const filterResult = this.passesFilters(performance);
      if (filterResult.passes) {
        qualified.push({ performance });
      } else {
        disqualified.push({ performance, reason: filterResult.reason! });
      }
    }

    log.info('Filtered traders for ranking', {
      total: performances.length,
      qualified: qualified.length,
      disqualified: disqualified.length,
    });

    if (qualified.length === 0) {
      return [];
    }

    // Calculate scores for each qualified trader
    const qualifiedPerformances = qualified.map((q) => q.performance);
    const scoredTraders: {
      performance: TraderPerformance;
      scores: ReturnType<TraderRanker['calculateScores']>;
      rankScore: number;
    }[] = [];

    for (const { performance } of qualified) {
      const scores = this.calculateScores(performance, qualifiedPerformances);
      const rankScore = this.calculateRankScore(scores);
      scoredTraders.push({ performance, scores, rankScore });
    }

    // Sort by rank score (descending)
    scoredTraders.sort((a, b) => b.rankScore - a.rankScore);

    // Build ranked trader list
    const rankedTraders: RankedTrader[] = scoredTraders.map((st, index) => {
      const { recommendation, notes } = this.getRecommendation(st.rankScore, st.performance);

      const ranked: RankedTrader = {
        rank: index + 1,
        address: st.performance.address,
        performance: st.performance,
        rankScore: st.rankScore,
        scores: st.scores,
        recommendation,
      };
      if (st.performance.name) {
        ranked.name = st.performance.name;
      }
      if (notes) {
        ranked.notes = notes;
      }
      return ranked;
    });

    log.info('Traders ranked', {
      count: rankedTraders.length,
      topScore: rankedTraders[0]?.rankScore.toFixed(1),
      topAddress: rankedTraders[0]?.address.slice(0, 10) + '...',
    });

    return rankedTraders;
  }

  /**
   * Get top N traders
   */
  getTopTraders(performances: TraderPerformance[], count: number = 10): RankedTrader[] {
    const ranked = this.rankTraders(performances);
    return ranked.slice(0, count);
  }

  /**
   * Find similar traders to a reference trader
   */
  findSimilarTraders(
    reference: TraderPerformance,
    candidates: TraderPerformance[],
    count: number = 5
  ): RankedTrader[] {
    // Calculate similarity scores based on key metrics
    const scoredCandidates = candidates
      .filter((c) => c.address !== reference.address)
      .map((candidate) => {
        // Similarity based on trading style metrics
        const roiDiff = Math.abs(candidate.roi - reference.roi) / Math.max(Math.abs(reference.roi), 1);
        const winRateDiff = Math.abs(candidate.winRate - reference.winRate);
        const volumeDiff =
          Math.abs(candidate.totalVolume - reference.totalVolume) /
          Math.max(reference.totalVolume, 1);
        const holdingDiff =
          Math.abs(candidate.avgHoldingPeriodHours - reference.avgHoldingPeriodHours) /
          Math.max(reference.avgHoldingPeriodHours, 1);

        // Lower difference = higher similarity
        const similarity =
          100 - (roiDiff * 25 + winRateDiff * 100 * 25 + volumeDiff * 25 + holdingDiff * 25);

        return {
          performance: candidate,
          similarity: Math.max(0, similarity),
        };
      });

    // Sort by similarity (descending)
    scoredCandidates.sort((a, b) => b.similarity - a.similarity);

    // Rank the similar traders
    const similarPerformances = scoredCandidates.slice(0, count * 2).map((sc) => sc.performance);
    const ranked = this.rankTraders(similarPerformances);

    return ranked.slice(0, count);
  }

  /**
   * Update ranking criteria
   */
  updateCriteria(criteria: Partial<RankingCriteria>): void {
    this.criteria = { ...this.criteria, ...criteria };
    this.validateWeights();
    log.info('Ranking criteria updated', this.criteria);
  }

  /**
   * Get current criteria
   */
  getCriteria(): RankingCriteria {
    return { ...this.criteria };
  }

  /**
   * Get recommended criteria presets
   */
  static getPresets(): Record<string, RankingCriteria> {
    return {
      conservative: {
        roiWeight: 0.25,
        winRateWeight: 0.30,
        profitFactorWeight: 0.20,
        consistencyWeight: 0.25,
        minTrades: 20,
        minActiveDays: 14,
        minWinRate: 0.55,
        minRoi: 0,
        maxDrawdown: 40,
        minProfitFactor: 1.2,
      },
      aggressive: {
        roiWeight: 0.45,
        winRateWeight: 0.20,
        profitFactorWeight: 0.15,
        consistencyWeight: 0.20,
        minTrades: 5,
        minActiveDays: 3,
        minWinRate: 0.40,
        minRoi: -100,
        maxDrawdown: 100,
        minProfitFactor: 0.3,
      },
      balanced: {
        roiWeight: 0.35,
        winRateWeight: 0.25,
        profitFactorWeight: 0.20,
        consistencyWeight: 0.20,
        minTrades: 10,
        minActiveDays: 7,
        minWinRate: 0.45,
        minRoi: -50,
        maxDrawdown: 80,
        minProfitFactor: 0.5,
      },
      highVolume: {
        roiWeight: 0.30,
        winRateWeight: 0.20,
        profitFactorWeight: 0.15,
        consistencyWeight: 0.15,
        volumeWeight: 0.20,
        minTrades: 50,
        minActiveDays: 14,
        minWinRate: 0.45,
        minRoi: -30,
        maxDrawdown: 60,
        minVolume: 10000,
      },
    };
  }
}

// Export singleton instance with default criteria
export const traderRanker = new TraderRanker();
