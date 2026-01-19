# Neon Database Setup Guide

Quick reference for setting up Neon database for this project.

## Step 1: Create Neon Project

1. Go to [neon.tech](https://neon.tech)
2. Sign up or log in (GitHub OAuth available)
3. Click **"Create Project"**
4. Fill in:
   - **Name**: `prediction-trading` (or your choice)
   - **Region**: Choose closest to your Railway deployment
   - **PostgreSQL Version**: 15 or 16 (recommended)
   - **Compute Size**: Free tier is fine to start

## Step 2: Get Connection String

1. In your project dashboard, go to **Connection Details**
2. You'll see multiple connection strings:
   - **Pooled connection** (recommended for serverless): Uses connection pooling
   - **Direct connection**: Direct connection to database
3. Copy the connection string (looks like: `postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require`)

**Important**: Neon connection strings include the database name in the path (usually `neondb` or your project name).

Example:
```
postgresql://user:password@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

## Step 3: Set Up Schema

### Option A: Using Drizzle Push (Recommended)

```bash
# Set your DATABASE_URL
export DATABASE_URL="postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require"

# Push schema (creates tables automatically)
pnpm db:push
```

### Option B: Using Migrations

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require"

# Run migrations
pnpm db:migrate
```

### Option C: Using Setup Script

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require"

# Run setup
pnpm db:setup
```

## Step 4: Set Up TimescaleDB (Optional)

Neon supports TimescaleDB extension! This is great for time-series data.

1. Go to **Neon Console** → Your project → **Extensions**
2. Search for **"timescaledb"**
3. Click **"Enable"**
4. After enabling, run the TimescaleDB setup:

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require"

# Set up TimescaleDB hypertables
pnpm db:setup-timescale
```

This will convert the `price_history` table to a hypertable for better time-series performance.

## Step 5: Verify Tables

1. Go to **Neon Console** → Your project → **SQL Editor**
2. Run:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

You should see tables:
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

## Step 6: Configure Connection Pooling

Neon provides automatic connection pooling. For Railway deployment:

1. Use the **Pooled connection** string (includes `?pgbouncer=true` or similar)
2. Or use direct connection with `DATABASE_POOL_SIZE=10` in Railway
3. Neon handles connection pooling automatically

**Pooled Connection String Format:**
```
postgresql://user:password@ep-xxx-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

## Step 7: Security Settings

1. Go to **Neon Console** → **Settings** → **Security**
2. **IP Allowlist**: Allow all IPs (or add Railway IPs if known)
3. **SSL Mode**: `require` (default, already in connection string)
4. **Password**: Strong password (auto-generated, save it!)

## Step 8: Test Connection

```bash
# Test from local machine
export DATABASE_URL="postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require"
pnpm db:studio
```

If Drizzle Studio opens, connection is working!

## Troubleshooting

### Connection Refused
- Check firewall settings in Neon (should allow all IPs by default)
- Verify password is correct
- Ensure URL is properly formatted
- Check if using pooled vs direct connection string

### Authentication Failed
- Verify password (no special characters issues)
- Check if IP is allowed
- Try pooled connection URL
- Ensure database name is correct in connection string

### SSL Errors
- Connection string should include `?sslmode=require`
- Neon requires SSL by default
- If missing, add `?sslmode=require` to connection string

### TimescaleDB Errors
- Ensure TimescaleDB extension is enabled in Neon Console
- Run `pnpm db:setup-timescale` after enabling extension
- Check Neon logs for extension errors

## Free Tier Limits

- **Database Size**: 0.5 GB (512 MB)
- **Compute**: 0.5 vCPU, 1 GB RAM
- **Project Limit**: 1 project
- **Branching**: Unlimited branches
- **Backups**: 7-day point-in-time recovery
- **Connections**: Unlimited (with pooling)

## Upgrading to Pro

If you need more:
- **Database Size**: 10 GB (scales up)
- **Compute**: 1-8 vCPU, 2-16 GB RAM
- **Projects**: Unlimited
- **Backups**: 30-day point-in-time recovery
- **Support**: Priority support

Cost: Starts at $19/month

## Neon Advantages

✅ **TimescaleDB Support**: Built-in support for time-series data  
✅ **Serverless**: Auto-scales and pauses when not in use (free tier)  
✅ **Branching**: Create database branches for testing  
✅ **Point-in-Time Recovery**: Restore to any point in time  
✅ **Connection Pooling**: Automatic connection management  
✅ **Fast**: Low latency, global regions  
✅ **Free Tier**: Generous free tier for development  

## Next Steps

1. ✅ Database created
2. ✅ Schema deployed
3. ✅ Connection string saved
4. → Add to Railway environment variables
5. → Deploy application
6. → Test connection from Railway

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment guide.
