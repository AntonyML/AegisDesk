; Instalador independiente del cascarón AegisDesk.
#define MyAppName "AegisDesk"
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#define MyAppPublisher "Soporte SIDC"
#define MyAppURL "https://aegisdesk.example.invalid"
#define MyAppExeName "AegisDesk.exe"

[Setup]
AppId={{B9C8DE4C-2B4D-4D89-A8A9-9F4B2AC92B47}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\AegisDesk
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=dist
OutputBaseFilename=AegisDesk-Setup-v{#MyAppVersion}
SetupIconFile=assets\aegisdesk.ico
UninstallDisplayIcon={app}\aegisdesk.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "bin\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets\aegisdesk.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\aegisdesk.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Configurar {#MyAppName}"; Flags: nowait postinstall skipifsilent
