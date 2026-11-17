$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$installer = Get-ChildItem (Join-Path $root 'output\LumenMark-Setup-*-x64.exe') | Select-Object -First 1
if (-not $installer) { throw 'Installer not found' }
$target = Join-Path $env:TEMP 'Lumen Mark install test'
$classes = 'HKCU:\Software\Classes'
$otherApp = 'LumenMarkInstallerTest.Other'
$openWith = "$classes\.md\OpenWithProgids"
New-Item $openWith -Force | Out-Null
New-ItemProperty $openWith -Name $otherApp -Value '' -PropertyType String -Force | Out-Null
$defaultBefore = (Get-Item "$classes\.md").GetValue('')
$argsList = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=`"$target`"")
try {
    # Run twice to verify an upgrade keeps one installation and valid registrations.
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        $process = Start-Process $installer.FullName -ArgumentList $argsList -PassThru -Wait
        if ($process.ExitCode -ne 0) { throw "Installation failed: $($process.ExitCode)" }
        foreach ($file in @('LumenMark.exe', 'app.ico', 'app\index.html', 'Microsoft.Web.WebView2.Core.dll', 'WebView2Loader.dll')) {
            if (-not (Test-Path (Join-Path $target $file))) { throw "Missing installed file: $file" }
        }
        $command = (Get-Item "$classes\LumenMark.Markdown\shell\open\command").GetValue('')
        if ($command -ne "`"$target\LumenMark.exe`" `"%1`"") { throw "Incorrect open command: $command" }
        foreach ($ext in @('.md', '.markdown', '.mdown', '.mkd')) {
            if ((Get-Item "$classes\$ext\OpenWithProgids").GetValue('LumenMark.Markdown', $null) -ne '') { throw "Missing Open With entry: $ext" }
            if ((Get-Item 'HKCU:\Software\LumenMark\Capabilities\FileAssociations').GetValue($ext) -ne 'LumenMark.Markdown') { throw "Missing default app capability: $ext" }
        }
        if ((Get-Item 'HKCU:\Software\RegisteredApplications').GetValue('LumenMark') -ne 'Software\LumenMark\Capabilities') { throw 'Missing registered application' }
        if ((Get-Item "$classes\.md").GetValue('') -ne $defaultBefore) { throw 'Installer changed the existing default' }
        $group = Join-Path ([Environment]::GetFolderPath('Programs')) 'Lumen Mark'
        $shell = New-Object -ComObject WScript.Shell
        $settingsShortcut = @(Get-ChildItem $group -Filter '*.lnk' | ForEach-Object { $shell.CreateShortcut($_.FullName) } | Where-Object { $_.Arguments -eq 'ms-settings:defaultapps?registeredAppUser=LumenMark' })
        if ($settingsShortcut.Count -ne 1 -or $settingsShortcut[0].TargetPath -notlike '*\explorer.exe') { throw 'Default apps shortcut is invalid' }
    }
    $uninstall = Start-Process (Join-Path $target 'unins000.exe') -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -PassThru -Wait
    if ($uninstall.ExitCode -ne 0) { throw "Uninstall failed: $($uninstall.ExitCode)" }
    if (Test-Path (Join-Path $target 'LumenMark.exe')) { throw 'Executable left after uninstall' }
    if (Test-Path "$classes\LumenMark.Markdown") { throw 'ProgID left after uninstall' }
    if (Test-Path "$classes\Applications\LumenMark.exe") { throw 'Open With application left after uninstall' }
    if (Test-Path 'HKCU:\Software\LumenMark\Capabilities') { throw 'Capabilities left after uninstall' }
    if ((Get-Item 'HKCU:\Software\RegisteredApplications').GetValue('LumenMark', $null)) { throw 'Registered app left after uninstall' }
    foreach ($ext in @('.md', '.markdown', '.mdown', '.mkd')) {
        if ((Get-Item "$classes\$ext\OpenWithProgids").GetValueNames() -contains 'LumenMark.Markdown') { throw "Open With value left: $ext" }
    }
    if ((Get-Item $openWith).GetValueNames() -notcontains $otherApp) { throw 'Uninstall removed another application' }
    if ((Get-Item "$classes\.md").GetValue('') -ne $defaultBefore) { throw 'Uninstall changed the existing default' }
    Write-Host 'PASS: install, upgrade, quoted file association, default app registration, uninstall, other app preservation'
} finally {
    Remove-ItemProperty $openWith -Name $otherApp -ErrorAction SilentlyContinue
}
