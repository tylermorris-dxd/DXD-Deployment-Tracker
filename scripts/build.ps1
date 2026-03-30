$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

Write-Host "`n[1/3] Building Next.js frontend..." -ForegroundColor Cyan
Set-Location "$root\frontend"
npm ci --silent
npm run build
Write-Host "  Next.js static export ready at frontend/out/" -ForegroundColor Green

Write-Host "`n[2/3] Building Rust backend (Linux target)..." -ForegroundColor Cyan
Set-Location "$root\backend"

# Check if cross is available (for cross-compilation to Linux)
if (Get-Command cross -ErrorAction SilentlyContinue) {
    Write-Host "  Using 'cross' for Linux cross-compilation..."
    cross build --release --target x86_64-unknown-linux-gnu
    $binaryPath = "target\x86_64-unknown-linux-gnu\release\dxd-tracker"
} elseif (Get-Command cargo -ErrorAction SilentlyContinue) {
    Write-Host "  WARNING: 'cross' not found. Building for local platform (not Linux)." -ForegroundColor Yellow
    Write-Host "  Install 'cross' with: cargo install cross" -ForegroundColor Yellow
    Write-Host "  (Requires Docker Desktop)" -ForegroundColor Yellow
    cargo build --release
    $binaryPath = "target\release\dxd-tracker.exe"
} else {
    Write-Error "Neither 'cross' nor 'cargo' found. Install Rust: https://rustup.rs"
}

Write-Host "  Rust binary ready at backend/$binaryPath" -ForegroundColor Green

Write-Host "`n[3/3] Staging deploy artifact..." -ForegroundColor Cyan
$dist = "$root\dist"
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory $dist | Out-Null
New-Item -ItemType Directory "$dist\frontend" | Out-Null
New-Item -ItemType Directory "$dist\data" | Out-Null

# Copy Linux binary
if ($binaryPath.EndsWith(".exe")) {
    Copy-Item "$root\backend\$binaryPath" "$dist\dxd-tracker.exe"
} else {
    Copy-Item "$root\backend\$binaryPath" "$dist\dxd-tracker"
}

# Copy Next.js static export
Copy-Item -Recurse "$root\frontend\out\*" "$dist\frontend\"

# Copy startup config
Copy-Item "$root\.deployment" "$dist\.deployment" -ErrorAction SilentlyContinue

Write-Host "`n=== Build complete ===" -ForegroundColor Green
Write-Host "  Artifact: $dist\" -ForegroundColor White
$size = (Get-ChildItem $dist -Recurse | Measure-Object Length -Sum).Sum / 1MB
Write-Host "  Total size: $([math]::Round($size, 1)) MB" -ForegroundColor White
Write-Host "`nRun scripts\deploy.ps1 to deploy to Azure.`n" -ForegroundColor Cyan
