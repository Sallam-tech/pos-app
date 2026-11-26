Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
# One reusable PowerShell process for the backend's short protection and storage helper scripts.
# Starting powershell.exe costs about one second; a normal reopen used to start it ~17 times in a row.
# Each request runs ONE allow-listed helper script exactly as a fresh "-File" launch would: its own
# stdin text, its own stdout/stderr text and its own exit code. Nothing is kept between requests except
# PowerShell itself and .NET types that are already loaded. The Node side closes this process after a
# few idle seconds and applies the same success checks as before (exit 0, no stderr, valid output).
$utf8=New-Object Text.UTF8Encoding($false)
[Console]::InputEncoding=$utf8
[Console]::OutputEncoding=$utf8
$realIn=[Console]::In;$realOut=[Console]::Out;$realError=[Console]::Error
$allowed=@{
 'windows-protection'=(Join-Path $PSScriptRoot 'windows-protection.ps1')
 'windows-enrollment-records'=(Join-Path $PSScriptRoot 'windows-enrollment-records.ps1')
 'windows-candidate-records'=(Join-Path $PSScriptRoot 'windows-candidate-records.ps1')
 'windows-maintenance-records'=(Join-Path $PSScriptRoot 'windows-maintenance-records.ps1')
 'storage'=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\backup\storage.ps1'))
}
foreach($file in $allowed.Values){if(-not [IO.File]::Exists($file)){exit 1}}
$realOut.WriteLine('{"ready":true}');$realOut.Flush()
while($true){
 $line=$realIn.ReadLine()
 if($null -eq $line){exit 0}
 $request=$line|ConvertFrom-Json
 $names=@($request.PSObject.Properties.Name)
 if($names -contains 'exit'){exit 0}
 if((($names|Sort-Object) -join ',') -ne 'id,input,script'){exit 1}
 $id=[long]$request.id;$name=[string]$request.script
 if(-not $allowed.ContainsKey($name)){exit 1}
 $text=$utf8.GetString([Convert]::FromBase64String([string]$request.input))
 $out=New-Object IO.StringWriter;$err=New-Object IO.StringWriter;$code=0
 [Console]::SetIn((New-Object IO.StringReader($text)));[Console]::SetOut($out);[Console]::SetError($err)
 try{
  $ShopPosHostedRequest=$true
  $global:LASTEXITCODE=0
  $stray=@(& $allowed[$name] *>&1)
  $code=[int]$LASTEXITCODE
  # Anything a "-File" launch would have printed outside [Console] goes to the same place here.
  foreach($item in $stray){if($item -is [Management.Automation.ErrorRecord]){$err.Write(($item|Out-String))}else{$out.Write(($item|Out-String))}}
 }catch{
  $err.Write('Hosted helper failed.');if($code -eq 0){$code=1}
 }finally{
  Remove-Variable ShopPosHostedRequest -ErrorAction SilentlyContinue
  [Console]::SetIn($realIn);[Console]::SetOut($realOut);[Console]::SetError($realError)
 }
 $realOut.WriteLine('{"id":'+$id+',"code":'+$code+',"stdout":"'+[Convert]::ToBase64String($utf8.GetBytes($out.ToString()))+'","stderr":"'+[Convert]::ToBase64String($utf8.GetBytes($err.ToString()))+'"}')
 $realOut.Flush()
 $text=$null;$out=$null;$err=$null;$stray=$null
}
