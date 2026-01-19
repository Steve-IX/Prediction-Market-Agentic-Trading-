# API Endpoints - Quick Links

## 📊 Status & Monitoring

- **Health Check**: https://web-production-68225.up.railway.app/health
- **Trading Status**: https://web-production-68225.up.railway.app/api/trading/status
- **Balances**: https://web-production-68225.up.railway.app/api/balances

## 📈 Markets & Trading

- **All Markets** (1,669 markets): https://web-production-68225.up.railway.app/api/markets
- **Your Positions**: https://web-production-68225.up.railway.app/api/positions
- **Open Orders**: https://web-production-68225.up.railway.app/api/orders
- **Trade History**: https://web-production-68225.up.railway.app/api/trades

## 🎮 Controls

**Note**: These endpoints require POST requests. Use the PowerShell script (`test-bot.ps1`) or a tool like Postman/Insomnia.

- **Start Trading**: `POST https://web-production-68225.up.railway.app/api/trading/start`
- **Stop Trading**: `POST https://web-production-68225.up.railway.app/api/trading/stop`
- **Manual Scan**: `POST https://web-production-68225.up.railway.app/api/trading/scan`
- **Kill Switch**: `POST https://web-production-68225.up.railway.app/api/kill-switch`

## 📝 Example PowerShell Commands

```powershell
# View status
Invoke-WebRequest -Uri "https://web-production-68225.up.railway.app/api/trading/status" -UseBasicParsing | ConvertFrom-Json

# Start trading
Invoke-WebRequest -Method POST -Uri "https://web-production-68225.up.railway.app/api/trading/start" -UseBasicParsing | ConvertFrom-Json
```
