# Quick Monitoring Commands - Copy and paste any command into PowerShell
# All commands use: https://prediction-trading-production.up.railway.app

$url = "https://prediction-trading-production.up.railway.app"

Write-Host ""
Write-Host "=== Copy these commands into PowerShell ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "# 1. Check Health" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/health" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 2. Trading Status (shows opportunities, executions, profit)" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/trading/status" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 3. Paper Trading Balance" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/balances" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 4. Recent Trades (last 10)" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/trades?limit=10" | ConvertTo-Json -Depth 5' -ForegroundColor White
Write-Host ""

Write-Host "# 5. Open Positions" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/positions" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 6. Open Orders" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/orders" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 7. Start Trading (with session)" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Method POST -Uri "$url/api/trading/start" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 8. Stop Trading (with session summary)" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Method POST -Uri "$url/api/trading/stop" | ConvertTo-Json -Depth 5' -ForegroundColor White
Write-Host ""

Write-Host "# 9. Manual Scan for Opportunities" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Method POST -Uri "$url/api/trading/scan" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 10. Market Count (quick check)" -ForegroundColor Yellow
Write-Host '(Invoke-RestMethod -Uri "$url/api/markets").polymarket.count' -ForegroundColor White
Write-Host ""

Write-Host "# === Session Commands ===" -ForegroundColor Magenta
Write-Host ""

Write-Host "# 11. Current Session Status" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/sessions/current" | ConvertTo-Json -Depth 5' -ForegroundColor White
Write-Host ""

Write-Host "# 12. All Sessions" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/sessions" | ConvertTo-Json -Depth 5' -ForegroundColor White
Write-Host ""

Write-Host "# 13. Session Summary Stats" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/sessions/stats/summary" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 14. Export Sessions to JSON" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/sessions/export" | Out-File "sessions-export.json"' -ForegroundColor White
Write-Host ""

Write-Host "=== Quick Status ===" -ForegroundColor Cyan
Write-Host ""

# Actually run the status command
try {
    $status = Invoke-RestMethod -Uri "$url/api/trading/status"
    Write-Host "Trading Engine Running: $($status.isRunning)" -ForegroundColor $(if ($status.isRunning) { "Green" } else { "Yellow" })
    Write-Host "Markets Loaded: $($status.marketsCount.polymarket)" -ForegroundColor Green
    Write-Host "Opportunities Detected: $($status.opportunitiesDetected)" -ForegroundColor Green
    Write-Host "Executions Attempted: $($status.executionsAttempted)" -ForegroundColor Green
    Write-Host "Executions Succeeded: $($status.executionsSucceeded)" -ForegroundColor Green
    Write-Host "Total Profit: $($status.totalProfit)" -ForegroundColor $(if ($status.totalProfit -gt 0) { "Green" } else { "White" })
} catch {
    Write-Host "Failed to get status: $_" -ForegroundColor Red
}

Write-Host ""

# Check for active session
try {
    $sessionResponse = Invoke-RestMethod -Uri "$url/api/sessions/current"
    if ($sessionResponse.active) {
        Write-Host "=== Active Session ===" -ForegroundColor Magenta
        Write-Host "Session ID: $($sessionResponse.session.id)" -ForegroundColor Cyan
        Write-Host "Duration: $($sessionResponse.session.durationHours) hours" -ForegroundColor White
        Write-Host "Net P&L: $($sessionResponse.session.netPnl)" -ForegroundColor $(if ([double]($sessionResponse.session.netPnl -replace '[^0-9.-]','') -gt 0) { "Green" } else { "Red" })
        Write-Host "Trades: $($sessionResponse.session.tradesExecuted)" -ForegroundColor White
    } else {
        Write-Host "No active session" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not fetch session status" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Use '.\record-session.ps1 start' to start a new session" -ForegroundColor Gray
Write-Host "Use '.\record-session.ps1 end' to end and record session" -ForegroundColor Gray
Write-Host ""
