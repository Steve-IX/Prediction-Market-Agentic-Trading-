#!/usr/bin/env tsx
/**
 * TimescaleDB setup script
 * Converts price_history table to hypertable and sets up continuous aggregates
 */

import * as dotenv from 'dotenv';
import postgres from 'postgres';
import { logger } from '../src/utils/logger.js';

dotenv.config();

const log = logger('SetupTimescaleDB');

async function setupTimescaleDB(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  log.info('Connecting to database...');
  const client = postgres(databaseUrl);

  try {
    // Check if TimescaleDB extension is installed
    log.info('Checking TimescaleDB extension...');
    const extensionCheck = await client`
      SELECT EXISTS(
        SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
      ) as exists;
    `;

    if (!extensionCheck[0]?.exists) {
      log.info('Installing TimescaleDB extension...');
      await client`CREATE EXTENSION IF NOT EXISTS timescaledb;`;
      log.info('TimescaleDB extension installed');
    } else {
      log.info('TimescaleDB extension already installed');
    }

    // Convert price_history table to hypertable
    log.info('Converting price_history table to hypertable...');
    try {
      await client`
        SELECT create_hypertable('price_history', 'timestamp', if_not_exists => TRUE);
      `;
      log.info('✓ price_history table converted to hypertable');
    } catch (error) {
      // Table might already be a hypertable
      if (error instanceof Error && error.message.includes('already a hypertable')) {
        log.info('✓ price_history table is already a hypertable');
      } else {
        throw error;
      }
    }

    // Create continuous aggregate for hourly price data
    log.info('Creating continuous aggregates...');
    try {
      await client`
        CREATE MATERIALIZED VIEW IF NOT EXISTS price_history_hourly
        WITH (timescaledb.continuous) AS
        SELECT
          time_bucket('1 hour', timestamp) AS bucket,
          market_id,
          outcome_id,
          platform,
          AVG(mid_price) AS avg_price,
          MIN(best_bid) AS min_bid,
          MAX(best_ask) AS max_ask,
          SUM(volume) AS total_volume
        FROM price_history
        GROUP BY bucket, market_id, outcome_id, platform;
      `;
      log.info('✓ Created hourly continuous aggregate');
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        log.info('✓ Hourly continuous aggregate already exists');
      } else {
        log.warn('Failed to create hourly aggregate', { error });
      }
    }

    // Set up retention policy (keep 90 days of raw data)
    log.info('Setting up retention policies...');
    try {
      await client`
        SELECT add_retention_policy('price_history', INTERVAL '90 days', if_not_exists => TRUE);
      `;
      log.info('✓ Retention policy set (90 days)');
    } catch (error) {
      log.warn('Failed to set retention policy', { error });
    }

    log.info('TimescaleDB setup completed successfully');
  } catch (error) {
    log.error('TimescaleDB setup failed', { error });
    throw error;
  } finally {
    await client.end();
  }
}

// Run setup
setupTimescaleDB()
  .then(() => {
    log.info('Setup complete');
    process.exit(0);
  })
  .catch((error) => {
    log.error('Setup failed', { error });
    process.exit(1);
  });
