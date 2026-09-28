[CmdletBinding()]
param(
    [string]$Version = "dev",
    [string]$WorkerBaseURL = "https://aegisdesk.tonyml.com",
    [string]$StateIssuer = "https://aegisdesk.tonyml.com",
    [string]$StateKeyID = "ed25519-2026-01",
    [string]$PublicKeyBase64 = "",
    [switch]$Installer,
    [switch]$RequireVerifier
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$bin = Join-Path $root "bin"
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $bin, $dist | Out-Null

if ([string]::IsNullOrWhiteSpace($WorkerBaseURL)) { $WorkerBaseURL = "https://aegisdesk.tonyml.com" }
if ([string]::IsNullOrWhiteSpace($StateIssuer)) { $StateIssuer = $WorkerBaseURL }
if ([string]::IsNullOrWhiteSpace($StateKeyID)) { $StateKeyID = "ed25519-2026-01" }

if ($RequireVerifier) {
    if ([string]::IsNullOrWhiteSpace($PublicKeyBase64)) { throw "PublicKeyBase64 es obligatorio cuando se especifica -RequireVerifier." }
}

Push-Location $root
try {
    gofmt -w .
    go vet ./...
    go test ./... -count=1

    $oldGOOS = $env:GOOS
    try {
        $env:GOOS = "linux"
        go build ./...
    } finally {
        if ($null -eq $oldGOOS) { Remove-Item Env:GOOS -ErrorAction SilentlyContinue } else { $env:GOOS = $oldGOOS }
    }

    $ldflags = "-s -w -X main.version=$Version -X main.workerBaseURL=$WorkerBaseURL -X main.stateIssuer=$StateIssuer -X main.stateKeyID=$StateKeyID"
    if ($PublicKeyBase64) {
        $ldflags += " -X aegisdesk-shell/internal/state.EmbeddedPublicKeyBase64=$PublicKeyBase64"
    }
    $temporary = Join-Path $bin "AegisDesk.exe.tmp"
    $target = Join-Path $bin "AegisDesk.exe"
    if (Test-Path $temporary) { Remove-Item -Force $temporary }
    go build -trimpath -ldflags $ldflags -o $temporary ./cmd/aegisdesk
    Move-Item -Force $temporary $target
    Write-Host "Binario generado: $target" -ForegroundColor Green

    if ($Installer) {
        $iscc = if (Test-Path "C:\Program Files (x86)\Inno Setup 6\ISCC.exe") {
            "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
        } elseif (Get-Command iscc.exe -ErrorAction SilentlyContinue) { "iscc.exe" } else { $null }
        if ($iscc) {
            & $iscc "/O+" "/DMyAppVersion=$Version" "/DMyAppURL=$WorkerBaseURL" (Join-Path $root "installer.iss")
        } else {
            Write-Warning "ISCC.exe no encontrado; se omite el instalador."
        }
    }
} finally {
    Pop-Location
}
