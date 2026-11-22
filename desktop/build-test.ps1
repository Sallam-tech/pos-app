param(
 [Parameter(Mandatory=$true)][string]$VerifiedNextApp,
 [Parameter(Mandatory=$true)][string]$ElectronDirectory,
 [Parameter(Mandatory=$true)][string]$NodeExecutable,
 [Parameter(Mandatory=$true)][string]$NodeLicense,
 [string]$InnoCompiler,
 [Parameter(Mandatory=$true)][string]$OutputDirectory,
 [string]$VerifiedDependencySource,
 [string]$Release='0.2.0-test.1',
 [switch]$OfflineDependencies,
 [switch]$AllowUnverifiedTools,
 [switch]$SkipInstaller
)
# -AllowUnverifiedTools skips ONLY the SHA-256 pin of build tools (Node/Electron/Inno/license) for local laptop TEST builds. It does not touch login or payload sealing.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
if(-not $OutputDirectory.StartsWith($projectRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $OutputDirectory)){throw 'A new workspace artifact directory is required; previous attempts remain retained.'}
if($Release -notmatch '^0\.2\.0-test\.[1-9][0-9]*$'){throw 'Only disposable unsigned TEST releases are accepted.'}
function RequireHash([string]$File,[string]$Expected){if((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -ne $Expected){throw ('Reviewed tool/notice hash mismatch: '+[IO.Path]::GetFileName($File))}}
if(-not $AllowUnverifiedTools){RequireHash $NodeExecutable '86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6'}
if(-not $AllowUnverifiedTools){RequireHash (Join-Path $ElectronDirectory 'electron.exe') 'cf7ff337d82f32a437d315721ef361f53a8473905a655a0c650967a66ccd0724'}
if(-not $SkipInstaller -and -not $InnoCompiler){throw 'InnoCompiler is required unless -SkipInstaller is used.'}
if(-not $AllowUnverifiedTools -and -not $SkipInstaller){RequireHash $InnoCompiler 'e0f9f1dc32032650c6629f6dee41eb6d20ba140e4e3c07c25d8a24f9ba781644'}
if(-not $AllowUnverifiedTools){RequireHash $NodeLicense '5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace'}
if(-not(Test-Path -LiteralPath (Join-Path $VerifiedNextApp '.next/BUILD_ID'))){throw 'An existing verified production-mode Next build is required.'}
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
 $installers=$null
 if(-not $SkipInstaller){
 $installers=Join-Path $artifactParent ('installers-'+[guid]::NewGuid());[void][IO.Directory]::CreateDirectory($installers)
  InvokeReviewed $InnoCompiler @('/Qp',('/DPayload='+$OutputDirectory),('/DOutput='+$installers),('/DAppRelease='+$Release),(Join-Path $PSScriptRoot 'installer.iss')) (Join-Path $evidence 'installer.log')
 }
 @{format='SHOP_POS_UNSIGNED_TEST_BUILD_V1';release=$Release;bundle=$OutputDirectory;installers=$installers;evidence=$evidence;productionActivation=$false} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $evidence 'build-result.json')
 Get-Content -LiteralPath (Join-Path $evidence 'build-result.json')
}finally{Pop-Location}
