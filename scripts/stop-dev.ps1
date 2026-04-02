param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot "data\dev-runtime"

function Get-DescendantProcessIds {
    param([int]$ParentId)

    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ParentId }
    $all = @()
    foreach ($child in $children) {
        $all += [int]$child.ProcessId
        $all += Get-DescendantProcessIds -ParentId ([int]$child.ProcessId)
    }
    return $all
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
            & taskkill /PID ([int]$pidValue) /T /F | Out-Null
        } catch {
        }
    }

    Remove-Item $pidPath -ErrorAction SilentlyContinue
}

function Stop-OrphanedRepoProcesses {
    $normalizedRoot = $repoRoot.ToLowerInvariant()
    $processes = Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and (
            $_.CommandLine.ToLowerInvariant().Contains($normalizedRoot) -or
            $_.CommandLine.ToLowerInvariant().Contains("vite --host 127.0.0.1 --port 5173") -or
            $_.CommandLine.ToLowerInvariant().Contains("main:app --host 127.0.0.1 --port 8000")
        )
    }

    $processes |
        Sort-Object ProcessId -Descending |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

function Stop-PortListeners {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        try {
            $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
                Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($pid in $listeners) {
                & taskkill /PID $pid /T /F | Out-Null
            }
        } catch {
        }
    }
}

if (-not (Test-Path $runtimeDir)) {
    Write-Host "No tracked dev runtime directory found."
    exit 0
}

Stop-TrackedProcess -Name "frontend"
Stop-TrackedProcess -Name "backend"
Stop-TrackedProcess -Name "ngrok"
Stop-OrphanedRepoProcesses
Stop-PortListeners -Ports @(8000, 5173)
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Stopped tracked frontend, backend, and ngrok processes."
