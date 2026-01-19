#!/usr/bin/env tsx
/**
 * Pre-deployment check script
 * Validates environment and configuration before deployment
 */

import * as dotenv from 'dotenv';
import { logger } from '../src/utils/logger.js';

dotenv.config();

const log = logger('DeployCheck');

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const checks: CheckResult[] = [];

/**
 * Check if environment variable is set
 */
function checkEnvVar(name: string, required: boolean = true): CheckResult {
  const value = process.env[name];
  const passed = required ? !!value : true;
  return {
    name: `Environment: ${name}`,
    passed,
    message: passed
      ? `✓ ${name} is set`
      : `✗ ${name} is missing${required ? ' (REQUIRED)' : ' (optional)'}`,
  };
}

/**
 * Check database URL format
 */
function checkDatabaseUrl(): CheckResult {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    return {
      name: 'Database URL',
      passed: false,
      message: '✗ DATABASE_URL is not set',
    };
  }

  if (!url.startsWith('postgresql://')) {
    return {
      name: 'Database URL',
      passed: false,
      message: '✗ DATABASE_URL must start with postgresql://',
    };
  }

  return {
    name: 'Database URL',
    passed: true,
    message: '✓ DATABASE_URL format is valid',
  };
}

/**
 * Check if paper trading is enabled (safety check)
 */
function checkPaperTrading(): CheckResult {
  const paperTrading = process.env['PAPER_TRADING'];
  const isPaper = paperTrading === 'true' || paperTrading === '1';

  return {
    name: 'Paper Trading Mode',
    passed: true,
    message: isPaper
      ? '✓ Paper trading is enabled (SAFE)'
      : '⚠ Paper trading is DISABLED - LIVE TRADING MODE',
  };
}

/**
 * Check Node.js version
 */
function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0] || '0', 10);

  if (major >= 20) {
    return {
      name: 'Node.js Version',
      passed: true,
      message: `✓ Node.js ${version} (>= 20 required)`,
    };
  }

  return {
    name: 'Node.js Version',
    passed: false,
    message: `✗ Node.js ${version} - Version 20+ required`,
  };
}

/**
 * Run all checks
 */
async function runChecks(): Promise<void> {
  log.info('Running pre-deployment checks...\n');

  // Environment checks
  checks.push(checkEnvVar('DATABASE_URL', true));
  checks.push(checkDatabaseUrl());
  checks.push(checkEnvVar('NODE_ENV', false));
  checks.push(checkNodeVersion());
  checks.push(checkPaperTrading());

  // Platform-specific checks
  checks.push(checkEnvVar('POLYMARKET_PRIVATE_KEY', false));
  checks.push(checkEnvVar('KALSHI_API_KEY_ID', false));
  checks.push(checkEnvVar('KALSHI_PRIVATE_KEY_PEM', false));

  // Risk management checks
  checks.push(checkEnvVar('MAX_POSITION_SIZE_USD', false));
  checks.push(checkEnvVar('MAX_DAILY_LOSS_USD', false));

  // Print results
  console.log('\n=== Deployment Checks ===\n');
  for (const check of checks) {
    console.log(check.message);
  }

  const failed = checks.filter((c) => !c.passed);
  const warnings = checks.filter((c) => c.message.includes('⚠'));

  console.log('\n=== Summary ===');
  console.log(`Total checks: ${checks.length}`);
  console.log(`Passed: ${checks.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Warnings: ${warnings.length}`);

  if (failed.length > 0) {
    console.log('\n✗ Some checks failed. Please fix before deploying.\n');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('\n⚠ Warnings detected. Review before deploying.\n');
  } else {
    console.log('\n✓ All checks passed! Ready to deploy.\n');
  }
}

// Run checks
runChecks().catch((error) => {
  log.error('Check failed', { error });
  process.exit(1);
});
