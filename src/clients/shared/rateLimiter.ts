import { EventEmitter } from 'events';
import { logger, type Logger } from '../../utils/logger.js';
import { rateLimitHits } from '../../utils/metrics.js';

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /**
   * Maximum tokens in the bucket (burst capacity)
   */
  capacity: number;
  /**
   * Tokens added per second (sustained rate)
   */
  refillRate: number;
  /**
   * Whether to allow burst above refill rate
   */
  allowBurst: boolean;
}

/**
 * Default rate limiter configurations
 */
export const DEFAULT_RATE_LIMITS = {
  POLYMARKET_ORDERS: {
    capacity: 500, // Burst: 500 orders
    refillRate: 60, // Sustained: 60 orders/sec
    allowBurst: true,
  },
  POLYMARKET_READ: {
    capacity: 100,
    refillRate: 50,
    allowBurst: true,
  },
  KALSHI_BASIC: {
    capacity: 20,
    refillRate: 20,
    allowBurst: false,
  },
  KALSHI_ADVANCED: {
    capacity: 30,
    refillRate: 30,
    allowBurst: false,
  },
  KALSHI_PREMIER: {
    capacity: 100,
    refillRate: 100,
    allowBurst: false,
  },
  KALSHI_PRIME: {
    capacity: 400,
    refillRate: 400,
    allowBurst: false,
  },
} as const;

/**
 * Token bucket rate limiter
 * Implements a token bucket algorithm for rate limiting API calls
 */
export class RateLimiter extends EventEmitter {
  private log: Logger;
  private config: RateLimiterConfig;
  private tokens: number;
  private lastRefill: number;
  private name: string;
  private waitingQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private processingQueue = false;

  constructor(name: string, config: RateLimiterConfig) {
    super();
    this.name = name;
    this.config = config;
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
    this.log = logger(`RateLimiter:${name}`);
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = elapsed * this.config.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.config.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Acquire a token, waiting if necessary
   * @param tokens Number of tokens to acquire (default: 1)
   * @param timeoutMs Maximum time to wait in milliseconds
   * @returns Promise that resolves when tokens are acquired
   */
  async acquire(tokens: number = 1, timeoutMs: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const tryAcquire = (): void => {
        this.refillTokens();

        // Check if we have enough tokens
        if (this.tokens >= tokens) {
          this.tokens -= tokens;
          resolve();
          this.processQueue();
          return;
        }

        // Check timeout
        const elapsed = Date.now() - startTime;
        if (elapsed >= timeoutMs) {
          rateLimitHits.inc({ limiter: this.name });
          reject(new Error(`Rate limit timeout after ${timeoutMs}ms`));
          return;
        }

        // Calculate wait time
        const tokensNeeded = tokens - this.tokens;
        const waitTimeSeconds = tokensNeeded / this.config.refillRate;
        const waitTimeMs = Math.ceil(waitTimeSeconds * 1000);

        // If burst is allowed and we're close, wait a bit
        if (this.config.allowBurst && waitTimeMs < 100) {
          setTimeout(tryAcquire, waitTimeMs);
          return;
        }

        // Otherwise, add to queue
        this.waitingQueue.push({
          resolve: () => {
            this.refillTokens();
            if (this.tokens >= tokens) {
              this.tokens -= tokens;
              resolve();
            } else {
              // Retry after a short delay
              setTimeout(tryAcquire, 100);
            }
          },
          reject: (error: Error) => reject(error),
          timestamp: Date.now(),
        });

        this.processQueue();
      };

      tryAcquire();
    });
  }

  /**
   * Try to acquire tokens without waiting
   * @param tokens Number of tokens to acquire
   * @returns true if tokens were acquired, false otherwise
   */
  tryAcquire(tokens: number = 1): boolean {
    this.refillTokens();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    rateLimitHits.inc({ limiter: this.name });
    return false;
  }

  /**
   * Process waiting queue
   */
  private processQueue(): void {
    if (this.processingQueue || this.waitingQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    const processNext = (): void => {
      if (this.waitingQueue.length === 0) {
        this.processingQueue = false;
        return;
      }

      this.refillTokens();

      // Find requests that can be satisfied
      const satisfied: typeof this.waitingQueue = [];
      const remaining: typeof this.waitingQueue = [];

      for (const request of this.waitingQueue) {
        if (this.tokens >= 1) {
          satisfied.push(request);
        } else {
          remaining.push(request);
        }
      }

      // Satisfy requests
      for (const request of satisfied) {
        if (this.tokens >= 1) {
          this.tokens -= 1;
          request.resolve();
        }
      }

      this.waitingQueue = remaining;

      // Continue processing if there are more requests
      if (this.waitingQueue.length > 0) {
        const waitTime = Math.ceil((1 / this.config.refillRate) * 1000);
        setTimeout(processNext, waitTime);
      } else {
        this.processingQueue = false;
      }
    };

    processNext();
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  /**
   * Get current rate limiter state
   */
  getState(): {
    tokens: number;
    capacity: number;
    refillRate: number;
    waitingRequests: number;
  } {
    this.refillTokens();
    return {
      tokens: this.tokens,
      capacity: this.config.capacity,
      refillRate: this.config.refillRate,
      waitingRequests: this.waitingQueue.length,
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.config.capacity;
    this.lastRefill = Date.now();
    this.waitingQueue.forEach((req) => {
      req.reject(new Error('Rate limiter reset'));
    });
    this.waitingQueue = [];
    this.log.info('Rate limiter reset');
  }
}

/**
 * Rate limiter manager
 * Manages multiple rate limiters for different endpoints
 */
export class RateLimiterManager {
  private limiters: Map<string, RateLimiter> = new Map();
  private log: Logger;

  constructor() {
    this.log = logger('RateLimiterManager');
  }

  /**
   * Get or create a rate limiter
   */
  getLimiter(name: string, config?: RateLimiterConfig): RateLimiter {
    if (!this.limiters.has(name)) {
      if (!config) {
        throw new Error(`Rate limiter ${name} not found and no config provided`);
      }
      this.limiters.set(name, new RateLimiter(name, config));
      this.log.info(`Created rate limiter: ${name}`, { ...config } as Record<string, unknown>);
    }
    return this.limiters.get(name)!;
  }

  /**
   * Get all rate limiters
   */
  getAllLimiters(): Map<string, RateLimiter> {
    return this.limiters;
  }

  /**
   * Reset a specific rate limiter
   */
  resetLimiter(name: string): void {
    const limiter = this.limiters.get(name);
    if (limiter) {
      limiter.reset();
    }
  }

  /**
   * Reset all rate limiters
   */
  resetAll(): void {
    for (const limiter of this.limiters.values()) {
      limiter.reset();
    }
  }
}
