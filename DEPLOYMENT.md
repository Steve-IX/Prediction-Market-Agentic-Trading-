# Deployment Guide: Railway + Neon

This guide walks you through deploying the Prediction Market Trading Bot to Railway (application) and Neon (database).

## Prerequisites

- GitHub account (for Railway deployment)
- Neon account (free tier available)
- Railway account (free tier available, but consider Pro for 24/7 uptime)
- Your API keys (Polymarket private key, Kalshi API keys)

## Step 1: Set Up Neon Database

### 1.1 Create Neon Project

1. Go to [neon.tech](https://neon.tech) and sign up/login
2. Click "Create Project"
3. Fill in:
   - **Name**: `prediction-trading` (or your choice)
   - **Region**: Choose closest to your Railway deployment
   - **PostgreSQL Version**: 15 or 16 (recommended)
   - **Compute Size**: Free tier is fine to start

### 1.2 Get Database Connection String

1. In your Neon project dashboard, go to **Connection Details**
2. You'll see two connection strings:
   - **Pooled connection** (recommended): Better for serverless/server environments
   - **Direct connection**: Direct connection to database
3. Copy the **Pooled connection** string
4. It looks like: `postgresql://user:password@ep-xxx-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`

**Note**: Neon connection strings include the database name (usually `neondb` or your project name).

### 1.3 Run Database Setup

**Option A: Using Drizzle Push (Recommended)**

```bash
# Set your DATABASE_URL
export DATABASE_URL="postgresql://user:password@ep-xxx-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require"

# Push schema
pnpm db:push
```

**Option B: Using Migrations**

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:password@ep-xxx-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require"

# Run migrations
pnpm db:migrate
```

**Option C: Using Setup Script**

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:password@ep-xxx-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require"

# Run setup script
pnpm db:setup
```

### 1.4 Set Up TimescaleDB (Optional but Recommended)

Neon supports TimescaleDB extension! This is great for time-series price data.

1. In Neon Console, go to your project → **Extensions**
2. Search for **"timescaledb"**
3. Click **"Enable"**
4. After enabling, run:

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:password@ep-xxx-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require"

# Set up TimescaleDB hypertables
pnpm db:setup-timescale
```

This converts the `price_history` table to a hypertable for better performance.

## Step 2: Set Up Railway Application

### 2.1 Create Railway Project

1. Go to [railway.app](https://railway.app) and sign up/login
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account
5. Select the repository containing this code

### 2.2 Configure Build Settings

Railway should auto-detect Node.js. Verify:

1. Go to your service → **Settings** → **Build**
2. **Build Command**: `pnpm install && pnpm build`
3. **Start Command**: `pnpm start`
4. **Root Directory**: `/` (or leave empty)

### 2.3 Add Environment Variables

Go to **Variables** tab and add all required environment variables:

#### Database
```
DATABASE_URL=postgresql://user:password@ep-xxx-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
DATABASE_POOL_SIZE=10
```

#### Polymarket
```
POLYMARKET_PRIVATE_KEY=0x...
POLYMARKET_CHAIN_ID=137
```

#### Kalshi
```
KALSHI_API_KEY_ID=your-key-id
KALSHI_PRIVATE_KEY_PEM=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
KALSHI_ENVIRONMENT=demo
```

#### Risk Management
```
MAX_POSITION_SIZE_USD=10000
MAX_TOTAL_EXPOSURE_USD=50000
MAX_DAILY_LOSS_USD=1000
MAX_DRAWDOWN_PERCENT=10
MIN_ARBITRAGE_SPREAD_BPS=5
```

#### Trading
```
PAPER_TRADING=true
PAPER_TRADING_BALANCE=10000
```

#### API
```
API_PORT=3000
METRICS_PORT=9090
NODE_ENV=production
LOG_LEVEL=info
```

#### Features
```
ENABLE_CROSS_PLATFORM_ARB=true
ENABLE_SINGLE_PLATFORM_ARB=true
ENABLE_MARKET_MAKING=false
ENABLE_WEBSOCKET=true
```

#### Anthropic (optional, for market matching)
```
ANTHROPIC_API_KEY=sk-...
```

### 2.4 Configure Ports

1. Go to **Settings** → **Networking**
2. Add two ports:
   - **Port 3000**: HTTP (for API)
   - **Port 9090**: HTTP (for metrics)

### 2.5 Set Up Custom Domain (Optional)

1. Go to **Settings** → **Networking**
2. Click "Generate Domain" or add your custom domain
3. Railway will provide a URL like: `your-app.up.railway.app`

## Step 3: Deploy

### 3.1 Initial Deployment

1. Railway will automatically deploy when you push to your main branch
2. Or click "Deploy" in Railway dashboard
3. Watch the build logs for any errors

### 3.2 Verify Deployment

1. Check health endpoint: `https://your-app.up.railway.app/health`
2. Check metrics: `https://your-app.up.railway.app/metrics`
3. Check API: `https://your-app.up.railway.app/api/markets`

## Step 4: Post-Deployment Setup

### 4.1 Run Database Migrations

If you haven't already, run migrations:

```bash
# Connect to Railway shell or use local machine with DATABASE_URL set
pnpm db:migrate
```

Or use Railway's one-click shell:
1. Go to Railway dashboard → Your service
2. Click "Deployments" → Latest deployment → "Shell"
3. Run: `pnpm db:migrate`

### 4.2 Verify Database Connection

Check logs in Railway to ensure database connection is successful.

### 4.3 Test Paper Trading

1. Ensure `PAPER_TRADING=true` in environment variables
2. Start trading engine via API: `POST /api/trading/start`
3. Monitor logs and metrics

## Step 5: Monitoring & Maintenance

### 5.1 View Logs

- Railway dashboard → Your service → **Deployments** → Click deployment → **View Logs**
- Neon dashboard → Your project → **Logs** (for database logs)

### 5.2 Monitor Metrics

- Access Prometheus metrics: `https://your-app.up.railway.app/metrics`
- Set up Grafana or similar for visualization (optional)
- Neon provides built-in query analytics

### 5.3 Set Up Alerts

1. Railway Pro plan includes alerts
2. Or use external monitoring (UptimeRobot, etc.)
3. Monitor health endpoint
4. Set up Neon alerts for database issues

### 5.4 Database Backups

- Neon automatically backs up your database
- Free tier: 7-day point-in-time recovery
- Pro tier: 30-day point-in-time recovery
- Can restore to any point in time via Neon Console

## Troubleshooting

### Database Connection Issues

- Verify `DATABASE_URL` is correct (use pooled connection for Railway)
- Check Neon firewall settings (should allow all IPs by default)
- Ensure password is URL-encoded if it contains special characters
- Verify database name is correct in connection string
- Try direct connection string if pooled doesn't work

### Build Failures

- Check Railway build logs
- Ensure `pnpm-lock.yaml` is committed
- Verify Node.js version (20+) in `package.json`

### Application Crashes

- Check Railway logs
- Verify all required environment variables are set
- Check database connectivity
- Ensure ports 3000 and 9090 are exposed

### TimescaleDB Errors

If you see TimescaleDB errors:

1. Ensure TimescaleDB extension is enabled in Neon Console
2. Run `pnpm db:setup-timescale` after enabling
3. Check Neon logs for extension errors

## Cost Estimates

### Free Tier (Development/Testing)
- **Railway**: $5/month (Pro plan needed for 24/7, free tier sleeps)
- **Neon**: Free (0.5 GB database, auto-pauses when idle)

### Production (Recommended)
- **Railway Pro**: $20/month (always-on, better performance)
- **Neon Pro**: $19/month (10 GB database, always-on, better performance)

**Total**: ~$39/month for production setup

## Security Best Practices

1. ✅ Never commit `.env` files
2. ✅ Use Railway secrets for sensitive data
3. ✅ Rotate API keys regularly
4. ✅ Use Neon's IP allowlist if needed
5. ✅ Use HTTPS (Railway provides automatically)
6. ✅ Monitor for unauthorized access
7. ✅ Start with `PAPER_TRADING=true` always
8. ✅ Use pooled connections for better security

## Neon Advantages

✅ **TimescaleDB Support**: Built-in support for time-series data  
✅ **Serverless**: Auto-scales and pauses when not in use (free tier)  
✅ **Branching**: Create database branches for testing  
✅ **Point-in-Time Recovery**: Restore to any point in time  
✅ **Connection Pooling**: Automatic connection management  
✅ **Fast**: Low latency, global regions  
✅ **Free Tier**: Generous free tier for development  

## Next Steps

1. ✅ Deploy to Railway
2. ✅ Set up Neon database
3. ✅ Configure environment variables
4. ✅ Run database migrations
5. ✅ Test with paper trading
6. ✅ Monitor logs and metrics
7. ✅ Gradually enable features
8. ⚠️ **Only enable live trading after thorough testing!**

## Support

- Railway Docs: https://docs.railway.app
- Neon Docs: https://neon.tech/docs
- Project Issues: Check GitHub issues
