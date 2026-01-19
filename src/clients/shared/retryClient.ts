import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { retry, type RetryOptions } from '../../utils/retry.js';
import { logger, type Logger } from '../../utils/logger.js';
import { recordApiRequest, observeApiLatency, apiErrors } from '../../utils/metrics.js';

/**
 * Retry client configuration
 */
export interface RetryClientConfig {
  /**
   * Retry options for API calls
   */
  retryOptions?: Partial<RetryOptions>;
  /**
   * Platform name for metrics
   */
  platform: string;
  /**
   * Base URL for the API
   */
  baseURL?: string;
  /**
   * Default timeout in milliseconds
   */
  timeout?: number;
  /**
   * Additional axios configuration
   */
  axiosConfig?: AxiosRequestConfig;
}

/**
 * Axios instance with retry logic and metrics
 */
export class RetryClient {
  private axiosInstance: AxiosInstance;
  private log: Logger;
  private platform: string;
  private retryOptions: Partial<RetryOptions>;

  constructor(config: RetryClientConfig) {
    this.platform = config.platform;
    this.retryOptions = config.retryOptions || {};
    this.log = logger(`RetryClient:${config.platform}`);

    // Create axios instance
    const axiosConfig: AxiosRequestConfig = {
      timeout: config.timeout || 30000,
      ...config.axiosConfig,
    };
    if (config.baseURL) {
      axiosConfig.baseURL = config.baseURL;
    }
    this.axiosInstance = axios.create(axiosConfig);

    // Add request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (requestConfig) => {
        const endpoint = requestConfig.url || 'unknown';
        this.log.debug('API request', {
          method: requestConfig.method,
          url: endpoint,
          platform: this.platform,
        });
        return requestConfig;
      },
      (error) => {
        this.log.error('Request interceptor error', { error });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for metrics
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const endpoint = response.config.url || 'unknown';
        const duration = response.config.metadata?.duration || 0;
        observeApiLatency(this.platform, endpoint, duration);
        recordApiRequest(this.platform, endpoint, 'success');
        return response;
      },
      (error: AxiosError) => {
        const endpoint = error.config?.url || 'unknown';
        const duration = error.config?.metadata?.duration || 0;
        observeApiLatency(this.platform, endpoint, duration);
        recordApiRequest(this.platform, endpoint, 'error');
        
        const errorType = this.getErrorType(error);
        apiErrors.labels(this.platform, errorType).inc();
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get error type from axios error
   */
  private getErrorType(error: AxiosError): string {
    if (error.response) {
      return `http_${error.response.status}`;
    }
    if (error.request) {
      return 'network_error';
    }
    return 'unknown_error';
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      // Retry on network errors
      if (!axiosError.response) {
        return true;
      }

      const status = axiosError.response.status;

      // Retry on 5xx server errors
      if (status >= 500 && status < 600) {
        return true;
      }

      // Retry on 429 (rate limit)
      if (status === 429) {
        return true;
      }

      // Retry on 408 (timeout)
      if (status === 408) {
        return true;
      }

      // Don't retry on 4xx client errors (except 429, 408)
      if (status >= 400 && status < 500) {
        return false;
      }
    }

    // Retry on other errors (network, timeout, etc.)
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
    }

    return false;
  }

  /**
   * Make a GET request with retry
   */
  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  /**
   * Make a POST request with retry
   */
  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  /**
   * Make a PUT request with retry
   */
  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  /**
   * Make a DELETE request with retry
   */
  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  /**
   * Make a PATCH request with retry
   */
  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PATCH', url, data });
  }

  /**
   * Make a request with retry logic
   */
  async request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const startTime = Date.now();
    
    // Add metadata for duration tracking
    const requestConfig: AxiosRequestConfig = {
      ...config,
      metadata: { duration: 0 },
    };

    try {
      const response = await retry(
        async () => {
          const response = await this.axiosInstance.request<T>(requestConfig);
          // Calculate duration
          if (requestConfig.metadata) {
            requestConfig.metadata.duration = Date.now() - startTime;
          }
          return response;
        },
        {
          ...this.retryOptions,
          retryOn: (error) => {
            // Use custom retry logic if provided
            if (this.retryOptions.retryOn) {
              return this.retryOptions.retryOn(error);
            }
            return this.isRetryableError(error);
          },
          onRetry: (attempt, error, delayMs) => {
            const endpoint = config.url || 'unknown';
            this.log.warn(`Retrying request (attempt ${attempt})`, {
              endpoint,
              delayMs,
              error: error instanceof Error ? error.message : String(error),
            });
            if (this.retryOptions.onRetry) {
              this.retryOptions.onRetry(attempt, error, delayMs);
            }
          },
        }
      );

      return response;
    } catch (error) {
      const endpoint = config.url || 'unknown';
      this.log.error('Request failed after retries', {
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the underlying axios instance (for advanced usage)
   */
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

// Extend AxiosRequestConfig to include metadata
declare module 'axios' {
  export interface AxiosRequestConfig {
    metadata?: {
      duration?: number;
      [key: string]: unknown;
    };
  }
}
