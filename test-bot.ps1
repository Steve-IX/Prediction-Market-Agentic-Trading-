# Prediction Market Trading Bot - Quick Test Script
# Run this in PowerShell: .\test-bot.ps1

$baseUrl = "https://web-production-68225.up.railway.app"

Write-Host ""
Write-Host "=== Prediction Market Trading Bot Test ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check Health
Write-Host "1. Checking health..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing | ConvertFrom-Json
    Write-Host "   Status: $($health.status)" -ForegroundColor Green
    Write-Host "   Uptime: $($health.uptime)" -ForegroundColor Green
} catch {
    Write-Host "   Failed: $_" -ForegroundColor Red
}

# 2. Check Balance
Write-Host ""
Write-Host "2. Checking paper trading balance..." -ForegroundColor Yellow
try {
    $balances = Invoke-WebRequest -Uri "$baseUrl/api/balances" -UseBasicParsing | ConvertFrom-Json
    Write-Host "   Paper Trading Balance: $($balances.paper.usdc) USDC" -ForegroundColor Green
    if ($balances.polymarket) {
        Write-Host "   Polymarket Balance: $($balances.polymarket.usdc) USDC" -ForegroundColor Green
    }
} catch {
    Write-Host "   Failed: $_" -ForegroundColor Red
}

# 3. Check Trading Status
Write-Host ""
Write-Host "3. Checking trading status..." -ForegroundColor Yellow
try {
    $status = Invoke-WebRequest -Uri "$baseUrl/api/trading/status" -UseBasicParsing | ConvertFrom-Json
    $statusColor = if ($status.isRunning) { "Green" } else { "Yellow" }
    Write-Host "   Trading Engine: $($status.isRunning)" -ForegroundColor $statusColor
    Write-Host "   Markets Loaded: $($status.marketsCount.polymarket)" -ForegroundColor Green
    Write-Host "   Opportunities Detected: $($status.opportunitiesDetected)" -ForegroundColor Green
} catch {
    Write-Host "   Failed: $_" -ForegroundColor Red
}

# 4. Ask to Start Trading
Write-Host ""
Write-Host "4. Start automated trading?" -ForegroundColor Yellow
$response = Read-Host "   Type 'yes' to start, or press Enter to skip"
if ($response -eq "yes") {
    try {
        $result = Invoke-WebRequest -Method POST -Uri "$baseUrl/api/trading/start" -UseBasicParsing | ConvertFrom-Json
        Write-Host "   Trading started!" -ForegroundColor Green
        Write-Host "   Message: $($result.message)" -ForegroundColor Green
    } catch {
        Write-Host "   Failed: $_" -ForegroundColor Red
    }
} else {
    Write-Host "   Skipped. You can start later with: POST /api/trading/start" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host ""
