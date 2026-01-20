import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { PerformanceCalculator } from '../analytics/performance.js';
import type { Trade, Position, AccountBalance } from '../../clients/shared/interfaces.js';

const log = logger('SessionTracker');

/**
 * Session state
 */
export interface SessionState {
  id: string;
  startTime: Date;
  endTime?: Date;
  durationSeconds?: number;
  
  // Starting state
  startBalance: number;
  startTradesCount: number;
  
  // Ending state
  endBalance?: number;
  endTradesCount?: number;
  
  // Calculated metrics
  netPnl?: number;
  tradesExecuted: number;
  opportunitiesDetected: number;
  executionsSucceeded: number;
  
  // Performance metrics
  winRate?: number;
  profitFactor?: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  maxDrawdownPercent?: number;
  
  // Strategy breakdown
  strategiesUsed: string[];
  pnlByStrategy: Record<string, number>;
  
  // Metadata
  mode: 'paper' | 'live';
  notes?: string;
  
  // Status
  isActive: boolean;
}

/**
 * Session summary for API responses
 */
export interface SessionSummary {
  totalSessions: number;
  activeSessions: number;
  totalTrades: number;
  totalPnl: number;
  avgPnlPerSession: number;
  avgWinRate: number;
  avgProfitFactor: number;
  totalDurationHours: number;
  bestSession: SessionState | null;
  worstSession: SessionState | null;
}

/**
 * Callbacks for fetching data
 */
export interface SessionTrackerCallbacks {
  getBalance: () => Promise<AccountBalance>;
  getTrades: (limit?: number) => Promise<Trade[]>;
  getPositions: () => Promise<Position[]>;
  getTradingState: () => { opportunitiesDetected: number; executionsSucceeded: number };
}

/**
 * Session Tracker - manages trading session lifecycle and metrics
 */
export class SessionTracker {
  private currentSession: SessionState | null = null;
  private completedSessions: SessionState[] = [];
  private callbacks: SessionTrackerCallbacks;
  private mode: 'paper' | 'live';

  constructor(callbacks: SessionTrackerCallbacks, mode: 'paper' | 'live' = 'paper') {
    this.callbacks = callbacks;
    this.mode = mode;
    log.info('Session tracker initialized', { mode });
  }

  /**
   * Start a new trading session
   */
  async startSession(notes?: string): Promise<SessionState> {
    if (this.currentSession?.isActive) {
      log.warn('Session already active, ending previous session first');
      await this.endSession();
    }

    try {
      const balance = await this.callbacks.getBalance();
      const trades = await this.callbacks.getTrades();
      const tradingState = this.callbacks.getTradingState();

      const session: SessionState = {
        id: uuidv4(),
        startTime: new Date(),
        startBalance: balance.total,
        startTradesCount: trades.length,
        tradesExecuted: 0,
        opportunitiesDetected: tradingState.opportunitiesDetected,
        executionsSucceeded: tradingState.executionsSucceeded,
        strategiesUsed: [],
        pnlByStrategy: {},
        mode: this.mode,
        isActive: true,
      };

      // Only set notes if provided
      if (notes !== undefined) {
        session.notes = notes;
      }

      this.currentSession = session;

      log.info('Session started', {
        sessionId: this.currentSession.id,
        startBalance: this.currentSession.startBalance,
        startTradesCount: this.currentSession.startTradesCount,
      });

      return this.currentSession;
    } catch (error) {
      log.error('Failed to start session', { error });
      throw error;
    }
  }

  /**
   * End the current trading session
   */
  async endSession(notes?: string): Promise<SessionState | null> {
    if (!this.currentSession || !this.currentSession.isActive) {
      log.warn('No active session to end');
      return null;
    }

    const currentSessionRef = this.currentSession;

    try {
      const endTime = new Date();
      const balance = await this.callbacks.getBalance();
      const allTrades = await this.callbacks.getTrades();
      // Positions fetched for future use (e.g., unrealized P&L)
      await this.callbacks.getPositions();
      const tradingState = this.callbacks.getTradingState();

      // Filter trades that happened during this session
      const sessionTrades = allTrades.filter(
        (t) => t.executedAt >= currentSessionRef.startTime && t.executedAt <= endTime
      );

      // Calculate performance metrics
      const metrics = PerformanceCalculator.calculateMetrics(sessionTrades);
      const metricsByStrategy = PerformanceCalculator.calculateMetricsByStrategy(sessionTrades);
      
      // Build strategy breakdown
      const strategiesUsed: string[] = [];
      const pnlByStrategy: Record<string, number> = {};
      
      for (const [strategyId, strategyMetrics] of metricsByStrategy.entries()) {
        strategiesUsed.push(strategyId);
        pnlByStrategy[strategyId] = strategyMetrics.grossProfit - strategyMetrics.grossLoss;
      }

      // Calculate duration
      const durationSeconds = (endTime.getTime() - currentSessionRef.startTime.getTime()) / 1000;

      // Determine final notes
      const finalNotes = notes ?? currentSessionRef.notes;

      // Update session with final state
      const completedSession: SessionState = {
        ...currentSessionRef,
        endTime,
        durationSeconds,
        endBalance: balance.total,
        endTradesCount: allTrades.length,
        netPnl: balance.total - currentSessionRef.startBalance,
        tradesExecuted: sessionTrades.length,
        opportunitiesDetected: tradingState.opportunitiesDetected - currentSessionRef.opportunitiesDetected,
        executionsSucceeded: tradingState.executionsSucceeded - currentSessionRef.executionsSucceeded,
        winRate: metrics.winRate,
        profitFactor: metrics.profitFactor,
        sharpeRatio: metrics.sharpeRatio,
        maxDrawdown: metrics.maxDrawdown,
        maxDrawdownPercent: metrics.maxDrawdownPercent,
        strategiesUsed,
        pnlByStrategy,
        isActive: false,
      };

      // Only set notes if defined
      if (finalNotes !== undefined) {
        completedSession.notes = finalNotes;
      }

      // Store in completed sessions
      this.completedSessions.push(completedSession);
      this.currentSession = null;

      log.info('Session ended', {
        sessionId: completedSession.id,
        durationHours: (durationSeconds / 3600).toFixed(2),
        netPnl: completedSession.netPnl?.toFixed(2),
        tradesExecuted: completedSession.tradesExecuted,
        winRate: completedSession.winRate !== undefined ? (completedSession.winRate * 100).toFixed(1) + '%' : 'N/A',
      });

      return completedSession;
    } catch (error) {
      log.error('Failed to end session', { error });
      throw error;
    }
  }

  /**
   * Get current session state
   */
  async getCurrentSession(): Promise<SessionState | null> {
    if (!this.currentSession) {
      return null;
    }

    // Update with live metrics
    try {
      const balance = await this.callbacks.getBalance();
      const allTrades = await this.callbacks.getTrades();
      const tradingState = this.callbacks.getTradingState();
      const now = new Date();

      // Filter trades that happened during this session
      const sessionTrades = allTrades.filter(
        (t) => t.executedAt >= this.currentSession!.startTime && t.executedAt <= now
      );

      // Calculate live metrics
      const metrics = PerformanceCalculator.calculateMetrics(sessionTrades);
      const durationSeconds = (now.getTime() - this.currentSession.startTime.getTime()) / 1000;

      return {
        ...this.currentSession,
        durationSeconds,
        endBalance: balance.total,
        endTradesCount: allTrades.length,
        netPnl: balance.total - this.currentSession.startBalance,
        tradesExecuted: sessionTrades.length,
        opportunitiesDetected: tradingState.opportunitiesDetected - this.currentSession.opportunitiesDetected,
        executionsSucceeded: tradingState.executionsSucceeded - this.currentSession.executionsSucceeded,
        winRate: metrics.winRate,
        profitFactor: metrics.profitFactor,
        sharpeRatio: metrics.sharpeRatio,
        maxDrawdown: metrics.maxDrawdown,
        maxDrawdownPercent: metrics.maxDrawdownPercent,
      };
    } catch (error) {
      log.error('Failed to get current session', { error });
      return this.currentSession;
    }
  }

  /**
   * Get all completed sessions
   */
  getCompletedSessions(): SessionState[] {
    return [...this.completedSessions];
  }

  /**
   * Get session by ID
   */
  getSession(id: string): SessionState | null {
    if (this.currentSession?.id === id) {
      return this.currentSession;
    }
    return this.completedSessions.find((s) => s.id === id) || null;
  }

  /**
   * Get session summary statistics
   */
  getSummary(): SessionSummary {
    const allSessions = [...this.completedSessions];
    if (this.currentSession) {
      allSessions.push(this.currentSession);
    }

    if (allSessions.length === 0) {
      return {
        totalSessions: 0,
        activeSessions: this.currentSession ? 1 : 0,
        totalTrades: 0,
        totalPnl: 0,
        avgPnlPerSession: 0,
        avgWinRate: 0,
        avgProfitFactor: 0,
        totalDurationHours: 0,
        bestSession: null,
        worstSession: null,
      };
    }

    const completedWithPnl = this.completedSessions.filter((s) => s.netPnl !== undefined);
    
    const totalPnl = completedWithPnl.reduce((sum, s) => sum + (s.netPnl || 0), 0);
    const totalTrades = completedWithPnl.reduce((sum, s) => sum + s.tradesExecuted, 0);
    const totalDurationSeconds = completedWithPnl.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    
    const avgWinRate = completedWithPnl.length > 0
      ? completedWithPnl.reduce((sum, s) => sum + (s.winRate || 0), 0) / completedWithPnl.length
      : 0;
    
    const avgProfitFactor = completedWithPnl.length > 0
      ? completedWithPnl.reduce((sum, s) => sum + (s.profitFactor || 0), 0) / completedWithPnl.length
      : 0;

    // Find best and worst sessions
    let bestSession: SessionState | null = null;
    let worstSession: SessionState | null = null;

    for (const session of completedWithPnl) {
      if (!bestSession || (session.netPnl || 0) > (bestSession.netPnl || 0)) {
        bestSession = session;
      }
      if (!worstSession || (session.netPnl || 0) < (worstSession.netPnl || 0)) {
        worstSession = session;
      }
    }

    return {
      totalSessions: allSessions.length,
      activeSessions: this.currentSession ? 1 : 0,
      totalTrades,
      totalPnl,
      avgPnlPerSession: completedWithPnl.length > 0 ? totalPnl / completedWithPnl.length : 0,
      avgWinRate,
      avgProfitFactor,
      totalDurationHours: totalDurationSeconds / 3600,
      bestSession,
      worstSession,
    };
  }

  /**
   * Check if a session is currently active
   */
  isSessionActive(): boolean {
    return this.currentSession?.isActive || false;
  }

  /**
   * Export sessions to JSON for backup/analysis
   */
  exportToJson(): string {
    return JSON.stringify({
      currentSession: this.currentSession,
      completedSessions: this.completedSessions,
      summary: this.getSummary(),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  /**
   * Import sessions from JSON
   */
  importFromJson(json: string): void {
    try {
      const data = JSON.parse(json);
      if (data.completedSessions) {
        // Convert date strings back to Date objects
        this.completedSessions = data.completedSessions.map((s: SessionState) => ({
          ...s,
          startTime: new Date(s.startTime),
          endTime: s.endTime ? new Date(s.endTime) : undefined,
        }));
      }
      log.info('Sessions imported', { count: this.completedSessions.length });
    } catch (error) {
      log.error('Failed to import sessions', { error });
      throw error;
    }
  }
}
