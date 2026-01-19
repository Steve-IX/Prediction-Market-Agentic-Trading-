#!/usr/bin/env tsx
/**
 * Database setup script
 * Initializes database connection, runs migrations, and verifies schema
 */

import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../src/database/schema/index.js';
import { logger } from '../src/utils/logger.js';

dotenv.config();

const log = logger('SetupDB');

async function setupDatabase(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  log.info('Connecting to database...');
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    // Run migrations
    log.info('Running migrations...');
    await migrate(db, { migrationsFolder: './src/database/migrations' });
    log.info('Migrations completed');

    // Verify schema by querying tables
    log.info('Verifying schema...');
    const tables = ['markets', 'orders', 'trades', 'positions'];
    for (const table of tables) {
      try {
        // Try to query the table (this will fail if it doesn't exist)
        await db.execute(`SELECT 1 FROM ${table} LIMIT 1`);
        log.info(`✓ Table ${table} exists`);
      } catch (error) {
        log.warn(`✗ Table ${table} may not exist or is not accessible`, { error });
      }
    }

    log.info('Database setup completed successfully');
  } catch (error) {
    log.error('Database setup failed', { error });
    throw error;
  } finally {
    await client.end();
  }
}

// Run setup
setupDatabase()
  .then(() => {
    log.info('Setup complete');
    process.exit(0);
  })
  .catch((error) => {
    log.error('Setup failed', { error });
    process.exit(1);
  });
