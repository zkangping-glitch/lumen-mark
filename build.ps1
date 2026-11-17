# Build Lumen Mark: compile the C# host with the in-box .NET Framework compiler
# and assemble a portable dist/ folder.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root 'src'
$dist = Join-Path $root 'dist'
$lib = Join-Path $root 'vendor\webview2'

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'csc.exe not found (.NET Framework 4.x is required)' }

Write-Host '==> clean dist'
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $dist 'app') | Out-Null

Write-Host '==> copy runtime + front-end'
Copy-Item (Join-Path $lib '*.dll') $dist -Force
Copy-Item (Join-Path $src 'app\*') (Join-Path $dist 'app') -Recurse -Force

$samples = Join-Path $root 'samples'
if (Test-Path $samples) { Copy-Item $samples (Join-Path $dist 'samples') -Recurse -Force }

# docs shipped next to the exe
foreach ($doc in @('README.md', 'THIRD-PARTY-NOTICES.md')) {
  $srcDoc = Join-Path $root $doc
  if (Test-Path $srcDoc) { Copy-Item $srcDoc (Join-Path $dist $doc) -Force }
}

# cache-busting build stamp for CSS/JS
$indexPath = Join-Path $dist 'app\index.html'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$indexHtml = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$indexHtml = $indexHtml.Replace('__BUILD__', $stamp)
Set-Content -LiteralPath $indexPath -Value $indexHtml -Encoding UTF8 -NoNewline

Write-Host '==> compile host'
$cscArgs = @(  '/nologo',
  '/target:winexe',
  '/optimize+',
  '/platform:anycpu',
  "/out:$(Join-Path $dist 'LumenMark.exe')",
  "/win32manifest:$(Join-Path $src 'host\app.manifest')",
  "/r:$(Join-Path $lib 'Microsoft.Web.WebView2.Core.dll')",
  "/r:$(Join-Path $lib 'Microsoft.Web.WebView2.WinForms.dll')",
  '/r:System.dll',
  '/r:System.Drawing.dll',
  '/r:System.Windows.Forms.dll'
)
$ico = Join-Path $src 'host\app.ico'
if (Test-Path $ico) { $cscArgs += "/win32icon:$ico" }
$cscArgs += (Join-Path $src 'host\Program.cs')

& $csc $cscArgs
if ($LASTEXITCODE -ne 0) { throw "compile failed with exit code $LASTEXITCODE" }

$appConfig = Join-Path $src 'host\LumenMark.exe.config'
if (Test-Path $appConfig) { Copy-Item $appConfig (Join-Path $dist 'LumenMark.exe.config') -Force }

$exe = Join-Path $dist 'LumenMark.exe'
$exeInfo = Get-Item $exe
$dlls = (Get-ChildItem (Join-Path $dist '*.dll') | Measure-Object -Property Length -Sum).Sum
$appSize = (Get-ChildItem (Join-Path $dist 'app') -Recurse -File | Measure-Object -Property Length -Sum).Sum
$totalSize = $exeInfo.Length + $dlls + $appSize

Write-Host ''
Write-Host ('==> built {0}' -f $exeInfo.FullName)
Write-Host ('    exe   : {0:N0} bytes' -f $exeInfo.Length)
Write-Host ('    dlls  : {0:N0} bytes' -f $dlls)
Write-Host ('    assets: {0:N0} bytes' -f $appSize)
Write-Host ('    total : {0:N1} KB' -f ($totalSize / 1KB))

$zip = Join-Path $root 'LumenMark-win-x64.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $zip
Write-Host ('==> zip   : {0} ({1:N1} KB)' -f $zip, ((Get-Item $zip).Length / 1KB))
