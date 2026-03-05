# Python-Umgebung für Browser Use einrichten
# Wird von setup.ps1 aufgerufen, kann aber auch direkt ausgeführt werden

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$VenvDir = Join-Path $PSScriptRoot ".." ".venv"
$VenvDir = Resolve-Path -Path $VenvDir -ErrorAction SilentlyContinue
if (-not $VenvDir) { $VenvDir = Join-Path (Get-Location) ".venv" }

Write-Host "Erstelle Python-Virtual-Environment in .venv..." -ForegroundColor Yellow

# Virtual environment anlegen
python -m venv .venv
if ($LASTEXITCODE -ne 0) {
    Write-Host "FEHLER: Virtual Environment konnte nicht erstellt werden." -ForegroundColor Red
    exit 1
}

# pip aktualisieren
Write-Host "Aktualisiere pip..." -ForegroundColor Yellow
.\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet

# Browser Use und Playwright installieren
Write-Host "Installiere browser-use und playwright..." -ForegroundColor Yellow
.\.venv\Scripts\pip.exe install browser-use playwright --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "FEHLER: Python-Pakete konnten nicht installiert werden." -ForegroundColor Red
    exit 1
}

# Playwright-Browser herunterladen (Chromium)
Write-Host "Lade Playwright Chromium herunter (einmalig, ~120 MB)..." -ForegroundColor Yellow
.\.venv\Scripts\playwright.exe install chromium
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNUNG: Playwright-Browser konnte nicht installiert werden." -ForegroundColor Yellow
    Write-Host "  Manuell nachholen: .\.venv\Scripts\playwright.exe install chromium" -ForegroundColor Yellow
}

Write-Host "OK: Python-Umgebung eingerichtet" -ForegroundColor Green
Write-Host "   Pfad: .\.venv\" -ForegroundColor Cyan
