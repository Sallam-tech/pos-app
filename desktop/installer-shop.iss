#ifndef Payload
  #error Payload must name the verified Shop POS application directory
#endif
#ifndef Output
  #error Output must name the artifact output directory
#endif
#ifndef AppRelease
  #define AppRelease "1.0.0"
#endif
[Setup]
AppId={{42df49bf-db87-4125-8b4c-98232d8761ce}
AppName=Shop POS
AppVersion={#AppRelease}
AppPublisher=SalamTech
DefaultDirName={localappdata}\Programs\SalamTech\ShopPOS\{#AppRelease}
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible and not arm64
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19045
OutputDir={#Output}
OutputBaseFilename=ShopPOS-{#AppRelease}-win-x64-setup
Compression=lzma2/fast
SolidCompression=yes
LZMANumBlockThreads=1
LZMADictionarySize=16384
CloseApplications=no
RestartApplications=no
DisableProgramGroupPage=yes
SetupMutex=Local\ShopPOS-Shop-Installer-v1
AppMutex=Local\ShopPOS-Shop-Desktop-v1
UninstallDisplayName=Shop POS {#AppRelease} (shop data retained)
UninstallDisplayIcon={app}\resources\app\shop-logo.ico
InfoBeforeFile={#Payload}\SHOP-README.txt
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
  CreateMutex('Local\ShopPOS-Shop-Installer-v1');
  Result := True;
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
var Target: String;
begin
  Target := ExpandConstant('{app}');
  if CompareText(Target, ExpandConstant('{localappdata}\Programs\SalamTech\ShopPOS\1.0.0')) <> 0 then
    Result := 'Only the Shop POS 1.0.0 installation path is allowed.'
  else if Length(ExpandConstant('{localappdata}\Programs\SalamTech\ShopPOSData\1.0.0\test-results\sqlite-b1b-part1\b999999999')) > 120 then
    Result := 'Protected shop backup path budget exceeded.'
  else if RegKeyExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{42DF49BF-DB87-4125-8B4C-98232D8761CE}_is1') then
    Result := 'Shop POS 1.0.0 is already installed; existing installation and shop data are retained.'
  else if DirExists(ExpandConstant('{localappdata}\Programs\SalamTech\ShopPOSData\1.0.0')) then
    Result := 'The Shop POS data folder already exists; existing shop data is retained.'
  else if FileExists(ExpandConstant('{userprograms}\SalamTech\Shop POS.lnk')) or FileExists(ExpandConstant('{autodesktop}\Shop POS.lnk')) then
    Result := 'A Shop POS shortcut already exists; existing shortcuts are retained.'
  else if DirExists(Target) or FileExists(Target) then
    Result := 'The Shop POS installation folder already exists. Existing files are retained. Close Shop POS and review the prior installation; do not overwrite shop data.'
  else
    Result := '';
end;
// No data-directory files, SQL, migrations, credential provisioning, trust changes,
// automatic launch, force-kill, [InstallDelete] or [UninstallDelete] operations.
