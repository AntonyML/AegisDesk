[CmdletBinding()]
param(
    [string]$Version = "dev",
    [string]$WorkerBaseURL = "https://aegisdesk.tonyml.com",
    [string]$StateIssuer = "https://aegisdesk.tonyml.com",
    [string]$StateKeyID = "ed25519-2026-01",
    [string]$PublicKeyBase64 = "",
    [switch]$Installer,
    [switch]$RequireVerifier,
    [switch]$AllowUnsignedDev
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$bin = Join-Path $root "bin"
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $bin, $dist | Out-Null

if ([string]::IsNullOrWhiteSpace($WorkerBaseURL)) { $WorkerBaseURL = "https://aegisdesk.tonyml.com" }
if ([string]::IsNullOrWhiteSpace($StateIssuer)) { $StateIssuer = $WorkerBaseURL }
if ([string]::IsNullOrWhiteSpace($StateKeyID)) { $StateKeyID = "ed25519-2026-01" }

if (-not $AllowUnsignedDev -and [string]::IsNullOrWhiteSpace($PublicKeyBase64)) {
    throw "PublicKeyBase64 es obligatorio en builds firmados. Usá -AllowUnsignedDev únicamente para desarrollo explícito."
}
if ($AllowUnsignedDev) {
    Write-Warning "Build de desarrollo sin verificador: el binario quedará marcado como UNSIGNED_DEV y el shell lo registrará."
}

Push-Location $root
try {
    & (Join-Path $root 'generate-branding.ps1')
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

    $securityMode = "SIGNED_CONFIG_REQUIRED"
    $ldflags = "-s -w -X main.version=$Version -X main.workerBaseURL=$WorkerBaseURL -X main.stateIssuer=$StateIssuer -X main.stateKeyID=$StateKeyID -X main.securityMode=$securityMode"
    if ($AllowUnsignedDev) {
        $securityMode = "UNSIGNED_DEV"
        $ldflags = "-s -w -X main.version=$Version -X main.workerBaseURL=$WorkerBaseURL -X main.stateIssuer=$StateIssuer -X main.stateKeyID=$StateKeyID -X main.securityMode=$securityMode"
    }
    if ($PublicKeyBase64) {
        $ldflags += " -X aegisdesk-shell/internal/state.EmbeddedPublicKeyBase64=$PublicKeyBase64"
    }

    $legalRoot = Join-Path $root "..\docs\legal"
    $legalManifestPath = Join-Path $legalRoot "LEGAL_VERSION.json"
    $legalManifest = Get-Content $legalManifestPath -Raw | ConvertFrom-Json
    $termsSource = Join-Path $legalRoot "terms-0.1.0.es.md"
    $privacySource = Join-Path $legalRoot "privacy-notice-0.1.0.es.md"
    $termsHash = (Get-FileHash $termsSource -Algorithm SHA256).Hash.ToLower()
    $privacyHash = (Get-FileHash $privacySource -Algorithm SHA256).Hash.ToLower()
    if ($termsHash -ne $legalManifest.termsSha256 -or $privacyHash -ne $legalManifest.privacySha256) {
        throw "Los hashes de los textos legales no coinciden con LEGAL_VERSION.json."
    }
    $ldflags += " -X main.termsSHA256=$termsHash"
    $legalStage = Join-Path $dist "legal"
    New-Item -ItemType Directory -Force -Path $legalStage | Out-Null
    Copy-Item $termsSource (Join-Path $legalStage "terms-0.1.0.es.txt") -Force
    Copy-Item $privacySource, (Join-Path $legalRoot "LEGAL_VERSION.json"), (Join-Path $legalRoot "retention-policy.md"), (Join-Path $legalRoot "subprocessors.md"), (Join-Path $legalRoot "incident-response.md"), (Join-Path $legalRoot "organization-authorization-outline.md") $legalStage -Force
    Copy-Item (Join-Path $root "..\THIRD_PARTY_NOTICES.md") (Join-Path $legalStage "THIRD_PARTY_NOTICES.md") -Force

    # Always regenerate: a cached resource may contain an older logo.
    Push-Location (Join-Path $root "cmd\aegisdesk")
    try {
        go run github.com/josephspurrier/goversioninfo/cmd/goversioninfo -o resource_windows_amd64.syso versioninfo.json
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron generar los recursos del ejecutable.' }
    } finally {
        Pop-Location
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
            & $iscc "/O+" "/DMyAppVersion=$Version" "/DMyAppURL=$WorkerBaseURL" "/DLegalFile=dist\legal\terms-0.1.0.es.txt" "/DTermsSha256=$termsHash" (Join-Path $root "installer.iss")
        } else {
            Write-Warning "ISCC.exe no encontrado; se omite el instalador."
        }
    }
} finally {
    Pop-Location
}
