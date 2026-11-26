# Private stdin only; Windows TEST custody and immutable publication.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -AssemblyName System.Security
# Skipped only inside powershell-session.ps1, which already uses UTF-8 and gives this script its own
# redirected input/output; resetting the console encoding there would discard that redirected input.
if(-not (Test-Path Variable:ShopPosHostedRequest)){
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
}
$plain=$null
try {
 $m=[Console]::In.ReadToEnd() | ConvertFrom-Json
 $directory=[IO.Path]::GetFullPath([string]$m.directory)
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $system=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
 $item=New-Object IO.DirectoryInfo($directory)
 while($null -ne $item){
  if(-not $item.Exists -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Denied'}
  $item=$item.Parent
 }
 if((New-Object IO.DriveInfo([IO.Path]::GetPathRoot($directory))).DriveFormat -cne 'NTFS'){throw 'Denied'}
 function Check([string]$target,[bool]$folder){
  $entry=Get-Item -LiteralPath $target -Force
  if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Denied'}
  $acl=Get-Acl -LiteralPath $target
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or ($folder -and -not $acl.AreAccessRulesProtected)){throw 'Denied'}
  $u=$false;$s=$false
  foreach($r in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
   if($r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne 'FullControl'){throw 'Denied'}
   if($r.IdentityReference.Value -eq $sid.Value){$u=$true}
   elseif($r.IdentityReference.Value -eq $system.Value){$s=$true}
   else{throw 'Denied'}
  }
  if(-not $u -or -not $s){throw 'Denied'}
 }
 function Publish([string]$source,[string]$target){
  Check $source $false
  if([IO.File]::Exists($target) -or [IO.Directory]::Exists($target)){throw 'Denied'}
  Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class PosBackupMove { [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool MoveFileEx(string a,string b,int flags); }'
  if(-not [PosBackupMove]::MoveFileEx($source,$target,8)){throw 'Denied'}
  Check $target $false
 }
 if($m.operation -ceq 'initialize'){
  if([IO.Directory]::GetFileSystemEntries($directory).Length -ne 0){throw 'Denied'}
  $a=New-Object Security.AccessControl.DirectorySecurity
  if((Get-Acl -LiteralPath $directory).GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Denied'}
  $a.SetAccessRuleProtection($true,$false)
  foreach($i in @($sid,$system)){
   [void]$a.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($i,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
  }
  Set-Acl -LiteralPath $directory -AclObject $a
 }
 Check $directory $true
 if($m.operation -in @('seal','seal-record')){
  $plain=[Convert]::FromBase64String([string]$m.value)
  if($plain.Length -eq 0 -or $plain.Length -gt 131072){throw 'Denied'}
  $record=$m.operation -ceq 'seal-record'
  $name=if($record){'restore'}else{'custody'}
  $purpose=if($record){'ShopPOS.BackupRestore.v1'}else{'ShopPOS.BackupCustody.v1'}
  $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,[Text.Encoding]::UTF8.GetBytes($purpose),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $pending=[IO.Path]::Combine($directory,$name+'.pending')
  $stream=New-Object IO.FileStream($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
  try{$stream.Write($cipher,0,$cipher.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  Publish $pending ([IO.Path]::Combine($directory,$name+'.dpapi'))
 }elseif($m.operation -in @('unseal','unseal-record')){
  $record=$m.operation -ceq 'unseal-record'
  $name=if($record){'restore'}else{'custody'}
  $purpose=if($record){'ShopPOS.BackupRestore.v1'}else{'ShopPOS.BackupCustody.v1'}
  $file=[IO.Path]::Combine($directory,$name+'.dpapi');Check $file $false
  if((Get-Item -LiteralPath $file).Length -gt 196608){throw 'Denied'}
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),[Text.Encoding]::UTF8.GetBytes($purpose),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write(([Convert]::ToBase64String($plain) | ConvertTo-Json -Compress));exit 0
 }elseif($m.operation -ceq 'publish'){
  $source=[string]$m.source;$target=[string]$m.target
  if($source -cnotmatch '^[a-z0-9-]+\.pending$' -or $target -cnotmatch '^[a-z0-9-]+\.(?:age|json|dpapi|sqlite3)$'){throw 'Denied'}
  Publish ([IO.Path]::Combine($directory,$source)) ([IO.Path]::Combine($directory,$target))
 }elseif($m.operation -ceq 'check'){
  if($m.PSObject.Properties.Name -contains 'filename'){
   $name=[string]$m.filename
   if($name -cnotmatch '^[a-z0-9-]+\.(?:age|json|dpapi|sqlite3|pending)$'){throw 'Denied'}
   Check ([IO.Path]::Combine($directory,$name)) $false
  }
 }elseif($m.operation -ceq 'space'){
  [Console]::Out.Write(((New-Object IO.DriveInfo([IO.Path]::GetPathRoot($directory))).AvailableFreeSpace.ToString() | ConvertTo-Json -Compress));exit 0
 }elseif($m.operation -cne 'initialize'){throw 'Denied'}
 [Console]::Out.Write('true')
}catch{[Console]::Out.Write('null');exit 1}
finally{if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}}
