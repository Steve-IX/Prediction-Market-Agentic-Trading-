# Quick PowerShell Monitoring Commands

**Base URL:** `https://web-production-68225.up.railway.app`

Run any command directly in PowerShell (no script needed):

## Most Used Commands

### 1. Quick Status Check
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/trading/status" | ConvertTo-Json
```

### 2. Check Balance
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/balances" | ConvertTo-Json
```

### 3. See Recent Trades
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/trades?limit=10" | ConvertTo-Json
```

---

## All Commands

### Health Check
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/health" | ConvertTo-Json
```

### Trading Status (Opportunities, Executions, Profit)
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/trading/status" | ConvertTo-Json
```

### Paper Trading Balance
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/balances" | ConvertTo-Json
```

### Recent Trades (Last 10)
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/trades?limit=10" | ConvertTo-Json
```

### All Open Positions
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/positions" | ConvertTo-Json
```

### Open Orders
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/orders" | ConvertTo-Json
```

### Market Count (Quick)
```powershell
$url = "https://web-production-68225.up.railway.app"; (Invoke-RestMethod -Uri "$url/api/markets").count
```

---

## Control Commands

### Start Automated Trading
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Method POST -Uri "$url/api/trading/start" | ConvertTo-Json
```

### Stop Trading
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Method POST -Uri "$url/api/trading/stop" | ConvertTo-Json
```

### Manual Scan for Opportunities
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Method POST -Uri "$url/api/trading/scan" | ConvertTo-Json
```

### Emergency Kill Switch
```powershell
$url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Method POST -Uri "$url/api/kill-switch" | ConvertTo-Json
```

---

## Even Shorter - Set Variable Once

Set the URL variable once, then use short commands:

```powershell
$url = "https://web-production-68225.up.railway.app"
```

Then use:
```powershell
# Status
Invoke-RestMethod -Uri "$url/api/trading/status" | ConvertTo-Json

# Balance
Invoke-RestMethod -Uri "$url/api/balances" | ConvertTo-Json

# Trades
Invoke-RestMethod -Uri "$url/api/trades?limit=10" | ConvertTo-Json

# Start
Invoke-RestMethod -Method POST -Uri "$url/api/trading/start" | ConvertTo-Json
```

---

## Quick Alias Setup (Optional)

Add these to your PowerShell profile (`$PROFILE`) for even shorter commands:

```powershell
function bot-status { $url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/trading/status" | ConvertTo-Json }
function bot-balance { $url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/balances" | ConvertTo-Json }
function bot-trades { $url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Uri "$url/api/trades?limit=10" | ConvertTo-Json }
function bot-start { $url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Method POST -Uri "$url/api/trading/start" | ConvertTo-Json }
function bot-stop { $url = "https://web-production-68225.up.railway.app"; Invoke-RestMethod -Method POST -Uri "$url/api/trading/stop" | ConvertTo-Json }
```

Then just run: `bot-status`, `bot-balance`, `bot-trades`, etc.
