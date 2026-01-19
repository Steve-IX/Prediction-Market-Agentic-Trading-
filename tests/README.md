# Testing Guide

This document describes the testing setup and how to run different types of tests.

## Test Structure

```
tests/
├── fixtures/          # Test data and fixtures
├── integration/       # Integration tests
│   ├── websocket.test.ts    # WebSocket connection tests
│   ├── e2e.test.ts          # End-to-end tests with real APIs
│   ├── orderManager.test.ts # Order manager integration tests
│   └── risk.test.ts         # Risk management integration tests
├── mocks/             # Mock implementations
│   ├── websocketServer.ts   # Mock WebSocket server
│   ├── kalshi.ts            # Kalshi API mocks
│   └── polymarket.ts        # Polymarket API mocks
└── unit/              # Unit tests
    ├── arbitrage.test.ts
    ├── math.test.ts
    ├── risk.test.ts
    └── utils.test.ts
```

## Running Tests

### All Tests
```bash
pnpm test
```

### Unit Tests Only
```bash
pnpm test:unit
```

### Integration Tests
```bash
pnpm test:integration
```

### WebSocket Tests
```bash
pnpm test:websocket
```

### End-to-End Tests (requires credentials)
```bash
pnpm test:e2e
```

### With Coverage
```bash
pnpm test:coverage
```

## Test Types

### Unit Tests
Fast, isolated tests that don't require external dependencies:
- Math utilities
- Risk calculations
- Arbitrage detection logic
- Utility functions

### Integration Tests
Tests that verify components work together:
- Order manager with risk checks
- Risk management integration
- WebSocket connections (with mock servers)

### End-to-End Tests
Tests that connect to real APIs (require valid credentials):
- Real API connections
- Market data fetching
- Order placement (in paper trading mode)
- Cross-platform comparisons

## WebSocket Tests

WebSocket tests use a mock WebSocket server (`MockWebSocketServer`) that simulates platform-specific behavior:

- **Polymarket**: Simulates orderbook subscriptions and updates
- **Kalshi**: Simulates authenticated connections and orderbook deltas

These tests verify:
- Connection establishment
- Subscription handling
- Message parsing
- Reconnection logic
- Error handling

### Running WebSocket Tests
```bash
pnpm test:websocket
```

## End-to-End Tests

End-to-end tests connect to real Polymarket and Kalshi APIs. They are **skipped by default** to avoid:
- Rate limiting
- API costs
- Network dependencies

### Running E2E Tests

1. **Set up credentials** in `.env`:
   ```env
   POLYMARKET_PRIVATE_KEY=0x...
   KALSHI_API_KEY_ID=...
   KALSHI_PRIVATE_KEY_PEM=...
   ```

2. **Enable E2E tests**:
   ```bash
   E2E_TEST=true pnpm test:e2e
   ```

   Or set in `.env`:
   ```env
   E2E_TEST=true
   ```

### What E2E Tests Cover

- **API Connections**: Verify authentication and connection
- **Market Data**: Fetch markets and orderbooks
- **Account Info**: Get balances and positions
- **Rate Limiting**: Verify rate limit handling
- **Error Handling**: Network errors, timeouts, invalid requests
- **Cross-Platform**: Compare data from both platforms

### Important Notes

⚠️ **E2E tests make real API calls:**
- Use paper trading mode (`PAPER_TRADING=true`)
- May be rate limited
- Require valid credentials
- May incur API costs (if any)
- Depend on network connectivity

## Mock WebSocket Server

The `MockWebSocketServer` utility provides:
- Real WebSocket server using `ws` library
- Platform-specific message simulation
- Client connection management
- Message broadcasting

### Usage Example

```typescript
import { MockWebSocketServer } from '../mocks/websocketServer.js';

const server = new MockWebSocketServer();
const url = await server.start();
server.simulatePolymarket(); // or simulateKalshi()

// Use url in your tests
const ws = new PolymarketWebSocket({ wsHost: url });

await server.stop();
```

## Test Configuration

Tests use `vitest.config.ts` for configuration:
- Test environment: Node.js
- Setup file: `tests/setup.ts`
- Coverage provider: v8
- Globals enabled for `describe`, `it`, `expect`, etc.

## Writing New Tests

### Unit Test Example
```typescript
import { describe, it, expect } from 'vitest';
import { calculateSpread } from '../../src/utils/math.js';

describe('Math Utils', () => {
  it('should calculate spread correctly', () => {
    const spread = calculateSpread(0.51, 0.49);
    expect(spread).toBe(0.02);
  });
});
```

### Integration Test Example
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { OrderManager } from '../../src/services/orderManager/OrderManager.js';

describe('Order Manager', () => {
  let orderManager: OrderManager;

  beforeEach(() => {
    orderManager = new OrderManager();
  });

  it('should place orders', async () => {
    // Test implementation
  });
});
```

## Continuous Integration

Tests should pass in CI/CD pipelines:
- Unit tests: Always run
- Integration tests: Run with mock servers
- E2E tests: Optional, run manually or in scheduled jobs

## Troubleshooting

### Tests Fail with "Cannot find module"
- Run `pnpm build` first to compile TypeScript
- Check that imports use `.js` extensions

### WebSocket Tests Timeout
- Check that mock servers start correctly
- Verify port availability
- Increase timeout if needed

### E2E Tests Fail
- Verify credentials are set correctly
- Check network connectivity
- Ensure APIs are accessible
- Check rate limits

### Coverage Not Generated
- Run `pnpm test:coverage`
- Check `coverage/` directory
- Verify coverage thresholds in `vitest.config.ts`

## Best Practices

1. **Keep tests fast**: Unit tests should be < 100ms each
2. **Isolate tests**: Each test should be independent
3. **Use mocks**: Mock external dependencies
4. **Test edge cases**: Include error scenarios
5. **Document complex tests**: Add comments for non-obvious logic
6. **Clean up**: Use `afterEach`/`afterAll` for cleanup
7. **Skip flaky tests**: Use `.skip` for tests that depend on external factors
