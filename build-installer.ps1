param([string]$AppVersion = '0.1.1', [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if ($AppVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'AppVersion must be major.minor.patch' }
if (-not $SkipBuild) { & (Join-Path $root 'build.ps1') }
if (-not (Test-Path (Join-Path $root 'dist\LumenMark.exe'))) { throw 'Build dist first' }
$compiler = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if ($compiler) { $compilerPath = $compiler.Source }
else {
    $compilerPath = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
    if (-not (Test-Path $compilerPath)) { throw 'Install Inno Setup 6, then run build-installer.ps1 again.' }
}
& $compilerPath "/DAppVersion=$AppVersion" (Join-Path $root 'installer\LumenMark.iss')
if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed: $LASTEXITCODE" }
