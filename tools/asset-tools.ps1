param(
    [ValidateSet('Check', 'Krita', 'Laigter')]
    [string]$Action = 'Check'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$assetPython = Join-Path $projectRoot '.venv-assets/Scripts/python.exe'
$kritaExecutable = 'D:/softwares/Krita/krita-x64-5.3.4.1/bin/krita.exe'
$laigterExecutable = 'D:/softwares/Laigter/laigter-windows/laigter.exe'

switch ($Action) {
    'Krita' { Start-Process -FilePath $kritaExecutable -WindowStyle Hidden }
    'Laigter' { Start-Process -FilePath $laigterExecutable -WorkingDirectory (Split-Path $laigterExecutable) -WindowStyle Hidden }
    'Check' {
        foreach ($executable in @($assetPython, $kritaExecutable, $laigterExecutable)) {
            if (-not (Test-Path -LiteralPath $executable)) { throw "Missing tool: $executable" }
        }
        & $assetPython -c "import sys, importlib.metadata, onnxruntime; print('Python', sys.version.split()[0]); print('rembg', importlib.metadata.version('rembg')); print('Available backends:', ', '.join(onnxruntime.get_available_providers()))"
        if ($LASTEXITCODE -ne 0) { throw 'Asset environment check failed.' }
        Write-Output "Krita: $kritaExecutable"
        Write-Output "Laigter: $laigterExecutable"
    }
}
