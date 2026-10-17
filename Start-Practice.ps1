# Start Bassline locally using an installed Node.js or the Codex bundled runtime.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$runtimePath = if ($nodeCommand) { $nodeCommand.Source } else {
    Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}

if (-not (Test-Path -LiteralPath $runtimePath)) {
    throw 'Node.js was not found. Install Node.js 24 LTS, then follow README.md.'
}

$vitePath = Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vitePath)) {
    throw 'Dependencies are missing. Run pnpm install --frozen-lockfile first; see README.md.'
}

Write-Host 'Bassline — http://127.0.0.1:5173/ — press Ctrl+C to stop.'
& $runtimePath $vitePath --host 127.0.0.1 --port 5173 --strictPort
exit $LASTEXITCODE
