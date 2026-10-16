param(
    [string]$Workbook,
    [string]$Python,
    [switch]$Preview,
    [switch]$Test
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Python) {
    $bundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    if (Test-Path -LiteralPath $bundledPython) { $Python = $bundledPython }
    else {
        $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
        if (-not $pythonCommand) { throw 'Python 3.10+ required. Specify its path with -Python.' }
        $Python = $pythonCommand.Source
    }
}
if ($Test) {
    & $Python (Join-Path $projectRoot 'tests/test_catalog_import.py')
} else {
    $importArguments = @((Join-Path $PSScriptRoot 'import_catalog.py'), '--root', $projectRoot)
    if ($Workbook) { $importArguments += @('--source', $Workbook) }
    if ($Preview) { $importArguments += '--preview' }
    & $Python @importArguments
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
