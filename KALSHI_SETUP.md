# Kalshi Credentials Setup Guide (Optional)

**Note:** Kalshi is **optional**. The bot runs perfectly fine with just Polymarket. This guide is only needed if you want to enable cross-platform arbitrage between Polymarket and Kalshi.

This guide will help you set up Kalshi API credentials to enable cross-platform arbitrage trading.

## Overview

Kalshi uses RSA-PSS authentication for API requests. You'll need:
1. **API Key ID** - Your Kalshi API key identifier
2. **Private Key** - RSA private key in PEM format for signing requests

## Step 1: Create a Kalshi Account

1. Go to [Kalshi.com](https://kalshi.com) and create an account
2. Complete identity verification (required for trading)
3. Fund your account if you plan to trade live

## Step 2: Generate API Credentials

### Option A: Generate via Kalshi Dashboard (Recommended)

1. Log in to your Kalshi account
2. Navigate to **Settings** → **API Keys**
3. Click **Generate New API Key**
4. Download or copy:
   - **API Key ID** (e.g., `KALSHI-XXXX-XXXX`)
   - **Private Key** (PEM format - starts with `-----BEGIN PRIVATE KEY-----`)

### Option B: Generate RSA Key Pair Manually

If Kalshi doesn't provide a key pair, you can generate one:

```bash
# Generate RSA private key (2048-bit)
openssl genrsa -out kalshi_private_key.pem 2048

# Extract public key (Kalshi may need this)
openssl rsa -in kalshi_private_key.pem -pubout -out kalshi_public_key.pem
```

Then upload the public key to Kalshi's API settings.

## Step 3: Configure Environment Variables

Add these to your Railway environment variables (or `.env` file for local development):

```bash
# Kalshi API Configuration
KALSHI_API_KEY_ID=your-api-key-id-here
KALSHI_ENVIRONMENT=prod  # or 'demo' for paper trading

# Option 1: Private key as file path (for local development)
KALSHI_PRIVATE_KEY_PATH=/path/to/kalshi_private_key.pem

# Option 2: Private key as PEM string (for Railway/cloud deployment)
KALSHI_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----"
```

### For Railway Deployment

**Recommended:** Use `KALSHI_PRIVATE_KEY_PEM` with the full PEM string (including newlines).

1. Copy your private key (entire content including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
2. In Railway, add environment variable:
   - **Name:** `KALSHI_PRIVATE_KEY_PEM`
   - **Value:** Paste the entire private key (keep newlines)

### For Local Development

**Recommended:** Use `KALSHI_PRIVATE_KEY_PATH` pointing to a file.

1. Save your private key to a file (e.g., `kalshi_private_key.pem`)
2. Add to `.env`:
   ```
   KALSHI_PRIVATE_KEY_PATH=./kalshi_private_key.pem
   ```
3. **Important:** Add `kalshi_private_key.pem` to `.gitignore` to avoid committing secrets!

## Step 4: Verify Configuration

After setting up credentials, restart the bot and check logs:

```bash
# Check if Kalshi client connected
# Look for: "Connected to Kalshi" in logs
```

You can also test via API:

```bash
# Check balances (should show Kalshi balance if connected)
curl http://localhost:3000/api/balances

# Check health (should show Kalshi as connected)
curl http://localhost:3000/api/health
```

## Step 5: Enable Cross-Platform Arbitrage

Once Kalshi credentials are configured, cross-platform arbitrage is automatically enabled:

```bash
# Ensure cross-platform arbitrage is enabled
ENABLE_CROSS_PLATFORM_ARB=true
```

The bot will now:
1. Match markets between Polymarket and Kalshi
2. Detect price differences (arbitrage opportunities)
3. Execute trades when spread exceeds thresholds

## Troubleshooting

### Error: "KALSHI_API_KEY_ID is required"
- **Solution:** Set `KALSHI_API_KEY_ID` environment variable

### Error: "Private key is required"
- **Solution:** Set either `KALSHI_PRIVATE_KEY_PATH` or `KALSHI_PRIVATE_KEY_PEM`

### Error: "Invalid signature" or "Authentication failed"
- **Solution:** 
  - Verify your API Key ID is correct
  - Ensure private key is in PEM format
  - Check that private key matches the public key registered with Kalshi
  - For Railway: Ensure `KALSHI_PRIVATE_KEY_PEM` includes all newlines

### Error: "Connection refused" or "Network error"
- **Solution:**
  - Check `KALSHI_ENVIRONMENT` is set correctly (`prod` or `demo`)
  - Verify Kalshi API is accessible from your deployment location
  - Check firewall/network settings

### Balance shows 0 despite having funds
- **Solution:**
  - Verify account is funded
  - Check you're using the correct environment (`prod` vs `demo`)
  - Ensure API key has balance read permissions

## Security Best Practices

1. **Never commit private keys to git**
   - Add `*.pem` to `.gitignore`
   - Use environment variables or secret management

2. **Use separate keys for demo/prod**
   - Generate different API keys for testing vs live trading

3. **Rotate keys periodically**
   - Generate new keys every 90 days
   - Revoke old keys in Kalshi dashboard

4. **Limit API key permissions**
   - Only grant necessary permissions (read balance, place orders)
   - Don't grant withdrawal permissions unless needed

## Testing with Demo Environment

Kalshi provides a demo environment for testing:

```bash
KALSHI_ENVIRONMENT=demo
KALSHI_API_KEY_ID=your-demo-api-key-id
KALSHI_PRIVATE_KEY_PEM="your-demo-private-key"
```

Use demo environment to:
- Test API connectivity
- Verify authentication
- Test order placement (without real money)

## Additional Resources

- [Kalshi API Documentation](https://trading-api.kalshi.com/trade-api/)
- [Kalshi Developer Portal](https://kalshi.com/developers)
- [RSA Key Generation Guide](https://www.openssl.org/docs/man1.1.1/man1/genrsa.html)

## Support

If you encounter issues:
1. Check Kalshi API status page
2. Review bot logs for detailed error messages
3. Verify credentials in Kalshi dashboard
4. Test with demo environment first
