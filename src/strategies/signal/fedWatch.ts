import { BaseStrategy, type StrategyConfig } from '../base.js';
import type { OrderManager } from '../../services/orderManager/index.js';
import { PLATFORMS, ORDER_TYPES } from '../../config/constants.js';

/**
 * Fed meeting date
 */
export interface FedMeeting {
  /**
   * Meeting date
   */
  date: Date;
  /**
   * Meeting type (FOMC, etc.)
   */
  type: string;
  /**
   * Whether rate decision is expected
   */
  hasRateDecision: boolean;
}

/**
 * FedWatch strategy configuration
 */
export interface FedWatchConfig extends StrategyConfig {
  /**
   * Markets to trade (Fed rate decision markets)
   */
  markets: Array<{
    marketId: string;
    outcomeId: string;
    platform: string;
  }>;
  /**
   * Fed meeting dates
   */
  meetings: FedMeeting[];
  /**
   * Days before meeting to start positioning
   */
  daysBeforeMeeting: number;
  /**
   * Position size in USD
   */
  positionSize: number;
  /**
   * Check interval in milliseconds
   */
  checkIntervalMs: number;
}

/**
 * FedWatch Strategy
 * Monitors Fed meeting dates and trades rate decision markets
 */
export class FedWatchStrategy extends BaseStrategy {
  private checkInterval: NodeJS.Timeout | null = null;
  private upcomingMeetings: FedMeeting[] = [];

  constructor(config: FedWatchConfig, orderManager: OrderManager) {
    super(config, orderManager);
    this.upcomingMeetings = (config as FedWatchConfig).meetings || [];
  }

  /**
   * Start FedWatch
   */
  protected async onStart(): Promise<void> {
    // Filter upcoming meetings
    const now = new Date();
    this.upcomingMeetings = (this.config as FedWatchConfig).meetings.filter(
      (meeting) => meeting.date > now
    );

    // Start monitoring
    this.checkInterval = setInterval(() => {
      this.checkMeetings().catch((error) => {
        this.log.error('Failed to check meetings', { error });
      });
    }, (this.config as FedWatchConfig).checkIntervalMs || 60000); // Check every minute

    // Initial check
    await this.checkMeetings();
  }

  /**
   * Stop FedWatch
   */
  protected async onStop(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check upcoming meetings and place trades
   */
  private async checkMeetings(): Promise<void> {
    const config = this.config as FedWatchConfig;
    const now = new Date();

    for (const meeting of this.upcomingMeetings) {
      const daysUntil = Math.floor(
        (meeting.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Check if we should start positioning
      if (daysUntil <= config.daysBeforeMeeting && daysUntil >= 0) {
        await this.positionForMeeting(meeting, config);
      }
    }

    // Remove past meetings
    this.upcomingMeetings = this.upcomingMeetings.filter((m) => m.date > now);
  }

  /**
   * Position for a Fed meeting
   */
  private async positionForMeeting(meeting: FedMeeting, config: FedWatchConfig): Promise<void> {
    this.log.info('Positioning for Fed meeting', { meeting });

    for (const market of config.markets) {
      try {
        // Get current market price
        const client = this.orderManager.getClient(market.platform);
        if (!client?.isConnected()) {
          continue;
        }

        const orderBook = await client.getOrderBook(market.marketId, market.outcomeId);
        if (!orderBook) {
          continue;
        }

        // Determine direction based on market conditions
        // This is a simplified example - real implementation would use
        // economic data, Fed statements, etc.
        const midPrice = orderBook.yes
          ? (orderBook.yes.bestBid + orderBook.yes.bestAsk) / 2
          : 0.5;

        // Place order (example: buy if price is below threshold)
        const threshold = 0.6; // 60% probability
        if (midPrice < threshold) {
          await this.orderManager.placeOrder({
            platform: market.platform as typeof PLATFORMS[keyof typeof PLATFORMS],
            marketId: market.marketId,
            outcomeId: market.outcomeId,
            side: 'buy',
            price: orderBook.yes?.bestAsk || 0.6,
            size: config.positionSize,
            type: ORDER_TYPES.GTC,
            strategyId: this.config.id,
            metadata: {
              meetingDate: meeting.date.toISOString(),
              meetingType: meeting.type,
            },
          });
        }
      } catch (error) {
        this.log.error('Failed to position for meeting', { meeting, market, error });
      }
    }
  }

  /**
   * Add a Fed meeting
   */
  addMeeting(meeting: FedMeeting): void {
    this.upcomingMeetings.push(meeting);
    this.upcomingMeetings.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Get upcoming meetings
   */
  getUpcomingMeetings(): FedMeeting[] {
    return [...this.upcomingMeetings];
  }
}
