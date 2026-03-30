$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$zipPath = "$root\deploy.zip"
$dist = "$root\dist"

if (-not (Test-Path $dist)) {
    Write-Error "dist/ not found. Run scripts\build.ps1 first."
}

Write-Host "`n[1/3] Creating deploy zip..." -ForegroundColor Cyan
if (Test-Path $zipPath) { Remove-Item $zipPath }
Compress-Archive -Path "$dist\*" -DestinationPath $zipPath
$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "  deploy.zip ready: $sizeMB MB" -ForegroundColor Green

Write-Host "`n[2/3] Uploading to Azure App Service..." -ForegroundColor Cyan
$token = (az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)
$headers = @{
    Authorization  = "Bearer $token"
    'Content-Type' = 'application/zip'
}
$resp = Invoke-WebRequest `
    -Method POST `
    -Uri 'https://onboarding-dev-due5dra7bucjdwfs.scm.centralus-01.azurewebsites.net/api/zipdeploy' `
    -Headers $headers `
    -InFile $zipPath `
    -UseBasicParsing
Write-Host "  Deploy status: $($resp.StatusCode)" -ForegroundColor Green

Write-Host "`n[3/3] Waiting for app to start (30s)..." -ForegroundColor Cyan
Start-Sleep -Seconds 30

try {
    $r = Invoke-WebRequest `
        -Uri 'https://onboarding-dev-due5dra7bucjdwfs.centralus-01.azurewebsites.net/api/health' `
        -UseBasicParsing -TimeoutSec 30
    Write-Host "  Health check: HTTP $($r.StatusCode) - UP!" -ForegroundColor Green
} catch {
    Write-Host "  Health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  App may still be starting. Check logs with scripts\check_logs.ps1" -ForegroundColor Yellow
}

Write-Host "`n=== Deploy complete ===" -ForegroundColor Green
Write-Host "  https://onboarding-dev-due5dra7bucjdwfs.centralus-01.azurewebsites.net/`n" -ForegroundColor White
