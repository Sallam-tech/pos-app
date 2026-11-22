# Fast rebuild of the unpacked TEST app (no installer). Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File desktop\quick-rebuild.ps1
# Output: build\quick-<timestamp>\Shop POS TEST.exe  (double-click to run).
# It uses the SAME data folder as the installed app (%LOCALAPPDATA%\ShopPOSTestData), so there is one database.
# Close any running Shop POS TEST window first: only one process may own the database.
param([string]$ToolsDirectory='D:\POS-build-tools')
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$project='D:'+$project.Substring(2)   # build-payload compares paths case-sensitively
$node=Join-Path $ToolsDirectory 'node\node.exe'
$env:PATH=(Split-Path $node)+';'+$env:PATH;Remove-Item Env:NODE_OPTIONS,Env:NODE_PATH -ErrorAction SilentlyContinue
Push-Location (Join-Path $project 'web');try{& $node node_modules\next\dist\bin\next build;if($LASTEXITCODE -ne 0){throw 'Next build failed.'}}finally{Pop-Location}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$prior=Get-ChildItem (Join-Path $project 'build') -Directory -Filter 'build-evidence-*' -ErrorAction SilentlyContinue|Where-Object{Test-Path (Join-Path $_.FullName 'locked-source\node_modules')}|Sort-Object LastWriteTime -Descending|Select-Object -First 1
$args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'build-test.ps1'),'-VerifiedNextApp',(Join-Path $project 'web'),'-ElectronDirectory',(Join-Path $ToolsDirectory 'electron'),'-NodeExecutable',$node,'-NodeLicense',(Join-Path $ToolsDirectory 'node\LICENSE.txt'),'-OutputDirectory',(Join-Path $project ('build\quick-'+$stamp)),'-Release','0.2.0-test.99','-AllowUnverifiedTools','-SkipInstaller')
if($prior){$args+=@('-VerifiedDependencySource',(Join-Path $prior.FullName 'locked-source'))}
& powershell @args
if($LASTEXITCODE -ne 0){throw 'Bundle build failed.'}
Write-Host ('Run: '+(Join-Path $project ('build\quick-'+$stamp+'\Shop POS TEST.exe')))
