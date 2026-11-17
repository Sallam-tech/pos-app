param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$UpgradeInstaller,[Parameter(Mandatory=$true)][string]$Evidence)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$Evidence=[IO.Path]::GetFullPath($Evidence);[void][IO.Directory]::CreateDirectory($Evidence)
$registry='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{D2F97747-843B-4FB6-8E58-61B1BDF80F9E}_is1'
if(Test-Path -LiteralPath $registry){throw 'Existing Shop POS TEST registration retained; this harness requires a fresh disposable installation registration'}
$base=Join-Path 'D:\pos\desktop\test-results' ('lifecycle-'+[guid]::NewGuid());[void][IO.Directory]::CreateDirectory($base)
$root=Join-Path $base 'installed';$partial=Join-Path $base 'interrupted'
$record=@{format='SHOP_POS_INSTALLER_LIFECYCLE_TEST_V1';installer=$Installer;upgrade=$UpgradeInstaller;root=$root;partial=$partial;productionActivation=$false;status='IN_PROGRESS'}
$record|ConvertTo-Json -Depth 4|Set-Content (Join-Path $Evidence 'installer-attempt.json')
try{
 # Interrupt only this fresh owned installer tree during extraction. No application,
 # customer database, existing registration or owner data is killed or deleted.
 $args=@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',('/DIR="'+$partial+'"'),('/LOG="'+(Join-Path $Evidence 'interrupted-install.log')+'"'))
 $setup=Start-Process -FilePath $Installer -ArgumentList $args -WindowStyle Hidden -PassThru
 $started=$setup.StartTime;$until=[DateTime]::UtcNow.AddSeconds(60);$version=Join-Path $partial 'versions/0.2.0-test.1'
 while(-not $setup.HasExited -and -not(Test-Path -LiteralPath $version) -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 20}
 if(-not $setup.HasExited -and (Test-Path -LiteralPath $version)){
  $owned=@([int]$setup.Id);$snapshot=@(Get-CimInstance Win32_Process);$changed=$true
  while($changed){$changed=$false;foreach($entry in $snapshot){if($entry.ParentProcessId -in $owned -and $entry.ProcessId -notin $owned){$owned+=[int]$entry.ProcessId;$changed=$true}}}
  foreach($id in ($owned|Sort-Object -Descending)){
   $process=Get-Process -Id $id -ErrorAction SilentlyContinue
   if($process -and $process.StartTime -ge $started){Stop-Process -Id $id -ErrorAction Stop}
  }
  $record.interrupted='ACTUAL_OWNED_SETUP_INTERRUPTED_DURING_NEW_VERSION_EXTRACTION';Start-Sleep -Seconds 2
 }else{$record.interrupted='NOT_VERIFIED; setup ended or extraction was not observed'}
 # An explicit new path retains the interrupted output and installs clean code.
 $args=@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',('/DIR="'+$root+'"'),('/LOG="'+(Join-Path $Evidence 'initial-install.log')+'"'))
 $installed=Start-Process -FilePath $Installer -ArgumentList $args -WindowStyle Hidden -PassThru -Wait
 if($installed.ExitCode -ne 0){throw ('Initial actual installer failed '+$installed.ExitCode)}
 $bundle=Join-Path $root 'versions/0.2.0-test.1'
 & powershell -NoLogo -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'native-ui-smoke.ps1') -Bundle $bundle -Evidence (Join-Path $Evidence 'native-installed') -LifecycleInstaller $Installer -UpgradeInstaller $UpgradeInstaller -InstallRoot $root
 if($LASTEXITCODE -ne 0){throw 'Installed native/lifecycle checks failed; all evidence and protected data retained'}
 $record.status=if($record.interrupted -like 'ACTUAL_*'){'PASS'}else{'PARTIAL'}
}catch{$record.status='FAIL';$record.error=$_.Exception.Message}
$record|ConvertTo-Json -Depth 4|Set-Content (Join-Path $Evidence 'installer-result.json')
$record|ConvertTo-Json -Depth 4
if($record.status -ne 'PASS'){exit 1}