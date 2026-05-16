import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';
  if (!process.env['DATABASE_URL']) {
    process.env['DATABASE_URL'] = 'postgresql://localhost:5432/prediction_trading_test';
  }
});

afterAll(() => {
  // Test DB cleanup: run against a dedicated test database when DATABASE_URL points to it
});
