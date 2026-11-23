#ifndef Payload
  #error Payload must name the verified TEST application directory
#endif
#ifndef Output
  #error Output must name the artifact output directory
#endif
#ifndef AppRelease
  #define AppRelease "0.2.0-test.21r2"
#endif
[Setup]
AppId={{ccd98788-5456-4301-88bd-ab9310627be6}
AppName=Shop POS TEST {#AppRelease}
AppVersion={#AppRelease}
AppPublisher=SalamTech
DefaultDirName={localappdata}\Programs\SalamTech\ShopPOSTest\{#AppRelease}
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible and not arm64
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19045
OutputDir={#Output}
OutputBaseFilename=ShopPOS-TEST-{#AppRelease}-security-fix-20261123-win-x64-setup
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
UninstallDisplayIcon={app}\resources\app\shop-logo.ico
InfoBeforeFile={#Payload}\TEST-README.txt
WizardStyle=modern
SetupIconFile={#Payload}\resources\app\shop-logo.ico
[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autodesktop}\Shop POS TEST 0.2.0-test.21r2"; Filename: "{app}\Shop POS TEST.exe"; WorkingDir: "{app}"; IconFilename: "{app}\resources\app\shop-logo.ico"
Name: "{userprograms}\SalamTech\Shop POS TEST 0.2.0-test.21r2\Shop POS TEST 0.2.0-test.21r2"; Filename: "{app}\Shop POS TEST.exe"; WorkingDir: "{app}"; IconFilename: "{app}\resources\app\shop-logo.ico"
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
  if CompareText(Target, ExpandConstant('{localappdata}\Programs\SalamTech\ShopPOSTest\0.2.0-test.21r2')) <> 0 then
    Result := 'Only the isolated TEST.21r2 installation path is allowed.'
  else if Length(ExpandConstant('{localappdata}\Programs\SalamTech\0.2.0-test.21r2\ShopPOSTestData\test-results\sqlite-b1b-part1\b999999999')) > 120 then
    Result := 'Protected TEST backup path budget exceeded.'
  else if not RegKeyExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{CCD98788-5456-4301-88BD-AB9310627BE6}_is1') then
    Result := 'Existing TEST.21r2 registration is required for this code-only update.'
  else if not FileExists(ExpandConstant('{localappdata}\Programs\SalamTech\0.2.0-test.21r2\ShopPOSTestData\test-results\sqlite-b1b-part1\11c6f975-8e7d-4d54-ab80-1e61166a8aad\d\shop.sqlite3')) then
    Result := 'Existing TEST.21r2 data is required. No database or credentials are provisioned by this update.'
  else if not FileExists(ExpandConstant('{localappdata}\Programs\SalamTech\ShopPOSTest\0.2.0-test.21r2-retained-17892516\resources\payload\manifest.json')) then
    Result := 'The verified previous program must be retained before installation.'
  else if CompareText(GetSHA256OfFile(ExpandConstant('{localappdata}\Programs\SalamTech\ShopPOSTest\0.2.0-test.21r2-retained-17892516\resources\payload\manifest.json')), '178925160dc46d0fd338ed83ae9532acc9bbc8341e536dc6467efa6fc9b5c7ab') <> 0 then
    Result := 'Retained program identity mismatch.'
  else if DirExists(Target) or FileExists(Target) then
    Result := 'This isolated TEST installation directory already exists. Existing files are retained. Close the application and review the prior or interrupted installation; do not overwrite or delete business data.'
  else
    Result := '';
end;
// No data-directory files, SQL, migrations, credential provisioning, trust changes,
// automatic launch, force-kill, [InstallDelete] or [UninstallDelete] operations.
