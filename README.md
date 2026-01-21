# Prediction Market Trading Bot

Prediction market trading bot for Polymarket (required) with optional Kalshi support for cross-platform arbitrage.

## Features

- **Polymarket Trading**: Full support for Polymarket prediction markets (required)
- **Cross-Platform Arbitrage**: Optional - detect and execute arbitrage between Polymarket and Kalshi (requires Kalshi credentials)
- **Spread Hunter Strategy**: Targets illiquid markets with wide spreads (>2%) where bots are less active
- **Paper Trading**: Full simulation mode before live trading
- **Market Matching**: LLM-based semantic matching using Claude API (for cross-platform)
- **Risk Management**: Kill switch, position limits, drawdown monitoring
- **Real-time Data**: WebSocket connections for live orderbook updates
- **Prometheus Metrics**: Full monitoring and observability

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL database (Neon recommended, or local)
- Polymarket wallet (Ethereum private key) - **Required**
- Kalshi API keys - **Optional** (only needed for cross-platform arbitrage)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Edit .env with your credentials
# See Kalshi setup instructions below
```

### Kalshi API Setup (Optional)

**Note:** Kalshi is optional. The bot runs perfectly fine with just Polymarket. Only set up Kalshi if you want cross-platform arbitrage.

See [KALSHI_SETUP.md](./KALSHI_SETUP.md) for detailed instructions.

### Database Setup

```bash
# Push schema to database
pnpm db:push

# Or generate and run migrations
pnpm db:generate
pnpm db:migrate
```

### Running

```bash
# Development mode
pnpm dev

# Production build
pnpm build
pnpm start

# Run tests
pnpm test              # All tests
pnpm test:unit         # Unit tests only
pnpm test:integration  # Integration tests
pnpm test:websocket    # WebSocket tests
pnpm test:e2e          # E2E tests (requires credentials)
```

## Configuration

See `.env.example` for all configuration options.

### Key Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `PAPER_TRADING` | Enable paper trading mode | `true` |
| `MAX_POSITION_SIZE_USD` | Max position per market | `10000` |
| `MAX_DAILY_LOSS_USD` | Daily loss limit (triggers kill switch) | `1000` |
| `MIN_ARBITRAGE_SPREAD_BPS` | Minimum spread to execute | `5` |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | System health check |
| `GET /api/markets` | List markets from both platforms |
| `GET /api/positions` | Current positions |
| `GET /api/balances` | Account balances |
| `GET /metrics` | Prometheus metrics (port 9090) |

## Project Structure

```
src/
Ôö£ÔöÇÔöÇ clients/           # Platform API clients
Ôöé   Ôö£ÔöÇÔöÇ polymarket/   # Polymarket CLOB client
Ôöé   Ôö£ÔöÇÔöÇ kalshi/       # Kalshi REST client
Ôöé   ÔööÔöÇÔöÇ shared/       # Shared interfaces
Ôö£ÔöÇÔöÇ config/           # Configuration and constants
Ôö£ÔöÇÔöÇ database/         # Drizzle ORM schema
Ôö£ÔöÇÔöÇ services/         # Business logic services
Ôö£ÔöÇÔöÇ strategies/       # Trading strategies
Ôö£ÔöÇÔöÇ risk/             # Risk management
Ôö£ÔöÇÔöÇ api/              # REST API
ÔööÔöÇÔöÇ utils/            # Utilities (logger, metrics, retry)
```

## Development Status

- [x] Project setup and configuration
- [x] Polymarket client (L1/L2 auth, CLOB API, WebSocket)
- [x] Kalshi client (RSA-PSS auth, REST API, WebSocket)
- [x] Database schema (all tables + TimescaleDB ready)
- [x] Paper trading engine (full simulation)
- [x] Market matcher (LLM-based with Claude API)
- [x] Arbitrage detection (cross-platform + single-platform)
- [x] Arbitrage execution (with partial fill handling)
- [x] WebSocket clients (real-time orderbook updates)
- [x] Risk management (kill switch, position limits, drawdown monitoring)
- [x] Trading strategies (arbitrage, market making, signal-based)
- [x] Analytics (P&L calculation, performance metrics)
- [x] API endpoints (health, markets, positions, trades, strategies)
- [x] Prometheus metrics
- [x] Deployment configuration (Railway, Neon, Docker)
- [x] WebSocket connection tests (with mock servers)
- [x] End-to-end integration tests (with real API connections)

**Overall Completion: ~95%** - See [COMPLETION_REPORT.md](./COMPLETION_REPORT.md) for details.

## Deployment

### Railway + Neon

This project is configured for deployment on Railway (application) and Neon (database).

**Quick Start:**
1. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions
2. Set up Neon database and get connection string
3. Deploy to Railway from GitHub
4. Configure environment variables in Railway dashboard
5. Run database migrations

**Key Files:**
- `railway.json` - Railway configuration
- `nixpacks.toml` - Build configuration
- `Dockerfile` - Alternative Docker deployment
- `Procfile` - Process definition
- `src/database/migrations/` - Database migration files

**Important Notes:**
- Ô£à Neon includes TimescaleDB support (enable in Neon Console)
- ÔÜá´©Å Railway free tier may sleep - use Pro plan for 24/7 uptime
- Ô£à Always start with `PAPER_TRADING=true`
- Ô£à Never commit `.env` files or API keys
- Ô£à Use pooled connection string from Neon for better performance

## License

MIT
