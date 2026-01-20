# Quick Monitoring Commands - Copy and paste any command into PowerShell
# All commands use: https://web-production-68225.up.railway.app

$url = "https://web-production-68225.up.railway.app"

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
Write-Host 'Invoke-RestMethod -Uri "$url/api/trades?limit=10" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 5. Open Positions" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/positions" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 6. Open Orders" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Uri "$url/api/orders" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 7. Start Trading" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Method POST -Uri "$url/api/trading/start" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 8. Stop Trading" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Method POST -Uri "$url/api/trading/stop" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 9. Manual Scan for Opportunities" -ForegroundColor Yellow
Write-Host 'Invoke-RestMethod -Method POST -Uri "$url/api/trading/scan" | ConvertTo-Json' -ForegroundColor White
Write-Host ""

Write-Host "# 10. Market Count (quick check)" -ForegroundColor Yellow
Write-Host '(Invoke-RestMethod -Uri "$url/api/markets").count' -ForegroundColor White
Write-Host ""

Write-Host "=== Quick Status (runs command #2) ===" -ForegroundColor Cyan
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
