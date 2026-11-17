#ifndef AppVersion
  #define AppVersion "0.1.1"
#endif

[Setup]
AppId={{D763FD59-EB20-4A6D-83CE-118F7FA08873}
AppName=Lumen Mark
AppVersion={#AppVersion}
AppPublisher=Lumen Mark
AppPublisherURL=https://github.com/zkangping-glitch/lumen-mark
DefaultDirName={localappdata}\Programs\LumenMark
DefaultGroupName=Lumen Mark
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\output
OutputBaseFilename=LumenMark-Setup-{#AppVersion}-x64
SetupIconFile=..\src\host\app.ico
UninstallDisplayIcon={app}\LumenMark.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ChangesAssociations=yes
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#AppVersion}

[Languages]
Name: "chinesesimp"; MessagesFile: "ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopShortcut}"; GroupDescription: "{cm:ShortcutOptions}"; Flags: unchecked

[CustomMessages]
chinesesimp.DesktopShortcut=创建桌面快捷方式
chinesesimp.ShortcutOptions=快捷方式：
chinesesimp.DefaultApps=设置 Markdown 默认打开程序
chinesesimp.LaunchApp=启动 Lumen Mark
english.DesktopShortcut=Create a desktop shortcut
english.ShortcutOptions=Shortcuts:
english.DefaultApps=Choose Lumen Mark as the default Markdown app
english.LaunchApp=Launch Lumen Mark

[Files]
Source: "..\dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "LICENSE-Inno-Setup.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Lumen Mark"; Filename: "{app}\LumenMark.exe"
Name: "{group}\{cm:DefaultApps}"; Filename: "ms-settings:defaultapps?registeredAppUser=LumenMark"
Name: "{autodesktop}\Lumen Mark"; Filename: "{app}\LumenMark.exe"; Tasks: desktopicon

[Registry]
; Register a candidate application. Windows keeps the user's default selection.
Root: HKCU; Subkey: "Software\Classes\LumenMark.Markdown"; ValueType: string; ValueData: "Markdown document"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\LumenMark.Markdown\DefaultIcon"; ValueType: string; ValueData: """{app}\LumenMark.exe"",0"
Root: HKCU; Subkey: "Software\Classes\LumenMark.Markdown\shell\open\command"; ValueType: string; ValueData: """{app}\LumenMark.exe"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueType: string; ValueName: "LumenMark.Markdown"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\.markdown\OpenWithProgids"; ValueType: string; ValueName: "LumenMark.Markdown"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\.mdown\OpenWithProgids"; ValueType: string; ValueName: "LumenMark.Markdown"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\.mkd\OpenWithProgids"; ValueType: string; ValueName: "LumenMark.Markdown"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\Applications\LumenMark.exe"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "Lumen Mark"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\LumenMark.exe\DefaultIcon"; ValueType: string; ValueData: """{app}\LumenMark.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Applications\LumenMark.exe\shell\open\command"; ValueType: string; ValueData: """{app}\LumenMark.exe"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\Applications\LumenMark.exe\SupportedTypes"; ValueType: string; ValueName: ".md"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\LumenMark.exe\SupportedTypes"; ValueType: string; ValueName: ".markdown"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\LumenMark.exe\SupportedTypes"; ValueType: string; ValueName: ".mdown"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\LumenMark.exe\SupportedTypes"; ValueType: string; ValueName: ".mkd"; ValueData: ""
Root: HKCU; Subkey: "Software\LumenMark\Capabilities"; ValueType: string; ValueName: "ApplicationName"; ValueData: "Lumen Mark"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\LumenMark\Capabilities"; ValueType: string; ValueName: "ApplicationDescription"; ValueData: "Local Markdown reader and editor"
Root: HKCU; Subkey: "Software\LumenMark\Capabilities"; ValueType: string; ValueName: "ApplicationIcon"; ValueData: """{app}\LumenMark.exe"",0"
Root: HKCU; Subkey: "Software\LumenMark\Capabilities\FileAssociations"; ValueType: string; ValueName: ".md"; ValueData: "LumenMark.Markdown"
Root: HKCU; Subkey: "Software\LumenMark\Capabilities\FileAssociations"; ValueType: string; ValueName: ".markdown"; ValueData: "LumenMark.Markdown"
Root: HKCU; Subkey: "Software\LumenMark\Capabilities\FileAssociations"; ValueType: string; ValueName: ".mdown"; ValueData: "LumenMark.Markdown"
Root: HKCU; Subkey: "Software\LumenMark\Capabilities\FileAssociations"; ValueType: string; ValueName: ".mkd"; ValueData: "LumenMark.Markdown"
Root: HKCU; Subkey: "Software\RegisteredApplications"; ValueType: string; ValueName: "LumenMark"; ValueData: "Software\LumenMark\Capabilities"; Flags: uninsdeletevalue

[Run]
Filename: "ms-settings:defaultapps?registeredAppUser=LumenMark"; Description: "{cm:DefaultApps}"; Flags: shellexec nowait postinstall skipifsilent
Filename: "{app}\LumenMark.exe"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent unchecked
