#ifndef Payload
  #error Payload must name the verified TEST application directory
#endif
#ifndef Output
  #error Output must name the artifact output directory
#endif
#ifndef AppRelease
  #define AppRelease "0.2.0-test.19"
#endif
[Setup]
AppId={{2a059cbc-70e5-4bd8-a850-9a8633ddf1c7}
AppName=Shop POS TEST {#AppRelease}
AppVersion={#AppRelease}
AppPublisher=SalamTech
DefaultDirName={localappdata}\Programs\SalamTech\ShopPOSTest\{#AppRelease}
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible and not arm64
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19045
OutputDir={#Output}
OutputBaseFilename=ShopPOS-TEST-{#AppRelease}-win-x64-setup
Compression=lzma2/fast
SolidCompression=yes
LZMANumBlockThreads=1
LZMADictionarySize=16384
CloseApplications=no
RestartApplications=no
DisableProgramGroupPage=yes
SetupMutex=Local\ShopPOS-Disposable-Installer-v1
AppMutex=Local\ShopPOS-Disposable-Desktop-v1
UninstallDisplayName=Shop POS TEST {#AppRelease} (isolated TEST data retained)
UninstallDisplayIcon={app}\Shop POS TEST.exe
InfoBeforeFile={#Payload}\TEST-README.txt
WizardStyle=modern
[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autodesktop}\Shop POS TEST 0.2.0-test.19"; Filename: "{app}\Shop POS TEST.exe"; WorkingDir: "{app}"
[Code]
function InitializeUninstall(): Boolean;
begin
  CreateMutex('Local\ShopPOS-Disposable-Installer-v1');
  Result := True;
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
var Target: String;
begin
  Target := ExpandConstant('{app}');
  if DirExists(Target) then
    Result := 'This isolated TEST installation directory already exists. Existing files are retained. Close the application and review the prior or interrupted installation; do not overwrite or delete business data.'
  else
    Result := '';
end;
// No data-directory files, SQL, migrations, credential provisioning, trust changes,
// automatic launch, force-kill, [InstallDelete] or [UninstallDelete] operations.
