# Deployment Guide: Railway + Supabase

This guide walks you through deploying the Prediction Market Trading Bot to Railway (application) and Supabase (database).

## Prerequisites

- GitHub account (for Railway deployment)
- Supabase account (free tier available)
- Railway account (free tier available, but consider Pro for 24/7 uptime)
- Your API keys (Polymarket private key, Kalshi API keys)

## Step 1: Set Up Supabase Database

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in:
   - **Name**: `prediction-trading` (or your choice)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your Railway deployment
   - **Pricing Plan**: Free tier is fine to start

### 1.2 Get Database Connection String

1. In your Supabase project, go to **Settings** → **Database**
2. Find **Connection string** section
3. Copy the **URI** connection string (looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres`)
4. Replace `[YOUR-PASSWORD]` with your actual database password

### 1.3 Run Database Setup

**Option A: Using Supabase SQL Editor**

1. Go to **SQL Editor** in Supabase dashboard
2. Run the migrations from `src/database/migrations/` (if you have them)
3. Or use Drizzle Kit to push schema:

```bash
# Set your DATABASE_URL
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres"

# Push schema
pnpm db:push
```

**Option B: Using Setup Script**

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres"

# Run setup script
pnpm db:setup
```

### 1.4 TimescaleDB Note

⚠️ **Important**: Supabase doesn't include TimescaleDB by default. You have two options:

1. **Skip TimescaleDB** (recommended for start):
   - The app will work fine with regular PostgreSQL
   - You can add TimescaleDB later if needed
   - Comment out TimescaleDB-specific code if it causes errors

2. **Use Neon instead** (if you need TimescaleDB):
   - Neon has TimescaleDB support
   - Follow similar setup but use Neon connection string

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
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
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
pnpm db:setup
```

### 4.2 Verify Database Connection

Check logs in Railway to ensure database connection is successful.

### 4.3 Test Paper Trading

1. Ensure `PAPER_TRADING=true` in environment variables
2. Start trading engine via API: `POST /api/trading/start`
3. Monitor logs and metrics

## Step 5: Monitoring & Maintenance

### 5.1 View Logs

- Railway dashboard → Your service → **Deployments** → Click deployment → **View Logs**

### 5.2 Monitor Metrics

- Access Prometheus metrics: `https://your-app.up.railway.app/metrics`
- Set up Grafana or similar for visualization (optional)

### 5.3 Set Up Alerts

1. Railway Pro plan includes alerts
2. Or use external monitoring (UptimeRobot, etc.)
3. Monitor health endpoint

### 5.4 Database Backups

- Supabase automatically backs up your database
- Free tier: Daily backups
- Pro tier: Point-in-time recovery

## Troubleshooting

### Database Connection Issues

- Verify `DATABASE_URL` is correct
- Check Supabase firewall settings (should allow all IPs by default)
- Ensure password is URL-encoded if it contains special characters

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

1. Comment out TimescaleDB setup in `scripts/setup-timescaledb.ts`
2. Or switch to Neon database (has TimescaleDB support)

## Cost Estimates

### Free Tier (Development/Testing)
- **Railway**: $5/month (Pro plan needed for 24/7, free tier sleeps)
- **Supabase**: Free (500MB database, 2GB bandwidth)

### Production (Recommended)
- **Railway Pro**: $20/month (always-on, better performance)
- **Supabase Pro**: $25/month (8GB database, better performance)

**Total**: ~$45/month for production setup

## Security Best Practices

1. ✅ Never commit `.env` files
2. ✅ Use Railway secrets for sensitive data
3. ✅ Rotate API keys regularly
4. ✅ Enable Supabase Row Level Security (if storing sensitive data)
5. ✅ Use HTTPS (Railway provides automatically)
6. ✅ Monitor for unauthorized access
7. ✅ Start with `PAPER_TRADING=true` always

## Next Steps

1. ✅ Deploy to Railway
2. ✅ Set up Supabase database
3. ✅ Configure environment variables
4. ✅ Test with paper trading
5. ✅ Monitor logs and metrics
6. ✅ Gradually enable features
7. ⚠️ **Only enable live trading after thorough testing!**

## Support

- Railway Docs: https://docs.railway.app
- Supabase Docs: https://supabase.com/docs
- Project Issues: Check GitHub issues
