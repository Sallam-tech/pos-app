#ifndef Payload
  #error Payload must name the verified TEST application directory
#endif
#ifndef Output
  #error Output must name the artifact output directory
#endif
#ifndef AppRelease
  #define AppRelease "0.2.0-eval.3"
#endif
[Setup]
AppId={{8d8f4234-248f-42b4-a35e-e487166eaf35}
AppName=Shop POS
AppVersion={#AppRelease}
AppPublisher=SalamTech
DefaultDirName={localappdata}\Programs\SalamTech\ShopPOSEval\{#AppRelease}
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible and not arm64
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19045
OutputDir={#Output}
OutputBaseFilename=ShopPOS-CLIENT-EVALUATION-{#AppRelease}-win-x64-setup
Compression=lzma2/fast
SolidCompression=yes
LZMANumBlockThreads=1
LZMADictionarySize=16384
CloseApplications=no
RestartApplications=no
DisableProgramGroupPage=yes
SetupMutex=Local\ShopPOS-Client-Evaluation-Installer-v1
AppMutex=Local\ShopPOS-Client-Evaluation-Desktop-v1
UninstallDisplayName=Shop POS (CLIENT EVALUATION {#AppRelease}; isolated data retained)
UninstallDisplayIcon={app}\resources\app\shop-logo.ico
InfoBeforeFile={#Payload}\EVALUATION-README.txt
WizardStyle=modern
SetupIconFile={#Payload}\resources\app\shop-logo.ico
[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autodesktop}\Shop POS"; Filename: "{app}\Shop POS.exe"; WorkingDir: "{app}"; IconFilename: "{app}\resources\app\shop-logo.ico"
Name: "{userprograms}\SalamTech\Shop POS"; Filename: "{app}\Shop POS.exe"; WorkingDir: "{app}"; IconFilename: "{app}\resources\app\shop-logo.ico"
[Code]
function InitializeUninstall(): Boolean;
begin
  CreateMutex('Local\ShopPOS-Client-Evaluation-Installer-v1');
  Result := True;
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
var Target: String;
begin
  Target := ExpandConstant('{app}');
  if CompareText(Target, ExpandConstant('{localappdata}\Programs\SalamTech\ShopPOSEval\0.2.0-eval.3')) <> 0 then
    Result := 'Only the isolated CLIENT EVALUATION installation path is allowed.'
  else if Length(ExpandConstant('{localappdata}\Programs\SalamTech\0.2.0-eval.3\ShopPOSEvalData\test-results\sqlite-b1b-part1\b999999999')) > 120 then
    Result := 'Protected TEST backup path budget exceeded.'
  else if RegKeyExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{8D8F4234-248F-42B4-A35E-E487166EAF35}_is1') then
    Result := 'The CLIENT EVALUATION installer registration already exists; existing installation is retained.'
  else if DirExists(ExpandConstant('{localappdata}\Programs\SalamTech\0.2.0-eval.3\ShopPOSEvalData')) then
    Result := 'The CLIENT EVALUATION data root already exists; existing data is retained.'
  else if FileExists(ExpandConstant('{userprograms}\SalamTech\Shop POS.lnk')) or FileExists(ExpandConstant('{autodesktop}\Shop POS.lnk')) then
    Result := 'A CLIENT EVALUATION shortcut already exists; existing shortcuts are retained.'
  else if DirExists(Target) or FileExists(Target) then
    Result := 'This isolated evaluation installation directory already exists. Existing files are retained. Close the application and review the prior or interrupted installation; do not overwrite or delete business data.'
  else
    Result := '';
end;
// No data-directory files, SQL, migrations, credential provisioning, trust changes,
// automatic launch, force-kill, [InstallDelete] or [UninstallDelete] operations.
