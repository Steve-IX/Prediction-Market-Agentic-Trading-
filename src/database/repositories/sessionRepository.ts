import { eq } from 'drizzle-orm';
import { getDb } from '../index.js';
import { sessions, type NewSession } from '../schema/sessions.js';
import { randomUUID } from 'crypto';

export class SessionRepository {
  async startSession(startBalance: number, mode: 'paper' | 'live'): Promise<string> {
    const db = getDb();
    const id = randomUUID();

    const row: NewSession = {
      id,
      startTime: new Date(),
      startBalance: String(startBalance),
      mode,
    };

    await db.insert(sessions).values(row);
    return id;
  }

  async endSession(
    sessionId: string,
    data: {
      endBalance: number;
      netPnl: number;
      tradesExecuted: number;
    }
  ): Promise<void> {
    const db = getDb();
    const endTime = new Date();

    await db
      .update(sessions)
      .set({
        endTime,
        endBalance: String(data.endBalance),
        netPnl: String(data.netPnl),
        tradesExecuted: String(data.tradesExecuted),
        updatedAt: endTime,
      })
      .where(eq(sessions.id, sessionId));
  }
}
