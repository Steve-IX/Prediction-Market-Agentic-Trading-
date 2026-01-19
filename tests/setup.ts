/**
 * Test setup and configuration
 */

import * as dotenv from 'dotenv';
import { beforeAll, afterAll } from 'vitest';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env['NODE_ENV'] = 'development'; // Use development for config validation
process.env['PAPER_TRADING'] = 'true';

beforeAll(() => {
  // Setup test database if needed
  // TODO: Initialize test database
});

afterAll(() => {
  // Cleanup test database if needed
  // TODO: Cleanup test database
});
