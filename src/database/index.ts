import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getConfig } from '../config/index.js';
import { logger, type Logger } from '../utils/logger.js';
import * as schema from './schema/index.js';

// Re-export schema
export * from './schema/index.js';

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqlClient: ReturnType<typeof postgres> | null = null;

const log: Logger = logger('Database');

/**
 * Get database connection
 * Uses singleton pattern to reuse connections
 */
export function getDb() {
  if (!dbInstance) {
    const config = getConfig();

    log.info('Connecting to database', {
      url: config.database.url.replace(/:[^:@]+@/, ':****@'), // Hide password
    });

    // Create postgres client
    sqlClient = postgres(config.database.url, {
      max: config.database.poolSize,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {}, // Suppress notices
    });

    // Create drizzle instance with schema
    dbInstance = drizzle(sqlClient, {
      schema,
      logger: config.logLevel === 'debug',
    });

    log.info('Database connected');
  }

  return dbInstance;
}

/**
 * Close database connection
 */
export async function closeDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
    dbInstance = null;
    log.info('Database connection closed');
  }
}

/**
 * Execute a raw SQL query
 */
export async function rawQuery<T>(query: string): Promise<T> {
  if (!sqlClient) {
    getDb(); // Initialize connection
  }

  if (!sqlClient) {
    throw new Error('Database not connected');
  }

  return sqlClient.unsafe(query) as unknown as T;
}

/**
 * Check database connection health
 */
export async function checkHealth(): Promise<{ connected: boolean; latencyMs: number }> {
  const start = Date.now();

  try {
    await rawQuery('SELECT 1');
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    log.error('Database health check failed', { error });
    return {
      connected: false,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Initialize database (run migrations if needed)
 * Note: In production, use drizzle-kit migrate instead
 */
export async function initializeDb(): Promise<void> {
  const config = getConfig();
  const hasDatabaseUrl = Boolean(process.env['DATABASE_URL']);

  if (!hasDatabaseUrl) {
    if (config.env === 'production') {
      throw new Error('DATABASE_URL is required in production');
    }
    log.warn('DATABASE_URL not set — running without persistence');
    return;
  }

  getDb();

  try {
    const result = await rawQuery<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'markets'
      );
    `);

    if (!result[0]?.exists) {
      const msg = 'Database tables do not exist. Run: pnpm db:push';
      if (config.env === 'production') {
        throw new Error(msg);
      }
      log.warn(msg);
    } else {
      log.info('Database tables verified');
      const { setPersistenceEnabled } = await import('./persistence.js');
      setPersistenceEnabled(true);
    }
  } catch (error) {
    log.error('Failed to initialize database', { error });
    if (config.env === 'production') {
      throw error;
    }
    log.warn('Continuing without database in non-production environment');
  }
}

// Export types
export type Database = ReturnType<typeof getDb>;
