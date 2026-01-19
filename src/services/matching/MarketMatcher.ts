import Anthropic from '@anthropic-ai/sdk';
import type { NormalizedMarket } from '../../clients/shared/interfaces.js';
import { logger, type Logger } from '../../utils/logger.js';
import { marketMatchAttempts, marketMatchSuccess, marketMatchConfidence, activePairs } from '../../utils/metrics.js';
import { getConfig } from '../../config/index.js';

/**
 * Market pair match result
 */
export interface MarketPair {
  id: string;
  polymarketMarket: NormalizedMarket;
  kalshiMarket: NormalizedMarket;
  polymarketOutcomeId: string;
  kalshiOutcomeId: string;
  confidence: number;
  matchReason: string;
  lastVerified: Date;
  isActive: boolean;
}

/**
 * Match candidate from similarity search
 */
interface MatchCandidate {
  polymarket: NormalizedMarket;
  kalshi: NormalizedMarket;
  similarityScore: number;
}

/**
 * LLM verification result
 */
interface LLMVerificationResult {
  isMatch: boolean;
  confidence: number;
  reasoning: string;
  polymarketOutcome: 'YES' | 'NO';
  kalshiOutcome: 'YES' | 'NO';
}

/**
 * Market Matcher Service
 * Matches markets across Polymarket and Kalshi platforms using:
 * 1. Text similarity for candidate discovery
 * 2. Claude LLM for semantic equivalence verification
 */
export class MarketMatcher {
  private log: Logger;
  private anthropic: Anthropic | null = null;
  private pairs: Map<string, MarketPair>;
  private minConfidence: number;
  private dateProximityDays: number;

  constructor() {
    this.log = logger('MarketMatcher');
    this.pairs = new Map();
    this.minConfidence = 0.8; // 80% confidence threshold
    this.dateProximityDays = 7; // Markets must be within 7 days

    // Initialize Anthropic client if API key available
    const config = getConfig();
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({
        apiKey: config.anthropic.apiKey,
      });
      this.log.info('Anthropic client initialized for LLM matching');
    } else {
      this.log.warn('Anthropic API key not configured - LLM matching disabled');
    }
  }

  /**
   * Find matching markets across platforms
   */
  async findMatches(
    polymarketMarkets: NormalizedMarket[],
    kalshiMarkets: NormalizedMarket[]
  ): Promise<MarketPair[]> {
    this.log.info('Finding market matches', {
      polymarketCount: polymarketMarkets.length,
      kalshiCount: kalshiMarkets.length,
    });

    // Stage 1: Find candidates using text similarity
    const candidates = this.findCandidates(polymarketMarkets, kalshiMarkets);
    this.log.info(`Found ${candidates.length} match candidates`);

    // Stage 2: Verify candidates using LLM
    const verifiedPairs: MarketPair[] = [];

    for (const candidate of candidates) {
      marketMatchAttempts.inc();

      try {
        const verification = await this.verifyMatch(candidate);

        if (verification.isMatch && verification.confidence >= this.minConfidence) {
          const pairId = `${candidate.polymarket.externalId}:${candidate.kalshi.externalId}`;

          // Find the outcome IDs
          const polyOutcome = candidate.polymarket.outcomes.find(
            (o) => o.name.toUpperCase() === verification.polymarketOutcome
          );
          const kalshiOutcome = candidate.kalshi.outcomes.find(
            (o) => o.name.toUpperCase() === verification.kalshiOutcome
          );

          if (polyOutcome && kalshiOutcome) {
            const pair: MarketPair = {
              id: pairId,
              polymarketMarket: candidate.polymarket,
              kalshiMarket: candidate.kalshi,
              polymarketOutcomeId: polyOutcome.externalId,
              kalshiOutcomeId: kalshiOutcome.externalId,
              confidence: verification.confidence,
              matchReason: verification.reasoning,
              lastVerified: new Date(),
              isActive: true,
            };

            this.pairs.set(pairId, pair);
            verifiedPairs.push(pair);

            marketMatchSuccess.inc();
            marketMatchConfidence.observe(verification.confidence);

            this.log.info('Market pair verified', {
              pairId,
              polyTitle: candidate.polymarket.title,
              kalshiTitle: candidate.kalshi.title,
              confidence: verification.confidence,
            });
          }
        }
      } catch (error) {
        this.log.error('Failed to verify match', {
          polymarket: candidate.polymarket.title,
          kalshi: candidate.kalshi.title,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    activePairs.set(this.pairs.size);

    this.log.info(`Verified ${verifiedPairs.length} market pairs`);
    return verifiedPairs;
  }

  /**
   * Find match candidates using text similarity
   */
  private findCandidates(
    polymarketMarkets: NormalizedMarket[],
    kalshiMarkets: NormalizedMarket[]
  ): MatchCandidate[] {
    const candidates: MatchCandidate[] = [];

    for (const poly of polymarketMarkets) {
      if (!poly.isActive) continue;

      for (const kalshi of kalshiMarkets) {
        if (!kalshi.isActive) continue;

        // Check date proximity
        if (!this.areDatesClose(poly.endDate, kalshi.endDate)) {
          continue;
        }

        // Calculate text similarity
        const similarity = this.calculateTextSimilarity(poly, kalshi);

        if (similarity > 0.3) {
          // Low threshold for candidates, LLM will verify
          candidates.push({
            polymarket: poly,
            kalshi: kalshi,
            similarityScore: similarity,
          });
        }
      }
    }

    // Sort by similarity and take top candidates
    candidates.sort((a, b) => b.similarityScore - a.similarityScore);
    return candidates.slice(0, 50); // Limit to avoid too many LLM calls
  }

  /**
   * Check if two dates are within proximity threshold
   */
  private areDatesClose(date1: Date, date2: Date): boolean {
    const diffMs = Math.abs(date1.getTime() - date2.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= this.dateProximityDays;
  }

  /**
   * Calculate text similarity between two markets
   */
  private calculateTextSimilarity(poly: NormalizedMarket, kalshi: NormalizedMarket): number {
    const polyText = this.normalizeText(`${poly.title} ${poly.description || ''}`);
    const kalshiText = this.normalizeText(`${kalshi.title} ${kalshi.description || ''}`);

    // Simple Jaccard similarity on words
    const polyWords = new Set(polyText.split(/\s+/));
    const kalshiWords = new Set(kalshiText.split(/\s+/));

    const intersection = new Set([...polyWords].filter((x) => kalshiWords.has(x)));
    const union = new Set([...polyWords, ...kalshiWords]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Verify match using Claude LLM
   */
  private async verifyMatch(candidate: MatchCandidate): Promise<LLMVerificationResult> {
    // If no Anthropic client, use simple heuristic matching
    if (!this.anthropic) {
      return this.heuristicMatch(candidate);
    }

    const prompt = this.buildVerificationPrompt(candidate);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Parse the response
      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return this.parseVerificationResponse(content.text);
    } catch (error) {
      this.log.error('LLM verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fall back to heuristic
      return this.heuristicMatch(candidate);
    }
  }

  /**
   * Build prompt for LLM verification
   */
  private buildVerificationPrompt(candidate: MatchCandidate): string {
    return `Analyze these two prediction markets and determine if they are betting on the same event/outcome.

Market A (Polymarket):
Title: ${candidate.polymarket.title}
Description: ${candidate.polymarket.description || 'N/A'}
End Date: ${candidate.polymarket.endDate.toISOString()}
Outcomes: ${candidate.polymarket.outcomes.map((o) => o.name).join(', ')}

Market B (Kalshi):
Title: ${candidate.kalshi.title}
Description: ${candidate.kalshi.description || 'N/A'}
End Date: ${candidate.kalshi.endDate.toISOString()}
Outcomes: ${candidate.kalshi.outcomes.map((o) => o.name).join(', ')}

Respond in JSON format:
{
  "isMatch": boolean,
  "confidence": number (0-1),
  "reasoning": "brief explanation",
  "polymarketOutcome": "YES" or "NO" (which Polymarket outcome corresponds to a positive event),
  "kalshiOutcome": "YES" or "NO" (which Kalshi outcome corresponds to the SAME positive event)
}

Important:
- Markets must be about the SAME specific event (same person, same date, same metric, etc.)
- Consider subtle differences in wording that might make them NOT equivalent
- "Will X happen by Y date" vs "Will X happen by Z date" are DIFFERENT markets if Y != Z
- Confidence should be high (>0.8) only if you're certain they're equivalent`;
  }

  /**
   * Parse LLM verification response
   */
  private parseVerificationResponse(response: string): LLMVerificationResult {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        isMatch: Boolean(parsed.isMatch),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        reasoning: String(parsed.reasoning || 'No reasoning provided'),
        polymarketOutcome: parsed.polymarketOutcome === 'NO' ? 'NO' : 'YES',
        kalshiOutcome: parsed.kalshiOutcome === 'NO' ? 'NO' : 'YES',
      };
    } catch (error) {
      this.log.warn('Failed to parse LLM response', {
        response,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isMatch: false,
        confidence: 0,
        reasoning: 'Failed to parse LLM response',
        polymarketOutcome: 'YES',
        kalshiOutcome: 'YES',
      };
    }
  }

  /**
   * Heuristic matching when LLM is not available
   */
  private heuristicMatch(candidate: MatchCandidate): LLMVerificationResult {
    const polyText = this.normalizeText(candidate.polymarket.title);
    const kalshiText = this.normalizeText(candidate.kalshi.title);

    // Check for key matching patterns
    const patterns = [
      /will (\w+) win/i,
      /(\w+) to win/i,
      /(\w+) vs (\w+)/i,
      /(\w+) president/i,
      /price of (\w+)/i,
      /(\w+) by (\d{4})/i,
    ];

    let matchingPatterns = 0;
    for (const pattern of patterns) {
      const polyMatch = polyText.match(pattern);
      const kalshiMatch = kalshiText.match(pattern);

      if (polyMatch && kalshiMatch) {
        // Check if captured groups are similar
        const polyCapture = polyMatch[1]?.toLowerCase();
        const kalshiCapture = kalshiMatch[1]?.toLowerCase();

        if (polyCapture && kalshiCapture && polyCapture === kalshiCapture) {
          matchingPatterns++;
        }
      }
    }

    // Calculate heuristic confidence
    const textSimilarity = candidate.similarityScore;
    const patternBonus = matchingPatterns * 0.1;
    const dateBonus = this.areDatesClose(candidate.polymarket.endDate, candidate.kalshi.endDate) ? 0.1 : 0;

    const confidence = Math.min(0.95, textSimilarity + patternBonus + dateBonus);
    const isMatch = confidence >= this.minConfidence;

    return {
      isMatch,
      confidence,
      reasoning: `Heuristic match: ${textSimilarity.toFixed(2)} text similarity, ${matchingPatterns} pattern matches`,
      polymarketOutcome: 'YES',
      kalshiOutcome: 'YES',
    };
  }

  /**
   * Get all verified pairs
   */
  getPairs(): MarketPair[] {
    return Array.from(this.pairs.values()).filter((p) => p.isActive);
  }

  /**
   * Get a specific pair by ID
   */
  getPair(pairId: string): MarketPair | undefined {
    return this.pairs.get(pairId);
  }

  /**
   * Invalidate a pair (e.g., if a market closes)
   */
  invalidatePair(pairId: string): void {
    const pair = this.pairs.get(pairId);
    if (pair) {
      pair.isActive = false;
      activePairs.set(this.getPairs().length);
      this.log.info('Market pair invalidated', { pairId });
    }
  }

  /**
   * Clear all pairs
   */
  clearPairs(): void {
    this.pairs.clear();
    activePairs.set(0);
    this.log.info('All market pairs cleared');
  }

  /**
   * Update market data in existing pairs
   */
  updatePairMarkets(
    polymarketMarkets: NormalizedMarket[],
    kalshiMarkets: NormalizedMarket[]
  ): void {
    const polyMap = new Map(polymarketMarkets.map((m) => [m.externalId, m]));
    const kalshiMap = new Map(kalshiMarkets.map((m) => [m.externalId, m]));

    for (const [pairId, pair] of this.pairs) {
      const updatedPoly = polyMap.get(pair.polymarketMarket.externalId);
      const updatedKalshi = kalshiMap.get(pair.kalshiMarket.externalId);

      if (updatedPoly) {
        pair.polymarketMarket = updatedPoly;
      }

      if (updatedKalshi) {
        pair.kalshiMarket = updatedKalshi;
      }

      // Check if either market is no longer active
      if (!updatedPoly?.isActive || !updatedKalshi?.isActive) {
        pair.isActive = false;
        this.log.info('Market pair deactivated due to inactive market', { pairId });
      }
    }

    activePairs.set(this.getPairs().length);
  }

  /**
   * Get pairs for a specific market
   */
  getPairsForMarket(marketId: string): MarketPair[] {
    return this.getPairs().filter(
      (p) =>
        p.polymarketMarket.externalId === marketId ||
        p.kalshiMarket.externalId === marketId
    );
  }
}
