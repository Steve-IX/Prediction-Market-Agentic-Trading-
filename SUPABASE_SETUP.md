# Supabase Database Setup Guide

Quick reference for setting up Supabase database for this project.

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in
3. Click **"New Project"**
4. Fill in:
   - **Name**: `prediction-trading`
   - **Database Password**: Generate and **SAVE THIS** (you'll need it)
   - **Region**: Choose closest to your Railway deployment
   - **Pricing Plan**: Free tier is fine to start

## Step 2: Get Connection String

1. In your project, go to **Settings** → **Database**
2. Scroll to **Connection string** section
3. Select **URI** tab
4. Copy the connection string
5. Replace `[YOUR-PASSWORD]` with your actual password

Example:
```
postgresql://postgres:your-password-here@db.abcdefghijklmnop.supabase.co:5432/postgres
```

## Step 3: Set Up Schema

### Option A: Using Drizzle (Recommended)

```bash
# Set your DATABASE_URL
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres"

# Push schema
pnpm db:push
```

### Option B: Using Setup Script

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres"

# Run setup
pnpm db:setup
```

### Option C: Using Supabase SQL Editor

1. Go to **SQL Editor** in Supabase dashboard
2. If you have migration files, copy and paste them
3. Or use Drizzle Studio: `pnpm db:studio`

## Step 4: Verify Tables

1. Go to **Table Editor** in Supabase
2. You should see tables:
   - `markets`
   - `outcomes`
   - `market_pairs`
   - `price_history`
   - `orders`
   - `trades`
   - `positions`
   - `arbitrage_opportunities`
   - `daily_pnl`
   - `strategy_performance`
   - `account_snapshots`

## Step 5: TimescaleDB (Optional)

⚠️ **Supabase doesn't include TimescaleDB by default.**

**Options:**

1. **Skip TimescaleDB** (Recommended for start):
   - App works fine without it
   - Regular PostgreSQL is sufficient
   - Can add later if needed

2. **Use Neon instead**:
   - Neon has TimescaleDB support
   - Similar setup process
   - Better for time-series data

3. **Request Supabase extension** (if available):
   - Check Supabase extensions
   - May require Pro plan

## Step 6: Configure Connection Pooling

Supabase provides connection pooling. For Railway deployment:

1. Use the **Connection Pooling** connection string (if available)
2. Or use direct connection string
3. Set `DATABASE_POOL_SIZE=10` in Railway

## Step 7: Security Settings

1. Go to **Settings** → **Database**
2. **Connection Pooling**: Enable if available
3. **Network Restrictions**: Allow all IPs (or add Railway IPs)
4. **SSL Mode**: `require` (default)

## Step 8: Test Connection

```bash
# Test from local machine
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres"
pnpm db:studio
```

If Drizzle Studio opens, connection is working!

## Troubleshooting

### Connection Refused
- Check firewall settings in Supabase
- Verify password is correct
- Ensure URL is properly formatted

### Authentication Failed
- Verify password (no special characters issues)
- Check if IP is allowed
- Try connection pooling URL

### TimescaleDB Errors
- Comment out TimescaleDB setup code
- Or switch to Neon database
- Or use regular PostgreSQL (works fine)

### SSL Errors
- Add `?sslmode=require` to connection string
- Supabase requires SSL by default

## Free Tier Limits

- **Database Size**: 500 MB
- **Bandwidth**: 2 GB/month
- **Backups**: Daily (7 day retention)
- **Connections**: 60 direct, 200 pooled

## Upgrading to Pro

If you need more:
- **Database Size**: 8 GB
- **Bandwidth**: 50 GB/month
- **Backups**: Daily + Point-in-time recovery
- **Connections**: 120 direct, 400 pooled

Cost: $25/month

## Next Steps

1. ✅ Database created
2. ✅ Schema deployed
3. ✅ Connection string saved
4. → Add to Railway environment variables
5. → Deploy application
6. → Test connection from Railway

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment guide.
