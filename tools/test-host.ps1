$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
foreach ($dll in @('Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll')) {
    [void][Reflection.Assembly]::LoadFrom((Join-Path $dist $dll))
}
$assembly = [Reflection.Assembly]::LoadFrom((Join-Path $dist 'LumenMark.exe'))
$type = $assembly.GetType('LumenMark.MainForm', $true)
$flags = [Reflection.BindingFlags]'Instance,NonPublic'
$form = [Runtime.Serialization.FormatterServices]::GetUninitializedObject($type)
$rootPath = Join-Path $env:TEMP 'lumen-path-tests'
$type.GetField('mdDir', $flags).SetValue($form, $rootPath)
$resolve = $type.GetMethod('ResolveInsideMdDir', $flags)
foreach ($relative in @('../lumen-path-tests-private/secret.png', '../secret.png')) {
    if ($null -ne $resolve.Invoke($form, @($relative))) { throw "Escaped document folder: $relative" }
}
$expected = Join-Path $rootPath 'assets\image.png'
if ($resolve.Invoke($form, @('assets/image.png')) -ne $expected) { throw 'Valid image path rejected' }
$type.GetField('mdDir', $flags).SetValue($form, [IO.Path]::GetPathRoot($rootPath))
if ($null -eq $resolve.Invoke($form, @('assets/image.png'))) { throw 'Drive root rejected' }
Write-Host 'PASS: image directory boundaries, sibling prefix rejection, drive roots'
