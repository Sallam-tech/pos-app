param(
 [Parameter(Mandatory=$true)][string]$VerifiedNextApp,
 [Parameter(Mandatory=$true)][string]$ElectronDirectory,
 [Parameter(Mandatory=$true)][string]$NodeExecutable,
 [Parameter(Mandatory=$true)][string]$NodeLicense,
 [Parameter(Mandatory=$true)][string]$InnoCompiler,
 [Parameter(Mandatory=$true)][string]$OutputDirectory,
 [string]$VerifiedDependencySource,
 [string]$Release='0.2.0-eval.3',
 [switch]$OfflineDependencies
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
if(-not $OutputDirectory.StartsWith($projectRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $OutputDirectory)){throw 'A new workspace artifact directory is required; previous attempts remain retained.'}
if($Release -ne '0.2.0-eval.3'){throw 'This installer identity is reserved for client evaluation.'}
function RequireHash([string]$File,[string]$Expected){if((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -ne $Expected){throw ('Reviewed tool/notice hash mismatch: '+[IO.Path]::GetFileName($File))}}
RequireHash $NodeExecutable '86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6'
RequireHash (Join-Path $ElectronDirectory 'electron.exe') 'a547b53fbee4dd4adca1a88e215270d06f7cb1e7d333ee402fb3dd677392a87a'
RequireHash $InnoCompiler 'e0f9f1dc32032650c6629f6dee41eb6d20ba140e4e3c07c25d8a24f9ba781644'
RequireHash $NodeLicense '5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace'
if(-not(Test-Path -LiteralPath (Join-Path $VerifiedNextApp '.next/BUILD_ID'))){throw 'An existing verified production-mode Next build is required.'}
$installerScript=Join-Path $PSScriptRoot 'installer-evaluation.iss'
$installerSource=Get-Content -LiteralPath $installerScript -Raw
$appIdMatch=[regex]::Match($installerSource,'(?m)^AppId=\{\{(?<id>[0-9a-fA-F-]{36})\}\r?$')
if(-not $appIdMatch.Success){throw 'Unique isolated TEST AppId required.'}
$installerAppId=[Guid]::Parse($appIdMatch.Groups['id'].Value)
if($installerAppId.ToString('D') -ine '8d8f4234-248f-42b4-a35e-e487166eaf35'){throw 'Evaluation AppId mismatch.'}
$uninstallKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{'+$installerAppId.ToString('D').ToUpperInvariant()+'}_is1'
if(Test-Path -LiteralPath $uninstallKey){throw 'The isolated TEST uninstall identity already exists.'}
$localAppData=[Environment]::GetFolderPath('LocalApplicationData')
$installRoot=Join-Path $localAppData ('Programs\SalamTech\ShopPOSEval\'+$Release)
$dataRoot=Join-Path $localAppData ('Programs\SalamTech\'+$Release+'\ShopPOSEvalData')
if((Join-Path $dataRoot 'test-results\sqlite-b1b-part1\b999999999').Length -gt 120){throw 'Protected TEST backup path budget exceeded.'}
if(Test-Path -LiteralPath $installRoot){throw 'The isolated TEST installation directory already exists; existing files are retained.'}
if(Test-Path -LiteralPath $dataRoot){throw 'The TEST.21r2 persistent data root already exists; existing data is retained.'}
if(Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Shop POS.lnk')){throw 'The Shop POS desktop shortcut already exists; existing shortcuts are retained.'}
$startMenuShortcut=Join-Path ([Environment]::GetFolderPath('Programs')) 'SalamTech\Shop POS.lnk'
if(Test-Path -LiteralPath $startMenuShortcut){throw 'The Shop POS Start Menu shortcut already exists; existing shortcuts are retained.'}
$dataParent=Join-Path $localAppData 'Programs\SalamTech';$parentInfo=Get-Item -LiteralPath $dataParent;if(-not $parentInfo.PSIsContainer -or ($parentInfo.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'The existing per-user TEST parent is unavailable or redirected.'}
if($installerSource -match '(?im)^\[Run\]' -or $installerSource -match '(?im)^\[(?:InstallDelete|UninstallDelete)\]'){throw 'Isolated TEST installer must not auto-run or delete files.'}
if($installerSource -notmatch '(?im)^DefaultDirName=\{localappdata\}\\Programs\\SalamTech\\ShopPOSEval\\\{#AppRelease\}\r?$'){throw 'Evaluation destination mismatch.'}
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
 if($desktopPackage.name -ne 'shop-pos-desktop-test' -or $desktopPackage.version -cne '0.2.0-test.21r2'){throw 'Reviewed Electron package metadata required.'}
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
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'EVALUATION-README.txt') -Destination (Join-Path $OutputDirectory 'EVALUATION-README.txt')
 InvokeReviewed $NodeExecutable @((Join-Path $PSScriptRoot 'seal-payload.mjs'),$OutputDirectory) (Join-Path $evidence 'seal.log')
 InvokeReviewed $NodeExecutable @('-e','require(process.argv[1]).verifyPayload(process.argv[2]).then(v=>console.log(JSON.stringify(v))).catch(()=>{process.exitCode=1})',(Join-Path $PSScriptRoot 'payload-integrity.cjs'),(Join-Path $OutputDirectory 'resources')) (Join-Path $evidence 'verify-payload.log')
 Move-Item -LiteralPath (Join-Path $OutputDirectory 'Shop POS TEST.exe') -Destination (Join-Path $OutputDirectory 'Shop POS.exe')
 $installers=Join-Path $artifactParent ('installers-'+[guid]::NewGuid());[void][IO.Directory]::CreateDirectory($installers)
 InvokeReviewed $InnoCompiler @('/Qp',('/DPayload='+$OutputDirectory),('/DOutput='+$installers),('/DAppRelease='+$Release),$installerScript) (Join-Path $evidence 'installer.log')
 @{format='SHOP_POS_CLIENT_EVALUATION_BUILD_V1';release=$Release;appId=$installerAppId.ToString('B').ToUpperInvariant();installRoot=$installRoot;dataRoot=$dataRoot;shortcutPolicy='VERSIONED_DESKTOP_AND_STARTMENU_SHORTCUTS';dataRootPolicy='ISOLATED_CLIENT_EVALUATION';bundle=$OutputDirectory;installers=$installers;evidence=$evidence;productionActivation=$false} | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $evidence 'build-result.json')
 Get-Content -LiteralPath (Join-Path $evidence 'build-result.json')
}finally{Pop-Location}
