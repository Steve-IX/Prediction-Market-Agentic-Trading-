# Quick Deployment Guide (Polymarket Only)

## Your Credentials Summary

You provided:
- **Wallet Address**: `0x8569d26c60f6ed0454683ba405730aab18ff540e`
- **L2 API Credentials**: (apiKey, secret, passphrase)

**⚠️ IMPORTANT**: The app needs your **Ethereum private key** (not the L2 API credentials). The app will automatically derive API credentials from your private key.

## Railway Environment Variables (Copy-Paste Ready)

```bash
# ============================================
# Database (Neon) - REPLACE WITH YOUR VALUES
# ============================================
DATABASE_URL=postgresql://[USER]:[PASSWORD]@ep-[PROJECT-REF]-pooler.[REGION].aws.neon.tech/[DATABASE]?sslmode=require
DATABASE_POOL_SIZE=10

# ============================================
# Polymarket - REPLACE WITH YOUR PRIVATE KEY
# ============================================
POLYMARKET_PRIVATE_KEY=0x[YOUR-ETHEREUM-PRIVATE-KEY-FOR-0x8569d26c60f6ed0454683ba405730aab18ff540e]
POLYMARKET_CHAIN_ID=137

# ============================================
# Trading (START WITH PAPER TRADING!)
# ============================================
PAPER_TRADING=true
PAPER_TRADING_BALANCE=10000

# ============================================
# API
# ============================================
API_PORT=3000
METRICS_PORT=9090
NODE_ENV=production
LOG_LEVEL=info

# ============================================
# Features (Polymarket-Only Setup)
# ============================================
ENABLE_CROSS_PLATFORM_ARB=false
ENABLE_SINGLE_PLATFORM_ARB=true
ENABLE_MARKET_MAKING=false
ENABLE_WEBSOCKET=true

# ============================================
# Risk Management
# ============================================
MAX_POSITION_SIZE_USD=10000
MAX_TOTAL_EXPOSURE_USD=50000
MAX_DAILY_LOSS_USD=1000
MAX_DRAWDOWN_PERCENT=10
MIN_ARBITRAGE_SPREAD_BPS=5
```

## Quick Steps

1. **Get your Ethereum private key** for address `0x8569d26c60f6ed0454683ba405730aab18ff540e`
2. **Create Neon database** and get connection string
3. **Deploy to Railway** from GitHub
4. **Add environment variables** above
5. **Run migrations**: `pnpm db:migrate` (via Railway shell or locally)
6. **Verify**: Check `/health` endpoint

## Can I Run Without Kalshi?

**YES!** ✅ The app works perfectly with only Polymarket:
- Kalshi credentials are optional
- App will skip Kalshi connection if credentials are missing
- Single-platform arbitrage will work on Polymarket
- Cross-platform arbitrage will be disabled (as configured above)

## Need Help?

See `DEPLOYMENT_CHECKLIST.md` for detailed instructions.
