# Database Environment Variables Setup Script
# 
# INSTRUCTIONS:
# 1. Copy this file: Copy-Item setup-env.example.ps1 setup-env.ps1
# 2. Edit setup-env.ps1 and replace YOUR_PASSWORD_HERE with your actual MySQL password
# 3. Run the script: .\setup-env.ps1
# 4. Then run the application: mvn spring-boot:run
#
# IMPORTANT: setup-env.ps1 is in .gitignore and should NOT be committed to Git!

# Set database credentials
$env:DB_USERNAME="root"
$env:DB_PASSWORD="YOUR_PASSWORD_HERE"

Write-Host "Database environment variables set:" -ForegroundColor Green
Write-Host "  DB_USERNAME: $env:DB_USERNAME" -ForegroundColor Cyan
Write-Host "  DB_PASSWORD: [HIDDEN]" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now run: mvn spring-boot:run" -ForegroundColor Yellow

