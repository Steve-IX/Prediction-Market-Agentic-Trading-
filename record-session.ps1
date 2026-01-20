# Session Recording Script for Prediction Trading Bot
# Usage: .\record-session.ps1 [start|end|status|summary|export]
#
# Examples:
#   .\record-session.ps1 start -Notes "Testing new strategy"
#   .\record-session.ps1 status
#   .\record-session.ps1 end -Notes "Ended due to volatility"
#   .\record-session.ps1 summary
#   .\record-session.ps1 export

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "end", "status", "summary", "export", "list")]
    [string]$Action,
    
    [string]$Notes = "",
    
    [string]$Url = "https://prediction-trading-production.up.railway.app"
)

$sessionFile = "$PSScriptRoot\sessions-local.csv"

# Initialize CSV if it doesn't exist
if (-not (Test-Path $sessionFile)) {
    "Date,SessionId,StartTime,EndTime,Duration(hours),StartBalance,EndBalance,NetPnl,Trades,WinRate,ProfitFactor,MaxDrawdown,StrategiesUsed,Mode,Notes" | Out-File $sessionFile
}

function Start-TradingSession {
    Write-Host "Starting trading session..." -ForegroundColor Cyan
    
    try {
        # Start the trading engine with session tracking
        $body = @{ notes = $Notes } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$Url/api/trading/start" -Method POST -Body $body -ContentType "application/json"
        
        if ($response.status -eq "started") {
            Write-Host ""
            Write-Host "=== Session Started ===" -ForegroundColor Green
            Write-Host "Session ID: $($response.session.id)" -ForegroundColor Cyan
            Write-Host "Start Time: $($response.session.startTime)" -ForegroundColor White
            Write-Host "Trading Engine: Running" -ForegroundColor Green
            Write-Host ""
            Write-Host "Use '.\record-session.ps1 status' to check progress" -ForegroundColor Yellow
            Write-Host "Use '.\record-session.ps1 end' to stop and record session" -ForegroundColor Yellow
        } else {
            Write-Host "Failed to start session: $($response | ConvertTo-Json)" -ForegroundColor Red
        }
    } catch {
        Write-Host "Error starting session: $_" -ForegroundColor Red
        
        # Check if it's already running
        try {
            $status = Invoke-RestMethod -Uri "$Url/api/trading/status"
            if ($status.isRunning) {
                Write-Host ""
                Write-Host "Trading engine is already running." -ForegroundColor Yellow
                Write-Host "Starting a manual session instead..." -ForegroundColor Yellow
                
                $body = @{ notes = $Notes } | ConvertTo-Json
                $sessionResponse = Invoke-RestMethod -Uri "$Url/api/sessions/start" -Method POST -Body $body -ContentType "application/json"
                
                Write-Host ""
                Write-Host "=== Manual Session Started ===" -ForegroundColor Green
                Write-Host "Session ID: $($sessionResponse.session.id)" -ForegroundColor Cyan
                Write-Host "Start Balance: $($sessionResponse.session.startBalance)" -ForegroundColor White
            }
        } catch {
            Write-Host "Could not start session: $_" -ForegroundColor Red
        }
    }
}

function End-TradingSession {
    Write-Host "Ending trading session..." -ForegroundColor Cyan
    
    try {
        # Check if trading is running
        $status = Invoke-RestMethod -Uri "$Url/api/trading/status"
        
        if ($status.isRunning) {
            # Stop trading engine (which also ends session)
            $body = @{ notes = $Notes } | ConvertTo-Json
            $response = Invoke-RestMethod -Uri "$Url/api/trading/stop" -Method POST -Body $body -ContentType "application/json"
            
            if ($response.session) {
                $session = $response.session
                
                # Also save to local CSV
                $csvRow = @(
                    (Get-Date -Format "yyyy-MM-dd"),
                    $session.id,
                    $session.startTime,
                    $session.endTime,
                    $session.durationHours,
                    "N/A", # startBalance not in stop response
                    "N/A", # endBalance not in stop response  
                    $session.netPnl,
                    $session.tradesExecuted,
                    $session.winRate,
                    $session.profitFactor,
                    "N/A", # maxDrawdown
                    ($session.strategiesUsed -join ";"),
                    "paper",
                    $Notes
                ) -join ","
                
                Add-Content -Path $sessionFile -Value $csvRow
                
                Write-Host ""
                Write-Host "=== Session Ended ===" -ForegroundColor Green
                Write-Host "Session ID: $($session.id)" -ForegroundColor Cyan
                Write-Host "Duration: $($session.durationHours) hours" -ForegroundColor White
                Write-Host "Net P&L: $($session.netPnl)" -ForegroundColor $(if ([double]$session.netPnl -gt 0) { "Green" } else { "Red" })
                Write-Host "Trades Executed: $($session.tradesExecuted)" -ForegroundColor White
                Write-Host "Win Rate: $($session.winRate)" -ForegroundColor White
                Write-Host "Profit Factor: $($session.profitFactor)" -ForegroundColor White
                Write-Host "Strategies Used: $($session.strategiesUsed -join ', ')" -ForegroundColor White
                Write-Host ""
                Write-Host "Session saved to: $sessionFile" -ForegroundColor Cyan
            } else {
                Write-Host "Trading stopped but no session data returned" -ForegroundColor Yellow
            }
        } else {
            # Try to end session manually
            $body = @{ notes = $Notes } | ConvertTo-Json
            $response = Invoke-RestMethod -Uri "$Url/api/sessions/end" -Method POST -Body $body -ContentType "application/json"
            
            if ($response.session) {
                $session = $response.session
                
                Write-Host ""
                Write-Host "=== Session Ended (Manual) ===" -ForegroundColor Green
                Write-Host "Session ID: $($session.id)" -ForegroundColor Cyan
                Write-Host "Duration: $($session.durationHours) hours" -ForegroundColor White
                Write-Host "Net P&L: $($session.netPnl)" -ForegroundColor $(if ([double]$session.netPnl -gt 0) { "Green" } else { "Red" })
                Write-Host "Trades Executed: $($session.tradesExecuted)" -ForegroundColor White
            } else {
                Write-Host "No active session to end" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "Error ending session: $_" -ForegroundColor Red
    }
}

function Show-SessionStatus {
    Write-Host ""
    Write-Host "=== Session Status ===" -ForegroundColor Cyan
    
    try {
        # Get trading status
        $tradingStatus = Invoke-RestMethod -Uri "$Url/api/trading/status"
        
        Write-Host ""
        Write-Host "Trading Engine:" -ForegroundColor Yellow
        Write-Host "  Running: $($tradingStatus.isRunning)" -ForegroundColor $(if ($tradingStatus.isRunning) { "Green" } else { "Yellow" })
        Write-Host "  Opportunities Detected: $($tradingStatus.opportunitiesDetected)" -ForegroundColor White
        Write-Host "  Executions Succeeded: $($tradingStatus.executionsSucceeded)" -ForegroundColor White
        Write-Host "  Total Profit: $($tradingStatus.totalProfit)" -ForegroundColor $(if ($tradingStatus.totalProfit -gt 0) { "Green" } else { "White" })
        
        # Get current session
        $sessionResponse = Invoke-RestMethod -Uri "$Url/api/sessions/current"
        
        Write-Host ""
        Write-Host "Current Session:" -ForegroundColor Yellow
        if ($sessionResponse.active -and $sessionResponse.session) {
            $session = $sessionResponse.session
            Write-Host "  Session ID: $($session.id)" -ForegroundColor Cyan
            Write-Host "  Start Time: $($session.startTime)" -ForegroundColor White
            Write-Host "  Duration: $($session.durationHours) hours" -ForegroundColor White
            Write-Host "  Start Balance: $($session.startBalance)" -ForegroundColor White
            Write-Host "  Current Balance: $($session.currentBalance)" -ForegroundColor White
            Write-Host "  Net P&L: $($session.netPnl)" -ForegroundColor $(if ([double]($session.netPnl -replace '[^0-9.-]','') -gt 0) { "Green" } else { "Red" })
            Write-Host "  Trades Executed: $($session.tradesExecuted)" -ForegroundColor White
            Write-Host "  Win Rate: $($session.winRate)" -ForegroundColor White
            Write-Host "  Mode: $($session.mode)" -ForegroundColor White
        } else {
            Write-Host "  No active session" -ForegroundColor Yellow
        }
        
        # Get balances
        $balances = Invoke-RestMethod -Uri "$Url/api/balances"
        
        Write-Host ""
        Write-Host "Balances:" -ForegroundColor Yellow
        Write-Host "  Polymarket: $($balances.polymarket.total) $($balances.polymarket.currency)" -ForegroundColor White
        
    } catch {
        Write-Host "Error fetching status: $_" -ForegroundColor Red
    }
}

function Show-SessionSummary {
    Write-Host ""
    Write-Host "=== Session Summary ===" -ForegroundColor Cyan
    
    try {
        $summary = Invoke-RestMethod -Uri "$Url/api/sessions/stats/summary"
        
        Write-Host ""
        Write-Host "Overall Statistics:" -ForegroundColor Yellow
        Write-Host "  Total Sessions: $($summary.totalSessions)" -ForegroundColor White
        Write-Host "  Active Sessions: $($summary.activeSessions)" -ForegroundColor White
        Write-Host "  Total Trades: $($summary.totalTrades)" -ForegroundColor White
        Write-Host "  Total P&L: $($summary.totalPnl)" -ForegroundColor $(if ([double]$summary.totalPnl -gt 0) { "Green" } else { "Red" })
        Write-Host "  Avg P&L per Session: $($summary.avgPnlPerSession)" -ForegroundColor White
        Write-Host "  Avg Win Rate: $($summary.avgWinRate)" -ForegroundColor White
        Write-Host "  Avg Profit Factor: $($summary.avgProfitFactor)" -ForegroundColor White
        Write-Host "  Total Duration: $($summary.totalDurationHours) hours" -ForegroundColor White
        
        if ($summary.bestSession) {
            Write-Host ""
            Write-Host "Best Session:" -ForegroundColor Green
            Write-Host "  ID: $($summary.bestSession.id)" -ForegroundColor White
            Write-Host "  P&L: $($summary.bestSession.netPnl)" -ForegroundColor Green
        }
        
        if ($summary.worstSession) {
            Write-Host ""
            Write-Host "Worst Session:" -ForegroundColor Red
            Write-Host "  ID: $($summary.worstSession.id)" -ForegroundColor White
            Write-Host "  P&L: $($summary.worstSession.netPnl)" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "Error fetching summary: $_" -ForegroundColor Red
    }
}

function Export-Sessions {
    Write-Host ""
    Write-Host "Exporting sessions..." -ForegroundColor Cyan
    
    try {
        $exportPath = "$PSScriptRoot\sessions-export-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').json"
        
        $response = Invoke-RestMethod -Uri "$Url/api/sessions/export"
        $response | ConvertTo-Json -Depth 10 | Out-File $exportPath
        
        Write-Host "Sessions exported to: $exportPath" -ForegroundColor Green
        
    } catch {
        Write-Host "Error exporting sessions: $_" -ForegroundColor Red
    }
}

function Show-SessionList {
    Write-Host ""
    Write-Host "=== Session History ===" -ForegroundColor Cyan
    
    try {
        $response = Invoke-RestMethod -Uri "$Url/api/sessions"
        
        if ($response.current) {
            Write-Host ""
            Write-Host "Current Active Session:" -ForegroundColor Green
            Write-Host "  ID: $($response.current.id)" -ForegroundColor Cyan
            Write-Host "  Started: $($response.current.startTime)" -ForegroundColor White
            Write-Host "  Duration: $($response.current.durationHours) hours" -ForegroundColor White
            Write-Host "  Net P&L: $($response.current.netPnl)" -ForegroundColor White
        }
        
        Write-Host ""
        Write-Host "Completed Sessions ($($response.count)):" -ForegroundColor Yellow
        
        foreach ($session in $response.completed) {
            $pnlColor = if ([double]($session.netPnl -replace '[^0-9.-]','') -gt 0) { "Green" } else { "Red" }
            Write-Host ""
            Write-Host "  [$($session.id.Substring(0, 8))...] $($session.startTime)" -ForegroundColor Cyan
            Write-Host "    Duration: $($session.durationHours)h | Trades: $($session.tradesExecuted) | P&L: $($session.netPnl)" -ForegroundColor $pnlColor
            Write-Host "    Win Rate: $($session.winRate) | Profit Factor: $($session.profitFactor)" -ForegroundColor White
            if ($session.notes) {
                Write-Host "    Notes: $($session.notes)" -ForegroundColor Gray
            }
        }
        
    } catch {
        Write-Host "Error fetching sessions: $_" -ForegroundColor Red
    }
}

# Execute action
switch ($Action) {
    "start" { Start-TradingSession }
    "end" { End-TradingSession }
    "status" { Show-SessionStatus }
    "summary" { Show-SessionSummary }
    "export" { Export-Sessions }
    "list" { Show-SessionList }
}

Write-Host ""
