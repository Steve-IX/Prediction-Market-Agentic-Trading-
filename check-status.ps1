# Quick Status Check - Checks all important bot metrics
# Run: .\check-status.ps1

$url = "https://web-production-68225.up.railway.app"

Write-Host ""
Write-Host "=== Bot Status Check ===" -ForegroundColor Cyan
Write-Host ""

# 1. Health
Write-Host "1. Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$url/health" -UseBasicParsing
    Write-Host "   Status: $($health.status)" -ForegroundColor $(if ($health.status -eq "ok") { "Green" } else { "Red" })
} catch {
    Write-Host "   Failed: $_" -ForegroundColor Red
}

# 2. Trading Status
Write-Host ""
Write-Host "2. Trading Status..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "$url/api/trading/status" -UseBasicParsing
    Write-Host "   Engine Running: $($status.isRunning)" -ForegroundColor $(if ($status.isRunning) { "Green" } else { "Yellow" })
    Write-Host "   Markets Loaded: $($status.marketsCount.polymarket)" -ForegroundColor Green
    Write-Host "   Opportunities Detected: $($status.opportunitiesDetected)" -ForegroundColor Green
    Write-Host "   Executions Attempted: $($status.executionsAttempted)" -ForegroundColor Green
    Write-Host "   Executions Succeeded: $($status.executionsSucceeded)" -ForegroundColor Green
    Write-Host "   Total Profit: $($status.totalProfit)" -ForegroundColor $(if ($status.totalProfit -gt 0) { "Green" } elseif ($status.totalProfit -lt 0) { "Red" } else { "White" })
} catch {
    Write-Host "   Failed: $_" -ForegroundColor Red
}

# 3. Paper Trading Balance
Write-Host ""
Write-Host "3. Paper Trading Balance..." -ForegroundColor Yellow
try {
    $balances = Invoke-RestMethod -Uri "$url/api/balances" -UseBasicParsing
    if ($balances.paper) {
        Write-Host "   Total Balance: $($balances.paper.total) $($balances.paper.currency)" -ForegroundColor Green
        Write-Host "   Available: $($balances.paper.available) $($balances.paper.currency)" -ForegroundColor Green
        Write-Host "   Locked: $($balances.paper.locked) $($balances.paper.currency)" -ForegroundColor $(if ($balances.paper.locked -gt 0) { "Yellow" } else { "White" })
    } else {
        Write-Host "   Paper balance not available" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   Failed: $_" -ForegroundColor Red
}

# 4. Recent Trades
Write-Host ""
Write-Host "4. Recent Activity..." -ForegroundColor Yellow
try {
    $trades = Invoke-RestMethod -Uri "$url/api/trades?limit=5" -UseBasicParsing
    Write-Host "   Total Trades: $($trades.count)" -ForegroundColor Green
    if ($trades.trades -and $trades.trades.Count -gt 0) {
        Write-Host "   Latest Trade: $($trades.trades[0].side) $($trades.trades[0].size) @ $($trades.trades[0].price)" -ForegroundColor Green
        Write-Host "   P&L: $($trades.trades[0].realizedPnl)" -ForegroundColor $(if ($trades.trades[0].realizedPnl -gt 0) { "Green" } elseif ($trades.trades[0].realizedPnl -lt 0) { "Red" } else { "White" })
    } else {
        Write-Host "   No trades yet" -ForegroundColor Gray
    }
} catch {
    Write-Host "   Failed: $_" -ForegroundColor Red
}

# 5. Open Positions
Write-Host ""
Write-Host "5. Open Positions..." -ForegroundColor Yellow
try {
    $positions = Invoke-RestMethod -Uri "$url/api/positions" -UseBasicParsing
    if ($positions.positions) {
        Write-Host "   Open Positions: $($positions.positions.Count)" -ForegroundColor Green
        if ($positions.positions.Count -gt 0) {
            $totalUnrealized = ($positions.positions | Measure-Object -Property unrealizedPnl -Sum).Sum
            Write-Host "   Total Unrealized P&L: $totalUnrealized" -ForegroundColor $(if ($totalUnrealized -gt 0) { "Green" } elseif ($totalUnrealized -lt 0) { "Red" } else { "White" })
        }
    } else {
        Write-Host "   No open positions" -ForegroundColor Gray
    }
} catch {
    Write-Host "   Failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Check Complete ===" -ForegroundColor Cyan
Write-Host ""
