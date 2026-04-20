$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
    Write-Error $Message
    exit 1
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-External([string]$FilePath, [string[]]$Arguments = @()) {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
}

function Get-VenvPythonPath() {
    return Join-Path $root ".venv\Scripts\python.exe"
}

function Get-NpmCommand() {
    if (Test-Command "npm.cmd") {
        return "npm.cmd"
    }

    if (Test-Command "npm") {
        return "npm"
    }

    return $null
}

function Remove-WorkspaceVenv() {
    $venvPath = Join-Path $root ".venv"
    if (-not (Test-Path -LiteralPath $venvPath)) {
        return
    }

    $resolved = (Resolve-Path -LiteralPath $venvPath).Path
    $workspacePrefix = $root.TrimEnd("\") + "\"
    if (-not $resolved.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        Fail "Refusing to remove virtual environment outside the workspace: $resolved"
    }

    Remove-Item -LiteralPath $resolved -Recurse -Force
}

function Test-InvalidWindowsVenv() {
    $venvPath = Join-Path $root ".venv"
    if (-not (Test-Path -LiteralPath $venvPath)) {
        return $false
    }

    $venvPython = Get-VenvPythonPath
    if (-not (Test-Path -LiteralPath $venvPython)) {
        return $true
    }

    $configPath = Join-Path $venvPath "pyvenv.cfg"
    if (-not (Test-Path -LiteralPath $configPath)) {
        return $false
    }

    $configContent = Get-Content -LiteralPath $configPath
    return [bool]($configContent | Where-Object {
        $_ -match "^\s*(home|executable|command)\s*=\s*/usr/bin"
    })
}

function Ensure-EnvFile() {
    if (Test-Path -LiteralPath ".\.env") {
        return
    }

    if (-not (Test-Path -LiteralPath ".\.env.example")) {
        Fail ".env is missing and .env.example was not found."
    }

    Write-Step "Creating .env from .env.example"
    Copy-Item -LiteralPath ".\.env.example" -Destination ".\.env"
}

function New-WindowsVenv() {
    $created = $false

    if (Test-Command "py") {
        Write-Step "Creating Windows virtual environment"
        try {
            Invoke-External "py" @("-3", "-m", "venv", ".venv")
            $created = $true
        } catch {
            Write-Warning "py -3 -m venv failed, falling back to python -m venv."
        }
    }

    if (-not $created -and (Test-Command "python")) {
        Write-Step "Creating Windows virtual environment"
        Invoke-External "python" @("-m", "venv", ".venv")
        $created = $true
    }

    if (-not $created) {
        Fail "Python 3 was not found. Install Python 3, then run .\start.ps1 again."
    }
}

function Ensure-Venv() {
    if (Test-InvalidWindowsVenv) {
        Write-Step "Removing incompatible virtual environment"
        Remove-WorkspaceVenv
    }

    $venvPython = Get-VenvPythonPath
    if (-not (Test-Path -LiteralPath $venvPython)) {
        New-WindowsVenv
    }

    $venvPython = Get-VenvPythonPath
    if (-not (Test-Path -LiteralPath $venvPython)) {
        Fail "Failed to create .venv. Install Python 3 and try again."
    }

    return $venvPython
}

function Ensure-PythonDependencies([string]$PythonBin) {
    & $PythonBin -c "import fastapi, uvicorn, playwright" *> $null
    if ($LASTEXITCODE -eq 0) {
        return
    }

    Write-Step "Installing backend dependencies"
    Invoke-External $PythonBin @("-m", "pip", "install", "-r", "backend\requirements.txt")
}

function Get-PlaywrightChromiumInstallPath([string]$PythonBin) {
    $dryRunOutput = & $PythonBin -m playwright install --dry-run chromium 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    foreach ($line in $dryRunOutput) {
        if ($line -match "Install location:\s+(.+)$") {
            return $Matches[1].Trim()
        }
    }

    return $null
}

function Ensure-PlaywrightChromium([string]$PythonBin) {
    $installPath = Get-PlaywrightChromiumInstallPath $PythonBin
    if ($installPath -and (Test-Path -LiteralPath $installPath)) {
        return
    }

    Write-Step "Installing Playwright Chromium"
    Invoke-External $PythonBin @("-m", "playwright", "install", "chromium")
}

function Ensure-FrontendAssets() {
    $needsInstall = -not (Test-Path -LiteralPath ".\frontend\node_modules")
    $needsBuild = -not (Test-Path -LiteralPath ".\frontend\dist\index.html")

    if (-not ($needsInstall -or $needsBuild)) {
        return
    }

    $npmCommand = Get-NpmCommand
    if (-not $npmCommand) {
        Fail "npm was not found. Install Node.js and npm, then run .\start.ps1 again."
    }

    Push-Location ".\frontend"
    try {
        if ($needsInstall) {
            Write-Step "Installing frontend dependencies"
            Invoke-External $npmCommand @("install")
        }

        if ($needsBuild) {
            Write-Step "Building frontend"
            Invoke-External $npmCommand @("run", "build")
        }
    } finally {
        Pop-Location
    }
}

function Get-BackendBinding([string]$PythonBin) {
    $binding = & $PythonBin -c "from backend.app.core.config import settings; print(f'{settings.backend_host}|{settings.backend_port}')"
    if ($LASTEXITCODE -ne 0 -or -not $binding) {
        return @{
            Host = "127.0.0.1"
            Port = 8000
        }
    }

    $parts = ($binding | Select-Object -First 1).Trim().Split("|", 2)
    if ($parts.Length -ne 2) {
        return @{
            Host = "127.0.0.1"
            Port = 8000
        }
    }

    return @{
        Host = $parts[0]
        Port = [int]$parts[1]
    }
}

function Test-WebsiteClawProcess([string]$PythonBin, [int]$ProcessId) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $process) {
        return $false
    }

    $commandLine = $process.CommandLine
    $executablePath = $process.ExecutablePath
    $workspacePrefix = $root.TrimEnd("\") + "\"
    $pythonResolved = $null
    if (Test-Path -LiteralPath $PythonBin) {
        $pythonResolved = (Resolve-Path -LiteralPath $PythonBin).Path
    }

    $runsWebsiteClaw = $commandLine -match "backend\.app(\.main:app)?"
    if (-not $runsWebsiteClaw) {
        return $false
    }

    $usesWorkspacePath = $false
    if ($executablePath) {
        $usesWorkspacePath = $executablePath.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)
    }

    if (-not $usesWorkspacePath -and $commandLine) {
        $usesWorkspacePath = $commandLine.IndexOf($root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    }

    if (-not $usesWorkspacePath -and $pythonResolved -and $executablePath) {
        $usesWorkspacePath = [string]::Equals($executablePath, $pythonResolved, [System.StringComparison]::OrdinalIgnoreCase)
    }

    return $usesWorkspacePath
}

function Ensure-BackendPortAvailable([string]$PythonBin) {
    $binding = Get-BackendBinding $PythonBin
    $listeners = Get-NetTCPConnection -LocalPort $binding.Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $listeners) {
        return
    }

    foreach ($processId in $listeners) {
        if (-not (Test-WebsiteClawProcess $PythonBin $processId)) {
            Fail "Port $($binding.Port) on $($binding.Host) is used by another program (PID $processId). Stop it or set BACKEND_PORT in .env to a free port and try again."
        }
    }

    Write-Step "Stopping existing WebsiteClaw instance on port $($binding.Port)"
    foreach ($processId in $listeners) {
        Stop-Process -Id $processId -Force -ErrorAction Stop
    }

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        $stillListening = Get-NetTCPConnection -LocalPort $binding.Port -State Listen -ErrorAction SilentlyContinue
        if (-not $stillListening) {
            return
        }
    }

    Fail "Failed to stop the existing WebsiteClaw instance on port $($binding.Port). Close it manually and try again."
}

try {
    Write-Step "Preparing WebsiteClaw for startup"
    Ensure-EnvFile
    $pythonBin = Ensure-Venv
    Ensure-PythonDependencies $pythonBin
    Ensure-PlaywrightChromium $pythonBin
    Ensure-FrontendAssets
    Ensure-BackendPortAvailable $pythonBin

    $binding = Get-BackendBinding $pythonBin
    Write-Step "Starting WebsiteClaw on http://localhost:$($binding.Port)"
    & $pythonBin -m backend.app
    exit $LASTEXITCODE
} catch {
    Fail $_.Exception.Message
}
