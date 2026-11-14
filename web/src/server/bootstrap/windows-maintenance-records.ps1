# Private protected journal I/O. Same-folder immutable publication; no replacement.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -AssemblyName System.Security
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$plain=$null; $cipher=$null; $stream=$null
try {
  $m=[Console]::In.ReadToEnd() | ConvertFrom-Json
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $systemSid=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  $directory=[string]$m.directory
  if([IO.Path]::GetFileName($directory) -cne 'maintenance' -or
     [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($directory)) -cne 'protected-identity') {throw 'Denied'}
  $item=New-Object IO.DirectoryInfo($directory)
  while($null -ne $item){
    if(-not $item.Exists -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Denied'}
    $item=$item.Parent
  }
  if((New-Object IO.DriveInfo([IO.Path]::GetPathRoot($directory))).DriveFormat -cne 'NTFS'){throw 'Denied'}
  function Check-Acl([string]$target,[bool]$isDirectory){
    $entry=if($isDirectory){New-Object IO.DirectoryInfo($target)}else{New-Object IO.FileInfo($target)}
    if(-not $entry.Exists -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Denied'}
    $a=$entry.GetAccessControl()
    if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or ($isDirectory -and -not $a.AreAccessRulesProtected)){throw 'Denied'}
    $user=$false; $system=$false
    foreach($r in $a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
      if($r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne 'FullControl'){throw 'Denied'}
      if($r.IdentityReference.Value -eq $sid.Value){$user=$true}
      elseif($r.IdentityReference.Value -eq $systemSid.Value){$system=$true}
      else{throw 'Denied'}
    }
    if(-not $user -or -not $system){throw 'Denied'}
  }
  Check-Acl ([IO.Path]::GetDirectoryName($directory)) $true
  if($m.operation -eq 'maintenance-create' -and $m.initialize -ceq 'true'){
    if([IO.Directory]::GetFileSystemEntries($directory).Length -ne 0){throw 'Denied'}
    $a=New-Object Security.AccessControl.DirectorySecurity
    if((New-Object IO.DirectoryInfo($directory)).GetAccessControl().GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Denied'}
    $a.SetAccessRuleProtection($true,$false)
    foreach($identity in @($sid,$systemSid)){
      $r=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
      [void]$a.AddAccessRule($r)
    }
    (New-Object IO.DirectoryInfo($directory)).SetAccessControl($a)
  }
  Check-Acl $directory $true
  $entropy=[Text.Encoding]::UTF8.GetBytes('ShopPOS.Schema41Maintenance.v1')
  if($m.operation -eq 'maintenance-create'){
    $name=[string]$m.name
    if($name -cnotmatch '^[0-9]{8}\.(?:intent|aborted|committed)\.dpapi$'){throw 'Denied'}
    $target=[IO.Path]::Combine($directory,$name)
    $pending=$target+'.pending'
    if([IO.File]::Exists($target)){throw 'Denied'}
    $plain=[Convert]::FromBase64String([string]$m.payload)
    if($plain.Length -lt 1 -or $plain.Length -gt 8192){throw 'Denied'}
    $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $stream=New-Object IO.FileStream($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
    $magic=[Text.Encoding]::ASCII.GetBytes('POSMNT01')
    $stream.Write($magic,0,$magic.Length); $stream.Write($cipher,0,$cipher.Length)
    $stream.Flush($true); $stream.Dispose(); $stream=$null
    Check-Acl $pending $false
    Add-Type -Namespace ShopPosMaintenance -Name NativeMove -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
[return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
public static extern bool MoveFileExW(string source, string target, uint flags);
'@
    # WRITE_THROUGH only: no replace, cross-volume copy, delayed reboot or registry.
    if(-not [ShopPosMaintenance.NativeMove]::MoveFileExW($pending,$target,8)){throw 'Denied'}
    Check-Acl $target $false
    [Console]::Out.Write('true')
  }elseif($m.operation -eq 'maintenance-list'){
    $files=[IO.Directory]::GetFiles($directory)
    if($files.Length -lt 1 -or $files.Length -gt 128 -or [IO.Directory]::GetDirectories($directory).Length -ne 0){throw 'Denied'}
    $records=New-Object Collections.Generic.List[object]
    $total=0
    foreach($file in $files){
      $name=[IO.Path]::GetFileName($file)
      if($name -cnotmatch '^[0-9]{8}\.(?:intent|aborted|committed)\.dpapi$'){throw 'Denied'}
      Check-Acl $file $false
      $stream=New-Object IO.FileStream($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
      if($stream.Length -lt 9 -or $stream.Length -gt 16384){throw 'Denied'}
      $bytes=New-Object byte[] ([int]$stream.Length)
      $offset=0
      while($offset -lt $bytes.Length){$read=$stream.Read($bytes,$offset,$bytes.Length-$offset);if($read -lt 1){throw 'Denied'};$offset+=$read}
      $stream.Dispose();$stream=$null
      if([Text.Encoding]::ASCII.GetString($bytes,0,8) -cne 'POSMNT01'){throw 'Denied'}
      $cipher=New-Object byte[] ($bytes.Length-8)
      [Array]::Copy($bytes,8,$cipher,0,$cipher.Length)
      $plain=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
      $total+=$plain.Length
      if($plain.Length -lt 1 -or $plain.Length -gt 8192 -or $total -gt 131072){throw 'Denied'}
      $records.Add(@{name=$name;payload=[Convert]::ToBase64String($plain)})
      [Array]::Clear($plain,0,$plain.Length)
    }
    [Console]::Out.Write((ConvertTo-Json -Depth 4 -Compress -InputObject @{sid=$sid.Value;records=$records.ToArray()}))
  }else{throw 'Denied'}
}catch{[Console]::Error.Write('Protected maintenance unavailable.');exit 1}
finally{
  if($null -ne $stream){$stream.Dispose()}
  if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
  if($null -ne $cipher){[Array]::Clear($cipher,0,$cipher.Length)}
}
