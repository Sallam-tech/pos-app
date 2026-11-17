#ifndef Payload
  #error Payload must name the verified TEST application directory
#endif
#ifndef Output
  #error Output must name the artifact output directory
#endif
#ifndef AppRelease
  #define AppRelease "0.2.0-test.1"
#endif
[Setup]
AppId={{D2F97747-843B-4FB6-8E58-61B1BDF80F9E}
AppName=Shop POS TEST
AppVersion={#AppRelease}
AppPublisher=SalamTech
DefaultDirName={localappdata}\Programs\SalamTech\ShopPOSTest
DefaultGroupName=Shop POS TEST
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
UninstallDisplayName=Shop POS TEST (business/recovery data retained)
UninstallDisplayIcon={app}\versions\{#AppRelease}\Shop POS TEST.exe
InfoBeforeFile={#Payload}\TEST-README.txt
WizardStyle=modern
[Files]
Source: "{#Payload}\*"; DestDir: "{app}\versions\{#AppRelease}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\Shop POS TEST"; Filename: "{app}\versions\{#AppRelease}\Shop POS TEST.exe"
[Code]
function InitializeUninstall(): Boolean;
begin
  CreateMutex('Local\ShopPOS-Disposable-Installer-v1');
  Result := True;
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
var Target: String;
begin
  Target := ExpandConstant('{app}\versions\{#AppRelease}');
  if DirExists(Target) then
    Result := 'This TEST version directory already exists. Existing files are retained. Close the application and review the prior or interrupted installation; do not overwrite or delete business data.'
  else
    Result := '';
end;
// No data-directory files, SQL, migrations, credential provisioning, trust changes,
// automatic launch, force-kill, [InstallDelete] or [UninstallDelete] operations.
