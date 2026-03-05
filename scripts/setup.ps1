# Jarvis Setup-Skript für Windows (PowerShell)
# Voraussetzung: Als normaler Nutzer ausführen (nicht als Administrator)
# Ausführen mit: .\scripts\setup.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Jarvis Setup ===" -ForegroundColor Cyan
Write-Host ""

# ─── Hilfsfunktionen ────────────────────────────────────────────────────────
function Check-Command($cmd) {
    try { Get-Command $cmd -ErrorAction Stop | Out-Null; return $true }
    catch { return $false }
}

function Assert-Command($cmd, $installUrl) {
    if (-not (Check-Command $cmd)) {
        Write-Host "FEHLER: '$cmd' nicht gefunden." -ForegroundColor Red
        Write-Host "  Bitte installieren: $installUrl" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "OK: $cmd gefunden" -ForegroundColor Green
}

# ─── Voraussetzungen prüfen ──────────────────────────────────────────────────
Write-Host "Prüfe Voraussetzungen..." -ForegroundColor Yellow

Assert-Command "node"   "https://nodejs.org"
Assert-Command "npm"    "https://nodejs.org"
Assert-Command "python" "https://python.org"
Assert-Command "git"    "https://git-scm.com"

# Node.js-Version prüfen (mind. 20)
$nodeVersion = (node --version) -replace "v", ""
$nodeMajor = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 20) {
    Write-Host "FEHLER: Node.js $nodeVersion ist zu alt. Mindestens v20 erforderlich." -ForegroundColor Red
    exit 1
}
Write-Host "OK: Node.js v$nodeVersion" -ForegroundColor Green

# Python-Version prüfen (mind. 3.11)
$pythonVersion = (python --version 2>&1) -replace "Python ", ""
$pythonMajor = [int]($pythonVersion.Split(".")[0])
$pythonMinor = [int]($pythonVersion.Split(".")[1])
if ($pythonMajor -lt 3 -or ($pythonMajor -eq 3 -and $pythonMinor -lt 11)) {
    Write-Host "FEHLER: Python $pythonVersion ist zu alt. Mindestens 3.11 erforderlich." -ForegroundColor Red
    exit 1
}
Write-Host "OK: Python $pythonVersion" -ForegroundColor Green

Write-Host ""

# ─── Ollama prüfen ───────────────────────────────────────────────────────────
Write-Host "Prüfe Ollama..." -ForegroundColor Yellow

if (-not (Check-Command "ollama")) {
    Write-Host "WARNUNG: Ollama nicht gefunden." -ForegroundColor Yellow
    Write-Host "  Bitte installieren: https://ollama.com" -ForegroundColor Yellow
    Write-Host "  Danach: ollama pull qwen2.5:7b-instruct" -ForegroundColor Yellow
} else {
    Write-Host "OK: Ollama gefunden" -ForegroundColor Green
    Write-Host "  Empfehlung: ollama pull qwen2.5:7b-instruct  (schnell, zum Testen)" -ForegroundColor Cyan
    Write-Host "  Produktion:  ollama pull qwen2.5:32b-instruct (benötigt ~20 GB RAM)" -ForegroundColor Cyan
}

Write-Host ""

# ─── npm-Abhängigkeiten installieren ────────────────────────────────────────
Write-Host "Installiere npm-Abhängigkeiten..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "FEHLER: npm install fehlgeschlagen." -ForegroundColor Red
    Write-Host "  Tipp: Stelle sicher, dass Visual Studio Build Tools 2022 installiert sind." -ForegroundColor Yellow
    exit 1
}
Write-Host "OK: npm-Abhängigkeiten installiert" -ForegroundColor Green

Write-Host ""

# ─── Python-Umgebung einrichten ──────────────────────────────────────────────
Write-Host "Richte Python-Umgebung für Browser Use ein..." -ForegroundColor Yellow
& "$PSScriptRoot\setup-python-env.ps1"

Write-Host ""
Write-Host "=== Setup abgeschlossen ===" -ForegroundColor Green
Write-Host ""
Write-Host "Nächste Schritte:" -ForegroundColor Cyan
Write-Host "  1. Ollama starten (falls noch nicht laufend)"
Write-Host "  2. Modell laden: ollama pull qwen2.5:7b-instruct"
Write-Host "  3. App starten:  npm run dev"
Write-Host ""
