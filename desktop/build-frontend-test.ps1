param(
 [Parameter(Mandatory=$true)][string]$NodeExecutable,
 [Parameter(Mandatory=$true)][string]$OutputDirectory
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$web=Join-Path $project 'web'
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
$NodeExecutable=[IO.Path]::GetFullPath($NodeExecutable)
$allowed=Join-Path $web 'test-results'
if(-not $OutputDirectory.StartsWith($allowed+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $OutputDirectory)){throw 'New isolated workspace build directory required; existing outputs remain retained'}
if((Get-FileHash -LiteralPath $NodeExecutable -Algorithm SHA256).Hash -ne '86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6'){throw 'Reviewed patched Node required'}
$evidence=Join-Path $PSScriptRoot ('test-results/frontend-build-'+[guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($evidence)
[void][IO.Directory]::CreateDirectory($OutputDirectory)
Copy-Item -LiteralPath (Join-Path $web 'src') -Destination (Join-Path $OutputDirectory 'src') -Recurse
if(Test-Path (Join-Path $web 'public')){Copy-Item -LiteralPath (Join-Path $web 'public') -Destination (Join-Path $OutputDirectory 'public') -Recurse}
foreach($name in @('package.json','package-lock.json','next.config.ts','tsconfig.json','next-env.d.ts','.gitignore')){Copy-Item -LiteralPath (Join-Path $web $name) -Destination (Join-Path $OutputDirectory $name)}
New-Item -ItemType Junction -Path (Join-Path $OutputDirectory 'node_modules') -Target (Join-Path $web 'node_modules') | Out-Null
$sources=@(Get-ChildItem -LiteralPath (Join-Path $OutputDirectory 'src') -Recurse -File | ForEach-Object {@{path=$_.FullName.Substring($OutputDirectory.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
@{format='SHOP_POS_FRONTEND_BUILD_SOURCE_V1';app=$OutputDirectory;runtime=$NodeExecutable;sources=$sources;wrapperPid=$PID;productionActivation=$false} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidence 'source-manifest.json')
$prior=@{};foreach($name in @('PATH','NODE_ENV','NEXT_TELEMETRY_DISABLED','NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_V8_COVERAGE')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PATH=[IO.Path]::GetDirectoryName($NodeExecutable)+';'+$prior.PATH
 $env:NODE_ENV='production';$env:NEXT_TELEMETRY_DISABLED='1'
 foreach($name in @('NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_V8_COVERAGE')){[Environment]::SetEnvironmentVariable($name,$null,'Process')}
 Push-Location $OutputDirectory
 try{
  $ErrorActionPreference='Continue'
  & $NodeExecutable (Join-Path $web 'node_modules/next/dist/bin/next') build 2>&1 | ForEach-Object {[IO.File]::AppendAllText((Join-Path $evidence 'build.log'),$_.ToString()+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))}
  $code=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  if($null -eq $code){throw 'Actual native build exit unavailable'}
  $result=@{format='SHOP_POS_FRONTEND_BUILD_V1';exit=[int]$code;app=$OutputDirectory;evidence=$evidence;workerPathPinned=$true;productionActivation=$false}
  if($code -eq 0){$buildId=Join-Path $OutputDirectory '.next/BUILD_ID';if(-not(Test-Path -LiteralPath $buildId)){throw 'Build ID missing after command exit'};$result.buildId=[IO.File]::ReadAllText($buildId).Trim()}
  $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'build-result.json')
  $result | ConvertTo-Json
  if($code -ne 0){throw ('Frontend build failed; original output/logs retained: '+$evidence)}
 }finally{Pop-Location}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}