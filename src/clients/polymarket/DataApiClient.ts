import axios, { type AxiosInstance } from 'axios';
import { getConfig } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const log = logger('PolymarketDataApi');

export interface PolymarketDataPosition {
  asset: string;
  conditionId: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentValue?: number;
  title?: string;
}

/**
 * Shared client for Polymarket Data API (positions, activity).
 */
export class PolymarketDataApiClient {
  private http: AxiosInstance;

  constructor(baseUrl?: string) {
    const config = getConfig();
    this.http = axios.create({
      baseURL: baseUrl ?? config.traderDiscovery.polymarketDataApiUrl,
      timeout: 15000,
    });
  }

  async getPositions(userAddress: string): Promise<PolymarketDataPosition[]> {
    try {
      const response = await this.http.get<PolymarketDataPosition[]>('/positions', {
        params: { user: userAddress },
      });
      return response.data ?? [];
    } catch (error) {
      log.warn('Failed to fetch positions from data API', {
        user: userAddress.slice(0, 10) + '...',
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

let sharedClient: PolymarketDataApiClient | null = null;

export function getPolymarketDataApiClient(): PolymarketDataApiClient {
  if (!sharedClient) {
    sharedClient = new PolymarketDataApiClient();
  }
  return sharedClient;
}
