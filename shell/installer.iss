; Instalador independiente del cascarón AegisDesk.
#define MyAppName "AegisDesk"
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#define MyAppPublisher "Antony Monge López"
#ifndef MyAppURL
  #define MyAppURL "https://aegisdesk.tonyml.com"
#endif
#ifndef LegalFile
  #define LegalFile "dist\legal\terms-0.1.0-draft.es.txt"
#endif
#ifndef TermsSha256
  #define TermsSha256 "41369a800a8001463b8b95f2c4358f5683c7888e6fe83df61d8386e281de3104"
#endif
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
UninstallDisplayIcon={app}\aegis_shell.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile={#LegalFile}

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "bin\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets\aegis_shell.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets\aegisdesk.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}\LICENSES"; Flags: ignoreversion
Source: "..\SECURITY.md"; DestDir: "{app}\LICENSES"; Flags: ignoreversion
Source: "..\docs\legal\terms-0.1.0-draft.es.md"; DestDir: "{app}\LICENSES"; Flags: ignoreversion
Source: "..\docs\legal\privacy-notice-0.1.0-draft.es.md"; DestDir: "{app}\LICENSES"; Flags: ignoreversion
Source: "..\docs\legal\LEGAL_VERSION.json"; DestDir: "{app}\LICENSES"; Flags: ignoreversion
Source: "..\docs\legal\retention-policy.md"; DestDir: "{app}\LICENSES"; Flags: ignoreversion
Source: "..\docs\legal\subprocessors.md"; DestDir: "{app}\LICENSES"; Flags: ignoreversion
Source: "..\docs\legal\incident-response.md"; DestDir: "{app}\LICENSES"; Flags: ignoreversion
Source: "..\docs\legal\organization-authorization-outline.md"; DestDir: "{app}\LICENSES"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\aegis_shell.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{group}\Términos y condiciones"; Filename: "{app}\LICENSES\terms-0.1.0-draft.es.md"
Name: "{group}\Aviso de privacidad"; Filename: "{app}\LICENSES\privacy-notice-0.1.0-draft.es.md"
Name: "{group}\Avisos de terceros"; Filename: "{app}\LICENSES\THIRD_PARTY_NOTICES.md"

[Dirs]
Name: "{localappdata}\AegisDesk"

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\AegisDesk"
Type: filesandordirs; Name: "{commondocs}\AegisDesk"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Configurar {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
type
  TSystemTime = record
    wYear, wMonth, wDayOfWeek, wDay, wHour, wMinute, wSecond, wMilliseconds: Word;
  end;

procedure GetSystemTime(var lpSystemTime: TSystemTime);
  external 'GetSystemTime@kernel32.dll stdcall';

function TwoDigits(Value: Word): String;
begin
  Result := IntToStr(Value);
  if Length(Result) = 1 then
    Result := '0' + Result;
end;

function UtcTimestamp: String;
var
  SystemTime: TSystemTime;
begin
  GetSystemTime(SystemTime);
  Result := IntToStr(SystemTime.wYear) + '-' + TwoDigits(SystemTime.wMonth) + '-' +
    TwoDigits(SystemTime.wDay) + 'T' + TwoDigits(SystemTime.wHour) + ':' +
    TwoDigits(SystemTime.wMinute) + ':' + TwoDigits(SystemTime.wSecond) + 'Z';
end;

procedure WriteInstallerAcceptance;
var
  DataDir, AcceptancePath, Content: String;
  ResultCode: Integer;
begin
  if WizardSilent then
    exit;
  DataDir := ExpandConstant('{localappdata}\AegisDesk');
  if not ForceDirectories(DataDir) then
    exit;
  if not Exec(ExpandConstant('{sys}\icacls.exe'),
    '"' + DataDir + '" /inheritance:r /grant:r "' + ExpandConstant('{username}') +
    '":(OI)(CI)F *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F', '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
    exit;
  AcceptancePath := AddBackslash(DataDir) + 'terms-acceptance.json';
  Content := '{"termsVersion":"0.1.0-draft","termsSha256":"' +
    '{#TermsSha256}' +
    '","acceptedAt":"' + UtcTimestamp + '","method":"installer"}';
  SaveStringToFile(AcceptancePath, Content, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    WriteInstallerAcceptance;
end;
