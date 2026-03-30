$ErrorActionPreference = "Stop"

$subscriptionId = "0c87fd02-06f5-49e3-bf68-5c1c83ea24bc"
$resourceGroup  = "rg-deusxdefense-ops-dev"
$appName        = "onboarding-dev"

$token = (az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)
$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }

$baseUri = "https://management.azure.com/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.Web/sites/$appName"

# Set app settings required by the Rust backend
$settings = @{
    properties = @{
        DATABASE_URL  = "sqlite:///home/site/wwwroot/data/tracker.db"
        STATIC_DIR    = "/home/site/wwwroot/frontend"
        RUST_LOG      = "info"
        # ANTHROPIC_API_KEY = set this manually in Azure portal
    }
}

Write-Host "Setting app configuration..." -ForegroundColor Cyan
$resp = Invoke-WebRequest `
    -Method PUT `
    -Uri "$baseUri/config/appsettings?api-version=2022-03-01" `
    -Headers $headers `
    -Body ($settings | ConvertTo-Json -Depth 5) `
    -UseBasicParsing
Write-Host "  App settings: HTTP $($resp.StatusCode)" -ForegroundColor Green

# Set startup command to run the Rust binary
$siteConfig = @{
    properties = @{
        appCommandLine  = "/home/site/wwwroot/dxd-tracker"
        linuxFxVersion  = "CUSTOM|"
        # Disable Oryx build — we deploy a pre-built binary
        SCM_DO_BUILD_DURING_DEPLOYMENT = "false"
    }
}

Write-Host "Setting startup command..." -ForegroundColor Cyan
$resp2 = Invoke-WebRequest `
    -Method PATCH `
    -Uri "$baseUri/config/web?api-version=2022-03-01" `
    -Headers $headers `
    -Body ($siteConfig | ConvertTo-Json -Depth 5) `
    -UseBasicParsing
Write-Host "  Site config: HTTP $($resp2.StatusCode)" -ForegroundColor Green

Write-Host "`nAzure configured. Remember to set ANTHROPIC_API_KEY in the portal." -ForegroundColor Green
