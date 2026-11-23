param(
 [Parameter(Mandatory=$true)][string]$Installer,
 [Parameter(Mandatory=$true)][string]$InstallerSha256,
 [Parameter(Mandatory=$true)][string]$Bundle,
 [Parameter(Mandatory=$true)][string]$Evidence
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$project='D:\pos'
$localAppData=[Environment]::GetFolderPath('LocalApplicationData')
$node=Join-Path $project 'desktop\test-results\app-test17-corrected-20261118\resources\runtime\node.exe'
$install=[IO.Path]::GetFullPath((Join-Path $localAppData 'Programs\SalamTech\ShopPOSTest\0.2.0-test.21r2'))
$retained=[IO.Path]::GetFullPath((Join-Path $localAppData 'Programs\SalamTech\ShopPOSTest\0.2.0-test.21r2-retained-17892516'))
$data=[IO.Path]::GetFullPath((Join-Path $localAppData 'Programs\SalamTech\0.2.0-test.21r2\ShopPOSTestData'))
$oldManifest='178925160dc46d0fd338ed83ae9532acc9bbc8341e536dc6467efa6fc9b5c7ab'
function Hash([string]$file){(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
function AssertPlainPath([string]$target){
 $item=Get-Item -LiteralPath $target -Force
 while($null -ne $item){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected update path denied'};if($item -is [IO.FileInfo]){$item=$item.Directory}else{$item=$item.Parent}}
}
function Verify([string]$directory,[string]$manifest,[string]$log){
 $prior=$ErrorActionPreference;$ErrorActionPreference='Continue'
 try{& $node (Join-Path $PSScriptRoot 'verify-update-artifact.cjs') $directory $manifest 2>&1 | ForEach-Object {$_.ToString()} | Set-Content -Encoding UTF8 -LiteralPath $log;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$prior}
 if($code -ne 0){throw 'Full program payload verification failed. Existing data retained.'}
}
function DataSnapshot {
 $rows=@();foreach($file in @(Get-ChildItem -LiteralPath $data -Recurse -File -Force)){
  if($file.FullName.StartsWith($data+'\browser\',[StringComparison]::OrdinalIgnoreCase)){continue}
  AssertPlainPath $file.FullName
  $rows+=@{path=$file.FullName.Substring($data.Length+1);bytes=$file.Length;sha256=(Hash $file.FullName)}
 }; return ($rows|Sort-Object {$_.path}|ConvertTo-Json -Compress -Depth 3)
}
if((Hash $node) -cne '86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6'){throw 'Pinned Node verification failed'}
foreach($name in @('Installer','Bundle','Evidence')){$value=[IO.Path]::GetFullPath((Get-Variable $name -ValueOnly));if(-not $value.StartsWith('D:\pos\build\usability-correction-1795416091185\',[StringComparison]::OrdinalIgnoreCase)){throw 'Exact reviewed update artifact boundary required'};Set-Variable -Name $name -Value $value}
AssertPlainPath $Installer;AssertPlainPath $Bundle;AssertPlainPath $install;AssertPlainPath $data
if(Test-Path -LiteralPath $Evidence){throw 'New installation evidence directory required'}
[void][IO.Directory]::CreateDirectory($Evidence)
if((Hash $Installer) -cne $InstallerSha256.ToLowerInvariant()){throw 'Installer hash mismatch'}
if((Hash (Join-Path $install 'resources\payload\manifest.json')) -cne $oldManifest){throw 'Reviewed original program mismatch'}
$newManifest=Hash (Join-Path $Bundle 'resources\payload\manifest.json')
if($newManifest -ceq $oldManifest){throw 'Fresh updated payload required'}
if([IO.Path]::GetDirectoryName($install) -cne [IO.Path]::GetDirectoryName($retained) -or $retained -cne ($install+'-retained-17892516') -or $data.StartsWith($install+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Program/data preservation boundary failure'}
if(Test-Path -LiteralPath $retained){throw 'Retained program path exists; do not overwrite it'}
$registration=Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{CCD98788-5456-4301-88BD-AB9310627BE6}_is1'
if($registration.InstallLocation.TrimEnd('\') -ine $install){throw 'Registration path mismatch'}
if(-not(Test-Path -LiteralPath (Join-Path $data 'test-results\sqlite-b1b-part1\11c6f975-8e7d-4d54-ab80-1e61166a8aad\d\shop.sqlite3'))){throw 'Original SQLite database missing; no adoption/reset allowed'}
$maintenance=[Threading.Mutex]::new($false,'Local\ShopPOS-Disposable-Installer-v1')
try {
 $application=$null;try{$application=[Threading.Mutex]::OpenExisting('Local\ShopPOS-Disposable-Desktop-v1')}catch [Threading.WaitHandleCannotBeOpenedException]{}
 if($application){$application.Dispose();throw 'A protected TEST app is open. Close it normally before updating.'}
 $owned=@(Get-CimInstance Win32_Process -Filter "Name='Shop POS TEST.exe' OR Name='node.exe'" | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($install+'\',[StringComparison]::OrdinalIgnoreCase)})
 if($owned.Count){throw 'An original app/backend process is still running. No forced shutdown is allowed.'}
 Verify $install $oldManifest (Join-Path $Evidence 'previous-program-verification.json')
 Verify $Bundle $newManifest (Join-Path $Evidence 'candidate-program-verification.json')
 $before=DataSnapshot
 [IO.File]::WriteAllText((Join-Path $Evidence 'data-before-install.json'),$before,[Text.UTF8Encoding]::new($false))
 # Exact checked sibling rename retains ALL prior program bytes. No data or other TEST root is moved.
 if([IO.Path]::GetFullPath($install) -cne (Join-Path $localAppData 'Programs\SalamTech\ShopPOSTest\0.2.0-test.21r2') -or [IO.Path]::GetFullPath($retained) -cne ($install+'-retained-17892516')){throw 'Rename boundary failed'}
 Rename-Item -LiteralPath $install -NewName ([IO.Path]::GetFileName($retained))
 if(Test-Path -LiteralPath $install){throw 'The replacement destination must be absent'}
 if((Hash (Join-Path $retained 'resources\payload\manifest.json')) -cne $oldManifest){throw 'Retained program identity mismatch'}
}finally{$maintenance.Dispose()}
# The original executable path is absent during the mutex handoff. Inno holds its
# unchanged maintenance mutex and checks the unchanged application mutex before writing.
$log=Join-Path $Evidence 'installer.log'
$arguments=@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="'+$log+'"'))
$setup=Start-Process -FilePath $Installer -ArgumentList $arguments -PassThru -Wait -WindowStyle Hidden
if($setup.ExitCode -ne 0){throw ('Update installer stopped with code '+$setup.ExitCode+'. Prior program and all data retained; no automatic delete/reset performed.')}
Verify $install $newManifest (Join-Path $Evidence 'installed-program-verification.json')
$after=DataSnapshot
[IO.File]::WriteAllText((Join-Path $Evidence 'data-after-install.json'),$after,[Text.UTF8Encoding]::new($false))
if($before -cne $after){throw 'Nonbrowser data changed during code-only installation; do not launch'}
if((Hash (Join-Path $retained 'resources\payload\manifest.json')) -cne $oldManifest){throw 'Retained old program changed'}
@{status='PASS';install=$install;retained=$retained;data=$data;dataUnchangedBeforeLaunch=$true;installerSha256=$InstallerSha256;manifestSha256=$newManifest;productionActivation=$false} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $Evidence 'installation-result.json')
Get-Content -LiteralPath (Join-Path $Evidence 'installation-result.json')