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
Name: "{autodesktop}\Shop POS TEST 0.2.0-test.21r2"; Filename: "{app}\Shop POS TEST.exe"; WorkingDir: "{app}"
Name: "{userprograms}\SalamTech\Shop POS TEST 0.2.0-test.21r2\Shop POS TEST 0.2.0-test.21r2"; Filename: "{app}\Shop POS TEST.exe"; WorkingDir: "{app}"
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
  else if RegKeyExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{CCD98788-5456-4301-88BD-AB9310627BE6}_is1') then
    Result := 'The TEST.21r2 installer registration already exists; existing installation is retained.'
  else if DirExists(ExpandConstant('{localappdata}\Programs\SalamTech\0.2.0-test.21r2\ShopPOSTestData')) then
    Result := 'The TEST.21r2 data root already exists; existing data is retained.'
  else if DirExists(ExpandConstant('{userprograms}\SalamTech\Shop POS TEST 0.2.0-test.21r2')) or FileExists(ExpandConstant('{autodesktop}\Shop POS TEST 0.2.0-test.21r2.lnk')) then
    Result := 'A TEST.21r2 shortcut already exists; existing shortcuts are retained.'
  else if DirExists(Target) or FileExists(Target) then
    Result := 'This isolated TEST installation directory already exists. Existing files are retained. Close the application and review the prior or interrupted installation; do not overwrite or delete business data.'
  else
    Result := '';
end;
// No data-directory files, SQL, migrations, credential provisioning, trust changes,
// automatic launch, force-kill, [InstallDelete] or [UninstallDelete] operations.
