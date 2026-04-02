param(
    [string]$CondaEnv = "call",
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot "data\dev-runtime"
$envPath = Join-Path $repoRoot ".env"
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$errorLog = Join-Path $runtimeDir "start-dev.error.log"
Remove-Item $errorLog -ErrorAction SilentlyContinue

trap {
    $_ | Out-String | Set-Content -Path $errorLog
    throw
}

function Get-CondaCommand {
    $candidates = @(
        "C:\ProgramData\miniconda3\Scripts\conda.exe",
        "C:\ProgramData\miniconda3\condabin\conda.bat"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $condaExe = Get-Command conda.exe -ErrorAction SilentlyContinue
    if ($condaExe) {
        return $condaExe.Source
    }
    throw "conda.exe was not found."
}

function Get-CondaEnvPython {
    param([string]$EnvName)

    $envJson = & (Get-CondaCommand) env list --json | ConvertFrom-Json
    $envPath = $envJson.envs | Where-Object { (Split-Path $_ -Leaf) -eq $EnvName } | Select-Object -First 1
    if (-not $envPath) {
        throw "Conda environment '$EnvName' was not found."
    }
    $pythonPath = Join-Path $envPath "python.exe"
    if (-not (Test-Path $pythonPath)) {
        throw "python.exe was not found for conda environment '$EnvName'."
    }
    return $pythonPath
}

function Get-NgrokCommand {
    $ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
    if ($ngrok) {
        return $ngrok.Source
    }

    $fallback = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
    if (Test-Path $fallback) {
        return $fallback
    }
    throw "ngrok was not found in PATH."
}

function Stop-TrackedProcess {
    param([string]$Name)

    $pidPath = Join-Path $runtimeDir "$Name.pid"
    if (-not (Test-Path $pidPath)) {
        return
    }

    $pidValue = Get-Content $pidPath -ErrorAction SilentlyContinue
    if ($pidValue) {
        try {
            Stop-Process -Id ([int]$pidValue) -Force -ErrorAction Stop
        } catch {
        }
    }
    Remove-Item $pidPath -ErrorAction SilentlyContinue
}

function Wait-ForUrl {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 60,
        [hashtable]$Headers = @{}
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            return Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers $Headers -TimeoutSec 5
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    throw "Timed out waiting for $Url"
}

function Wait-ForNgrokTunnel {
    param([int]$TimeoutSeconds = 60)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 5
            $tunnels = $response.Content | ConvertFrom-Json
            $publicUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
            if ($publicUrl) {
                return $publicUrl
            }
        } catch {
        }
        Start-Sleep -Seconds 1
    }
    throw "Timed out waiting for ngrok to expose an HTTPS tunnel."
}

function Set-EnvValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Value
    )

    $lines = if (Test-Path $Path) { Get-Content $Path } else { @() }
    $updated = $false
    $prefix = "$Key="
    $newLines = foreach ($line in $lines) {
        if ($line.StartsWith($prefix)) {
            $updated = $true
            "$Key=$Value"
        } else {
            $line
        }
    }
    if (-not $updated) {
        $newLines += "$Key=$Value"
    }
    Set-Content -Path $Path -Value $newLines
}

function Ensure-FrontendDeps {
    if (Test-Path (Join-Path $frontendDir "node_modules")) {
        return
    }
    Write-Host "Installing frontend dependencies..."
    Push-Location $frontendDir
    try {
        & "npm.cmd" install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

$condaCommand = Get-CondaCommand
$backendPython = Get-CondaEnvPython -EnvName $CondaEnv
$ngrokCommand = Get-NgrokCommand

Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Stop-TrackedProcess -Name "ngrok"
Stop-TrackedProcess -Name "backend"
Stop-TrackedProcess -Name "frontend"

Ensure-FrontendDeps

$ngrokLog = Join-Path $runtimeDir "ngrok.log"
$backendOut = Join-Path $runtimeDir "backend.out.log"
$backendErr = Join-Path $runtimeDir "backend.err.log"
$frontendOut = Join-Path $runtimeDir "frontend.out.log"
$frontendErr = Join-Path $runtimeDir "frontend.err.log"
$publicUrlPath = Join-Path $runtimeDir "public-url.txt"

Remove-Item $ngrokLog, $backendOut, $backendErr, $frontendOut, $frontendErr, $publicUrlPath -ErrorAction SilentlyContinue

Write-Host "Starting ngrok..."
$ngrokProcess = Start-Process -FilePath $ngrokCommand -ArgumentList "http", $BackendPort.ToString(), "--log=stdout" -WorkingDirectory $repoRoot -RedirectStandardOutput $ngrokLog -PassThru
Set-Content (Join-Path $runtimeDir "ngrok.pid") $ngrokProcess.Id

$publicUrl = Wait-ForNgrokTunnel -TimeoutSeconds 60
Set-Content $publicUrlPath $publicUrl
Set-EnvValue -Path $envPath -Key "PUBLIC_BASE_URL" -Value $publicUrl
Write-Host "PUBLIC_BASE_URL updated to $publicUrl"

Write-Host "Starting backend..."
$backendProcess = Start-Process -FilePath $backendPython -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", $BackendPort.ToString() -WorkingDirectory $backendDir -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr -PassThru
Set-Content (Join-Path $runtimeDir "backend.pid") $backendProcess.Id
Wait-ForUrl -Url "http://127.0.0.1:$BackendPort/health" -TimeoutSeconds 60 | Out-Null

Write-Host "Starting frontend..."
$frontendProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", $FrontendPort.ToString() -WorkingDirectory $frontendDir -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr -PassThru
Set-Content (Join-Path $runtimeDir "frontend.pid") $frontendProcess.Id
Wait-ForUrl -Url "http://127.0.0.1:$FrontendPort" -TimeoutSeconds 60 | Out-Null

Write-Host ""
Write-Host "Development stack is running."
Write-Host "Frontend: http://127.0.0.1:$FrontendPort"
Write-Host "Backend:  http://127.0.0.1:$BackendPort"
Write-Host "Public:   $publicUrl"
Write-Host ""
Write-Host "Logs:"
Write-Host "  $backendOut"
Write-Host "  $backendErr"
Write-Host "  $frontendOut"
Write-Host "  $frontendErr"
Write-Host "  $ngrokLog"
