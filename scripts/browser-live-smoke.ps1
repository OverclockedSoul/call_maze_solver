param(
    [string]$PythonPath = "C:\Users\joanc\.conda\envs\call\python.exe"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location (Join-Path $repoRoot "backend")
try {
    & $PythonPath "..\scripts\generate_browser_live_fixture.py"
    if ($LASTEXITCODE -ne 0) {
        throw "Fixture generation failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

Push-Location $repoRoot
try {
    & "node" "scripts\browser-live-smoke.mjs"
    if ($LASTEXITCODE -ne 0) {
        throw "Browser live smoke test failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
