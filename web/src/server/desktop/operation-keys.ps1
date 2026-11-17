# Fixed-purpose metadata checkpoint. Private stdin, CurrentUser DPAPI, no SQL.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -AssemblyName System.Security
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$plain=$null
try {
 $m=[Console]::In.ReadToEnd() | ConvertFrom-Json
 $directory=[IO.Path]::GetFullPath([string]$m.directory)
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $system=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
 $entry=New-Object IO.DirectoryInfo($directory)
 while($null -ne $entry){if(-not $entry.Exists -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Denied'};$entry=$entry.Parent}
 if((New-Object IO.DriveInfo([IO.Path]::GetPathRoot($directory))).DriveFormat -cne 'NTFS'){throw 'Denied'}
 function Check([string]$target,[bool]$folder){
  $item=Get-Item -LiteralPath $target -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Denied'}
  $acl=Get-Acl -LiteralPath $target
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or ($folder -and -not $acl.AreAccessRulesProtected)){throw 'Denied'}
  $u=$false;$s=$false
  foreach($r in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
   if($r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne 'FullControl'){throw 'Denied'}
   if($r.IdentityReference.Value -eq $sid.Value){$u=$true}elseif($r.IdentityReference.Value -eq $system.Value){$s=$true}else{throw 'Denied'}
  }
  if(-not $u -or -not $s){throw 'Denied'}
 }
 Check $directory $true
 $file=[IO.Path]::Combine($directory,'markers.dpapi');$pending=[IO.Path]::Combine($directory,'markers.pending')
 if([IO.File]::Exists($pending) -or [IO.Directory]::Exists($pending)){throw 'Denied'}
 $names=@([IO.Directory]::GetFileSystemEntries($directory) | ForEach-Object {[IO.Path]::GetFileName($_)})
 if($names.Count -gt 1 -or ($names.Count -eq 1 -and $names[0] -cne 'markers.dpapi')){throw 'Denied'}
 $purpose=[Text.Encoding]::UTF8.GetBytes('ShopPOS.DesktopOperationKeys.v1')
 $digest='ABSENT'
 if([IO.File]::Exists($file)){
  Check $file $false
  if((Get-Item -LiteralPath $file).Length -gt 131072){throw 'Denied'}
  $cipher=[IO.File]::ReadAllBytes($file)
  $hasher=[Security.Cryptography.SHA256]::Create()
  try{$digest=([BitConverter]::ToString($hasher.ComputeHash($cipher))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
 }
 if($m.operation -ceq 'read'){
  if($digest -ceq 'ABSENT'){throw 'Denied'}
  $plain=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$purpose,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 }elseif($m.operation -ceq 'cas'){
  if([string]$m.expected -cne $digest){throw 'Denied'}
  $plain=[Convert]::FromBase64String([string]$m.value)
  if($plain.Length -eq 0 -or $plain.Length -gt 65536){throw 'Denied'}
  $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$purpose,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $stream=New-Object IO.FileStream($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
  try{$stream.Write($cipher,0,$cipher.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  Check $pending $false
  Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class PosOperationKeyMove { [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool MoveFileEx(string a,string b,int flags); }'
  $flags=if($digest -ceq 'ABSENT'){8}else{9}
  if(-not [PosOperationKeyMove]::MoveFileEx($pending,$file,$flags)){throw 'Denied'}
  Check $file $false
  $cipher=[IO.File]::ReadAllBytes($file)
  [Array]::Clear($plain,0,$plain.Length)
  $plain=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$purpose,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $hasher=[Security.Cryptography.SHA256]::Create()
  try{$digest=([BitConverter]::ToString($hasher.ComputeHash($cipher))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
 }else{throw 'Denied'}
 [Console]::Out.Write((@{value=[Convert]::ToBase64String($plain);digest=$digest} | ConvertTo-Json -Compress))
}catch{[Console]::Out.Write('null');exit 1}
finally{if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}}