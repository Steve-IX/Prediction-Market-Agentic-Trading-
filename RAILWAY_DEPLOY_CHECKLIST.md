# Railway Deployment Checklist

## ✅ Pre-Deployment Verification

- [x] Git repository is clean (no uncommitted changes)
- [x] Application builds successfully (`pnpm build`)
- [x] Database migrations completed
- [x] TimescaleDB hypertable configured
- [x] No secrets in code (verified)
- [x] Railway configuration files present

## 🚀 Railway Deployment Steps

### 1. Connect Repository to Railway

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account
5. Select repository: `Steve-IX/Prediction-Market-Agentic-Trading-`

### 2. Configure Build Settings

Railway should auto-detect, but verify:

- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `pnpm start`
- **Node Version**: 20+ (should auto-detect)

### 3. Add Environment Variables

Go to Railway → Your Service → **Variables** tab and add:

#### Required Variables:

```bash
# Database (Neon)
DATABASE_URL=postgresql://neondb_owner:npg_C52InUqVdXrj@ep-summer-glade-ab646ol0-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require
DATABASE_POOL_SIZE=10

# Polymarket
POLYMARKET_PRIVATE_KEY=0x1f98f2c5b715aab4c11d178b10352193f0cf6437f385600d0a43a07f12b1289d
POLYMARKET_CHAIN_ID=137

# Trading (IMPORTANT - Start with paper trading!)
PAPER_TRADING=true
PAPER_TRADING_BALANCE=10000

# API Configuration
API_PORT=3000
METRICS_PORT=9090
NODE_ENV=production
LOG_LEVEL=info

# Features (Polymarket-Only Setup)
ENABLE_CROSS_PLATFORM_ARB=false
ENABLE_SINGLE_PLATFORM_ARB=true
ENABLE_MARKET_MAKING=false
ENABLE_WEBSOCKET=true
```

#### Optional Variables (with defaults):

```bash
# Risk Management
MAX_POSITION_SIZE_USD=10000
MAX_TOTAL_EXPOSURE_USD=50000
MAX_DAILY_LOSS_USD=1000
MAX_DRAWDOWN_PERCENT=10
MIN_ARBITRAGE_SPREAD_BPS=5

# Trading Settings
EXECUTION_TIMEOUT_MS=5000
ORDER_RETRY_ATTEMPTS=3
ORDER_RETRY_DELAY_MS=1000

# Anthropic (Optional - for market matching)
# ANTHROPIC_API_KEY=sk-[YOUR-KEY]
```

### 4. Configure Ports

1. Go to Railway → Your Service → **Settings** → **Networking**
2. Add ports:
   - **Port 3000**: HTTP (for API)
   - **Port 9090**: HTTP (for metrics)

### 5. Deploy

1. Railway will automatically deploy when you push to `main` branch
2. Or click "Deploy" button in Railway dashboard
3. Watch the deployment logs for any errors

### 6. Verify Deployment

After deployment completes:

- [ ] Check health endpoint: `https://your-app.up.railway.app/health`
- [ ] Check metrics: `https://your-app.up.railway.app/metrics`
- [ ] Check API: `https://your-app.up.railway.app/api/markets`
- [ ] Check Railway logs for "Polymarket client connected"
- [ ] Check Railway logs for "Database initialized"

## 🔍 Troubleshooting

### Build Fails

- Check Railway build logs
- Verify Node.js version (should be 20+)
- Ensure `pnpm-lock.yaml` is committed

### Application Won't Start

- Check Railway logs
- Verify all environment variables are set
- Check that ports 3000 and 9090 are exposed
- Verify database connection string is correct

### Database Connection Issues

- Verify `DATABASE_URL` is correct (use pooled connection)
- Check Neon dashboard for connection logs
- Ensure database is not paused (free tier)

### Polymarket Connection Issues

- Verify `POLYMARKET_PRIVATE_KEY` is correct (starts with `0x`)
- Check Railway logs for authentication errors
- Verify `POLYMARKET_CHAIN_ID=137` (Polygon mainnet)

## 📊 Monitoring

After successful deployment:

1. **Health Check**: Monitor `/health` endpoint
2. **Metrics**: Check `/metrics` for Prometheus metrics
3. **Logs**: Watch Railway logs for errors
4. **Database**: Monitor Neon dashboard for connections

## 🎯 Post-Deployment

- [ ] Verify application is running
- [ ] Test API endpoints
- [ ] Monitor logs for 24 hours
- [ ] Test paper trading mode
- [ ] Only then consider live trading (if desired)

---

**Ready to deploy!** 🚀
