param(
 [Parameter(Mandatory=$true)][string]$VerifiedNextApp,
 [Parameter(Mandatory=$true)][string]$ElectronDirectory,
 [Parameter(Mandatory=$true)][string]$NodeExecutable,
 [Parameter(Mandatory=$true)][string]$NodeLicense,
 [Parameter(Mandatory=$true)][string]$InnoCompiler,
 [Parameter(Mandatory=$true)][string]$OutputDirectory,
 [string]$VerifiedDependencySource,
 [string]$Release='0.2.0-test.21r2',
 [switch]$OfflineDependencies
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
if(-not $OutputDirectory.StartsWith($projectRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $OutputDirectory)){throw 'A new workspace artifact directory is required; previous attempts remain retained.'}
if($Release -ne '0.2.0-test.21r2'){throw 'This normal-launch installer identity is reserved for TEST.21r2.'}
function RequireHash([string]$File,[string]$Expected){if((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -ne $Expected){throw ('Reviewed tool/notice hash mismatch: '+[IO.Path]::GetFileName($File))}}
RequireHash $NodeExecutable '86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6'
RequireHash (Join-Path $ElectronDirectory 'electron.exe') 'a547b53fbee4dd4adca1a88e215270d06f7cb1e7d333ee402fb3dd677392a87a'
RequireHash $InnoCompiler 'e0f9f1dc32032650c6629f6dee41eb6d20ba140e4e3c07c25d8a24f9ba781644'
RequireHash $NodeLicense '5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace'
if(-not(Test-Path -LiteralPath (Join-Path $VerifiedNextApp '.next/BUILD_ID'))){throw 'An existing verified production-mode Next build is required.'}
$installerScript=Join-Path $PSScriptRoot 'installer.iss'
$installerSource=Get-Content -LiteralPath $installerScript -Raw
$appIdMatch=[regex]::Match($installerSource,'(?m)^AppId=\{\{(?<id>[0-9a-fA-F-]{36})\}\r?$')
if(-not $appIdMatch.Success){throw 'Unique isolated TEST AppId required.'}
$installerAppId=[Guid]::Parse($appIdMatch.Groups['id'].Value)
if($installerAppId -eq [Guid]::Empty -or $installerAppId.ToString('D') -ine 'ccd98788-5456-4301-88bd-ab9310627be6' -or $installerAppId.ToString('D') -ieq '3758a526-7a2b-423d-9a04-487c6d47b3d0' -or $installerAppId.ToString('D') -ieq 'fd015647-7e03-45c9-a0fc-bc74d7fd5eb2' -or $installerAppId.ToString('D') -ieq '2a059cbc-70e5-4bd8-a850-9a8633ddf1c7' -or $installerAppId.ToString('D') -ieq 'd2f97747-843b-4fb6-8e58-61b1bdf80f9e' -or $installerAppId.ToString('D') -ieq '5d4f24fc-f90d-4b04-b16a-a1533756dcc3'){throw 'TEST.21r2 requires its reviewed AppId, distinct from TEST.17, TEST.18, TEST.19 and TEST.20.'}
$uninstallKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{'+$installerAppId.ToString('D').ToUpperInvariant()+'}_is1'
if(Test-Path -LiteralPath $uninstallKey){throw 'The isolated TEST uninstall identity already exists.'}
$localAppData=[Environment]::GetFolderPath('LocalApplicationData')
$installRoot=Join-Path $localAppData ('Programs\SalamTech\ShopPOSTest\'+$Release)
$dataRoot=Join-Path $localAppData ('Programs\SalamTech\'+$Release+'\ShopPOSTestData')
if((Join-Path $dataRoot 'test-results\sqlite-b1b-part1\b999999999').Length -gt 120){throw 'Protected TEST backup path budget exceeded.'}
if(Test-Path -LiteralPath $installRoot){throw 'The isolated TEST installation directory already exists; existing files are retained.'}
if(Test-Path -LiteralPath $dataRoot){throw 'The TEST.21r2 persistent data root already exists; existing data is retained.'}
if(Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Shop POS TEST 0.2.0-test.21r2.lnk')){throw 'The TEST.21r2 desktop shortcut already exists; existing shortcuts are retained.'}
$startMenuRoot=Join-Path ([Environment]::GetFolderPath('Programs')) 'SalamTech\Shop POS TEST 0.2.0-test.21r2'
if(Test-Path -LiteralPath $startMenuRoot){throw 'The TEST.21r2 Start Menu group already exists; existing shortcuts are retained.'}
$dataParent=Join-Path $localAppData 'Programs\SalamTech';$parentInfo=Get-Item -LiteralPath $dataParent;if(-not $parentInfo.PSIsContainer -or ($parentInfo.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'The existing per-user TEST parent is unavailable or redirected.'}
if($installerSource -match '(?im)^\[Run\]' -or $installerSource -match '(?im)^\[(?:InstallDelete|UninstallDelete)\]'){throw 'Isolated TEST installer must not auto-run or delete files.'}
if($installerSource -notmatch '(?im)^DefaultDirName=\{localappdata\}\\Programs\\SalamTech\\ShopPOSTest\\\{#AppRelease\}\r?$' -or $installerSource -notmatch '(?im)^UninstallDisplayName=Shop POS TEST \{#AppRelease\}.*\r?$') {throw 'Version-specific TEST destination and uninstaller identity required.'}
$installerLines=$installerSource -split '\r?\n';$iconStart=[Array]::IndexOf($installerLines,'[Icons]');if($iconStart -lt 0){throw 'The isolated TEST.21r2 desktop shortcut is required.'}
$iconLines=@();for($index=$iconStart+1;$index -lt $installerLines.Length -and $installerLines[$index] -notmatch '^\s*\[';$index++){if(-not [string]::IsNullOrWhiteSpace($installerLines[$index]) -and $installerLines[$index] -notmatch '^\s*;'){$iconLines+=([string]$installerLines[$index]).Trim()}}
$expectedIcons=@('Name: "{autodesktop}\Shop POS TEST 0.2.0-test.21r2"; Filename: "{app}\Shop POS TEST.exe"; WorkingDir: "{app}"','Name: "{userprograms}\SalamTech\Shop POS TEST 0.2.0-test.21r2\Shop POS TEST 0.2.0-test.21r2"; Filename: "{app}\Shop POS TEST.exe"; WorkingDir: "{app}"')
if($iconLines.Count -ne 2 -or $iconLines[0] -cne $expectedIcons[0] -or $iconLines[1] -cne $expectedIcons[1]){throw 'Only the reviewed direct TEST.21r2 desktop and Start Menu shortcuts are allowed.'}
$artifactParent=[IO.Path]::GetDirectoryName($OutputDirectory);[void][IO.Directory]::CreateDirectory($artifactParent)
$evidence=Join-Path $artifactParent ('build-evidence-'+[guid]::NewGuid());[void][IO.Directory]::CreateDirectory($evidence)
function InvokeReviewed([string]$Executable,[string[]]$Arguments,[string]$Log){
 # Native stderr is evidence, not a PowerShell terminating exception.
 $prior=$ErrorActionPreference;$ErrorActionPreference='Continue'
 try{& $Executable @Arguments 2>&1 | ForEach-Object {$_.ToString()} | Set-Content -Encoding UTF8 -LiteralPath $Log;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$prior}
 if($code -ne 0){throw ('Build stopped; retained diagnostic: '+$Log)}
}
Push-Location $projectRoot
try{
 InvokeReviewed $NodeExecutable @((Join-Path $PSScriptRoot 'build-payload.mjs'),$VerifiedNextApp,$ElectronDirectory,$NodeExecutable,$OutputDirectory) (Join-Path $evidence 'assemble.log')
 $desktopPackageFile=Join-Path $OutputDirectory 'resources/app/package.json'
 $desktopPackage=Get-Content -LiteralPath $desktopPackageFile -Raw | ConvertFrom-Json
 if($desktopPackage.name -ne 'shop-pos-desktop-test' -or $desktopPackage.version -cne $Release){throw 'Verified TEST Electron package metadata required.'}
 $desktopPackage.version=$Release
 $desktopPackageJson=($desktopPackage | ConvertTo-Json -Compress)+[Environment]::NewLine
 [IO.File]::WriteAllText($desktopPackageFile,$desktopPackageJson,[Text.UTF8Encoding]::new($false))
 if((Get-Content -LiteralPath $desktopPackageFile -Raw | ConvertFrom-Json).version -ne $Release){throw 'Embedded TEST release version did not match installer release.'}
 $payload=Join-Path $OutputDirectory 'resources/payload'
 if($VerifiedDependencySource){$dependencySource=[IO.Path]::GetFullPath($VerifiedDependencySource)}else{
  $dependencySource=Join-Path $evidence 'locked-source';[void][IO.Directory]::CreateDirectory($dependencySource)
  Copy-Item -LiteralPath (Join-Path $projectRoot 'web/package.json'),(Join-Path $projectRoot 'web/package-lock.json') -Destination $dependencySource
  Push-Location $dependencySource
  try{
   $npmCommand=Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'nodejs/node_modules/npm/bin/npm-cli.js'
   if(-not(Test-Path -LiteralPath $npmCommand)){throw 'Reviewed local npm CLI required for build only.'}
   $arguments=@($npmCommand,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--update-notifier=false');if($OfflineDependencies){$arguments+='--offline'}
   InvokeReviewed $NodeExecutable $arguments (Join-Path $evidence 'locked-dependencies.log')
  }finally{Pop-Location}
 }
 # Optional peer flags in the source lock can retain test tools or even omit
 # direct production providers. Copy the exact locked production graph instead.
 InvokeReviewed $NodeExecutable @((Join-Path $PSScriptRoot 'runtime-dependencies.mjs'),$dependencySource,$payload,(Join-Path $projectRoot 'web')) (Join-Path $evidence 'runtime-graph.log')
 $native='node_modules/better-sqlite3/prebuilds/win32-x64.node'
 RequireHash (Join-Path $payload $native) (Get-FileHash -LiteralPath (Join-Path $projectRoot ('web/'+$native))).Hash
 Copy-Item -LiteralPath $NodeLicense -Destination (Join-Path $OutputDirectory 'NODE-LICENSE.txt')
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'THIRD-PARTY-NOTICES.txt') -Destination $OutputDirectory
 InvokeReviewed $NodeExecutable @((Join-Path $PSScriptRoot 'patch-next-windows-manifests.mjs'),$payload) (Join-Path $evidence 'next-windows-manifest-correction.log')
 InvokeReviewed $NodeExecutable @((Join-Path $PSScriptRoot 'seal-payload.mjs'),$OutputDirectory) (Join-Path $evidence 'seal.log')
 InvokeReviewed $NodeExecutable @('-e','require(process.argv[1]).verifyPayload(process.argv[2]).then(v=>console.log(JSON.stringify(v))).catch(()=>{process.exitCode=1})',(Join-Path $PSScriptRoot 'payload-integrity.cjs'),(Join-Path $OutputDirectory 'resources')) (Join-Path $evidence 'verify-payload.log')
 $installers=Join-Path $artifactParent ('installers-'+[guid]::NewGuid());[void][IO.Directory]::CreateDirectory($installers)
 InvokeReviewed $InnoCompiler @('/Qp',('/DPayload='+$OutputDirectory),('/DOutput='+$installers),('/DAppRelease='+$Release),$installerScript) (Join-Path $evidence 'installer.log')
 @{format='SHOP_POS_UNSIGNED_TEST_BUILD_V1';release=$Release;appId=$installerAppId.ToString('B').ToUpperInvariant();installRoot=$installRoot;dataRoot=$dataRoot;shortcutPolicy='VERSIONED_DESKTOP_AND_STARTMENU_SHORTCUTS';dataRootPolicy='LOCALAPPDATA_PROGRAMS_SALAMTECH_VERSIONED_TEST21R2';bundle=$OutputDirectory;installers=$installers;evidence=$evidence;productionActivation=$false} | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $evidence 'build-result.json')
 Get-Content -LiteralPath (Join-Path $evidence 'build-result.json')
}finally{Pop-Location}
