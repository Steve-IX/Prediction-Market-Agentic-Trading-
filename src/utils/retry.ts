import { logger, type Logger } from './logger.js';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: number;
  retryOn?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  jitter: 0.1,
};

/**
 * Calculate backoff delay with jitter
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.initialDelayMs * Math.pow(options.multiplier, attempt);
  const clampedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  const jitterAmount = clampedDelay * options.jitter * (Math.random() * 2 - 1);
  return Math.round(clampedDelay + jitterAmount);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (default implementation)
 */
function isRetryableError(error: unknown): boolean {
  // Retry on network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('socket hang up')
    ) {
      return true;
    }

    // Retry on rate limit errors (429)
    if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
      return true;
    }

    // Retry on server errors (5xx)
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return true;
    }
  }

  return false;
}

/**
 * Execute a function with retry logic
 */
export async function retry<T>(fn: () => Promise<T>, options: Partial<RetryOptions> = {}): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const log = logger('Retry');

  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = opts.retryOn ? opts.retryOn(error) : isRetryableError(error);

      if (!shouldRetry || attempt === opts.maxAttempts - 1) {
        throw error;
      }

      const delayMs = calculateDelay(attempt, opts);

      // Call onRetry callback if provided
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, error, delayMs);
      } else {
        log.warn(`Attempt ${attempt + 1} failed, retrying in ${delayMs}ms`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await sleep(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Create a retry wrapper for a function
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: Partial<RetryOptions> = {}
): T {
  return (async (...args: Parameters<T>) => {
    return retry(() => fn(...args), options);
  }) as T;
}

/**
 * Retry with timeout
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    retry(fn, options)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

/**
 * Default circuit breaker options
 */
export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenRequests: 1,
};

/**
 * Circuit breaker for protecting against repeated failures
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
  };
  private options: CircuitBreakerOptions;
  private log: Logger;
  private halfOpenRequests = 0;

  constructor(name: string, options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
    this.log = logger(`CircuitBreaker:${name}`);
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state.isOpen) {
      const timeSinceLastFailure = Date.now() - this.state.lastFailure;

      // Check if we should try half-open
      if (timeSinceLastFailure >= this.options.resetTimeoutMs) {
        if (this.halfOpenRequests < this.options.halfOpenRequests) {
          this.halfOpenRequests++;
          this.log.info('Circuit half-open, allowing test request');
        } else {
          throw new Error('Circuit breaker is open');
        }
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();

      // Success - reset state
      if (this.state.isOpen) {
        this.log.info('Circuit closed after successful request');
      }
      this.state.failures = 0;
      this.state.isOpen = false;
      this.halfOpenRequests = 0;

      return result;
    } catch (error) {
      this.state.failures++;
      this.state.lastFailure = Date.now();

      if (this.state.failures >= this.options.failureThreshold) {
        this.state.isOpen = true;
        this.log.warn('Circuit opened after reaching failure threshold', {
          failures: this.state.failures,
        });
      }

      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): { isOpen: boolean; failures: number } {
    return {
      isOpen: this.state.isOpen,
      failures: this.state.failures,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
    };
    this.halfOpenRequests = 0;
    this.log.info('Circuit breaker manually reset');
  }
}
