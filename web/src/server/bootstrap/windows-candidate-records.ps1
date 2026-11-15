# Private candidate-ledger I/O only. Records confer no SQL/login/admission authority.
# Completion/selection callers must supply genuine independently verified capabilities.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -AssemblyName System.Security
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$stream=$null; $plain=$null; $cipher=$null; $mutex=$null; $held=$false; $parentHandle=$null
try {
  $m=[Console]::In.ReadToEnd() | ConvertFrom-Json
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $systemSid=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  $directory=[IO.Path]::GetFullPath([string]$m.directory)
  $parent=[IO.Path]::GetDirectoryName($directory)
  if([IO.Path]::GetFileName($directory) -cne 'candidate-authority' -or [IO.Path]::GetFileName($parent) -cne 'protected-identity' -or $sid.Value -eq $systemSid.Value){throw 'Denied'}
  $item=New-Object IO.DirectoryInfo($parent)
  while($null -ne $item){if(-not $item.Exists -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Denied'};$item=$item.Parent}
  if((New-Object IO.DriveInfo([IO.Path]::GetPathRoot($directory))).DriveFormat -cne 'NTFS'){throw 'Denied'}
  function Check-Acl([string]$target,[bool]$isDirectory,[bool]$requireProtected=$true){
    $entry=if($isDirectory){New-Object IO.DirectoryInfo($target)}else{New-Object IO.FileInfo($target)}
    if(-not $entry.Exists -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Denied'}
    $acl=$entry.GetAccessControl()
    if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or ($isDirectory -and $requireProtected -and -not $acl.AreAccessRulesProtected)){throw 'Denied'}
    $user=$false; $system=$false
    foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
      if($rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl'){throw 'Denied'}
      if($rule.IdentityReference.Value -eq $sid.Value){$user=$true}elseif($rule.IdentityReference.Value -eq $systemSid.Value){$system=$true}else{throw 'Denied'}
    }
    if(-not $user -or -not $system){throw 'Denied'}
  }
  Check-Acl $parent $true
  $nativeSource=[string]::Join([Environment]::NewLine,@(
    'using System; using System.Runtime.InteropServices; using Microsoft.Win32.SafeHandles;',
    'namespace ShopPosCandidate { public static class Native {',
    '[StructLayout(LayoutKind.Sequential)] public struct FileInfo { public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written; public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow; }',
    '[DllImport("kernel32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInfo info);',
    '[DllImport("kernel32.dll", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)] public static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);',
    '[DllImport("kernel32.dll", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool MoveFileExW(string source, string target, uint flags);',
    '} }'))
  Add-Type -TypeDefinition $nativeSource
  # Actual protected-parent file identity, not a pathname: DOS/short-name aliases
  # cannot create independent locks for the same journal. No-delete sharing keeps
  # this parent identity stable throughout native publication.
  $parentHandle=[ShopPosCandidate.Native]::CreateFileW($parent,[uint32]128,[uint32]3,[IntPtr]::Zero,[uint32]3,[uint32]0x02000000,[IntPtr]::Zero)
  $parentInfo=New-Object ShopPosCandidate.Native+FileInfo
  if($parentHandle.IsInvalid -or -not [ShopPosCandidate.Native]::GetFileInformationByHandle($parentHandle,[ref]$parentInfo) -or ($parentInfo.Attributes -band 1024) -or ($parentInfo.IndexHigh -eq 0 -and $parentInfo.IndexLow -eq 0)){throw 'Denied'}
  $parentIdentity=$parentInfo.Volume.ToString('X8')+':'+$parentInfo.IndexHigh.ToString('X8')+$parentInfo.IndexLow.ToString('X8')
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$namespace=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sid.Value+'|'+$parentIdentity+'|candidate-authority-v1'))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  $mutexSecurity=New-Object Security.AccessControl.MutexSecurity
  $mutexSecurity.SetOwner($sid);$mutexSecurity.SetAccessRuleProtection($true,$false)
  foreach($identity in @($sid,$systemSid)){[void]$mutexSecurity.AddAccessRule((New-Object Security.AccessControl.MutexAccessRule($identity,'FullControl','Allow')))}
  $created=$false
  $mutex=[Threading.Mutex]::new($false,('Global\ShopPOS.Candidate.v1.'+$namespace),[ref]$created,$mutexSecurity)
  $actualSecurity=$mutex.GetAccessControl()
  if($actualSecurity.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or -not $actualSecurity.AreAccessRulesProtected){throw 'Denied'}
  $mutexUser=$false;$mutexSystem=$false;$ruleCount=0
  foreach($rule in $actualSecurity.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
    $ruleCount++
    if($rule.IsInherited -or $rule.AccessControlType -ne 'Allow' -or $rule.MutexRights -ne 'FullControl'){throw 'Denied'}
    if($rule.IdentityReference.Value -eq $sid.Value){$mutexUser=$true}elseif($rule.IdentityReference.Value -eq $systemSid.Value){$mutexSystem=$true}else{throw 'Denied'}
  }
  if(-not $mutexUser -or -not $mutexSystem -or $ruleCount -ne 2){throw 'Denied'}
  $abandoned=$false
  try{$held=$mutex.WaitOne(2000)}catch [Threading.AbandonedMutexException]{$held=$true;$abandoned=$true}
  if(-not $held){throw 'Denied'}
  if(-not [IO.Directory]::Exists($directory)){
    if($m.operation -cne 'candidate-append'){throw 'Denied'}
    [void][IO.Directory]::CreateDirectory($directory)
  }
  $directoryInfo=New-Object IO.DirectoryInfo($directory)
  if(-not $directoryInfo.GetAccessControl().AreAccessRulesProtected){
    Check-Acl $directory $true $false
    if([IO.Directory]::EnumerateFileSystemEntries($directory).GetEnumerator().MoveNext()){throw 'Denied'}
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
    foreach($identity in @($sid,$systemSid)){[void]$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))}
    $directoryInfo.SetAccessControl($acl)
  }
  Check-Acl $directory $true
  $entropy=[Text.Encoding]::UTF8.GetBytes('ShopPOS.CandidateAuthority.v1')
  $utf8=New-Object Text.UTF8Encoding($false,$true)
  $uuid='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}'
  $keys=@('format','kind','sequence','previousDigest','operationId','purpose','installationId','deviceId','vaultDigest','originalAnchorDigest','rootDatabaseFingerprint','sourceFileIdentity','destinationFileIdentity','sourceSchema','sourceStateDigest','targetSpecificationDigest','backupArchiveId','backupCiphertextSha256','createdAtMs','intentDigest','targetStateDigest','targetVaultDigest','generation')
  function Digest([byte[]]$bytes){$hash=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}}
  function Read-File([string]$file,[bool]$pending,[long]$maximumBytes=16384){
    Check-Acl $file $false
    $opened=New-Object IO.FileStream($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try{
      $info=New-Object ShopPosCandidate.Native+FileInfo
      if(-not [ShopPosCandidate.Native]::GetFileInformationByHandle($opened.SafeFileHandle,[ref]$info) -or $info.Links -ne 1 -or $opened.Length -gt $maximumBytes -or (-not $pending -and $opened.Length -lt 9)){throw 'Denied'}
      $bytes=New-Object byte[] ([int]$opened.Length);$offset=0
      while($offset -lt $bytes.Length){$read=$opened.Read($bytes,$offset,$bytes.Length-$offset);if($read -lt 1){throw 'Denied'};$offset+=$read}
      return ,$bytes
    }finally{$opened.Dispose()}
  }
  function Validate-ImportedRecord($record){
    $importDirectory=[IO.Path]::Combine($parent,'imported-root');Check-Acl $importDirectory $true
    $receiptBytes=Read-File ([IO.Path]::Combine($importDirectory,'restore.dpapi')) $false 196608
    $receiptPlain=[Security.Cryptography.ProtectedData]::Unprotect($receiptBytes,[Text.Encoding]::UTF8.GetBytes('ShopPOS.BackupRestore.v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
    try{
      $receipt=$utf8.GetString($receiptPlain) | ConvertFrom-Json
      if($receipt.format -cne 'POS_IMPORTED_ROOT41_V1' -or $receipt.operationId -cne $record.operationId -or $receipt.destinationFileIdentity -cne $record.rootDatabaseFingerprint -or $receipt.destinationFileIdentity -cne $record.destinationFileIdentity -or $receipt.vaultDigest -cne $record.vaultDigest -or $receipt.installationId -cne $record.installationId -or $receipt.deviceId -cne $record.deviceId -or $record.purpose -cne 'RESTORE41' -or $record.sourceSchema -cne '41'){throw 'Denied'}
      if($receipt.packet.origin.sourceFileIdentity -cne $record.sourceFileIdentity -or $receipt.packet.origin.originalAnchorDigest -cne $record.originalAnchorDigest -or $receipt.packet.origin.archiveSha256 -cne $record.backupCiphertextSha256 -or $receipt.packet.origin.manifest.archiveId -cne $record.backupArchiveId -or $receipt.fence.destinationFileIdentity -cne $record.destinationFileIdentity -or $receipt.fence.operationId -cne $record.operationId -or $receipt.fence.physicalAcceptance -cne 'NOT_WITNESSED' -or $receipt.fence.productionActivation -ne $false){throw 'Denied'}
    }finally{[Array]::Clear($receiptPlain,0,$receiptPlain.Length);[Array]::Clear($receiptBytes,0,$receiptBytes.Length)}
  }
  function Validate-Record($record){
    if((@($record.PSObject.Properties.Name | Sort-Object -CaseSensitive) -join ',') -cne (@($keys | Sort-Object -CaseSensitive) -join ',') -or $record.format -cnotin @('POS_CANDIDATE_LEDGER_V1','POS_IMPORTED_ROOT_LEDGER_V1') -or $record.kind -cnotmatch '^(INTENT|COMMITTED|CURRENT|QUARANTINED_NO_ADMISSION)$'){throw 'Denied'}
    if($record.sequence -isnot [string] -or $record.sequence -cnotmatch '^[1-9][0-9]?$' -or [int]$record.sequence -gt 64 -or $record.operationId -cnotmatch ('^'+$uuid+'$') -or $record.backupArchiveId -cnotmatch ('^'+$uuid+'$')){throw 'Denied'}
    foreach($key in @('installationId','deviceId','vaultDigest','originalAnchorDigest','rootDatabaseFingerprint')){if($record.$key -isnot [string] -or $record.$key -cne $m.$key){throw 'Denied'}}
    foreach($key in @('vaultDigest','originalAnchorDigest','rootDatabaseFingerprint','sourceFileIdentity','destinationFileIdentity','sourceStateDigest','targetSpecificationDigest','backupCiphertextSha256')){if($record.$key -isnot [string] -or $record.$key -cnotmatch '^[a-f0-9]{64}$'){throw 'Denied'}}
    if($record.createdAtMs -isnot [string] -or $record.createdAtMs -cnotmatch '^[1-9][0-9]{0,15}$' -or [long]$record.createdAtMs -gt 8640000000000000){throw 'Denied'}
    if($null -ne $record.previousDigest -and ($record.previousDigest -isnot [string] -or $record.previousDigest -cnotmatch '^[a-f0-9]{64}$')){throw 'Denied'}
    foreach($key in @('format','kind','purpose','sourceSchema','installationId','deviceId')){if($record.$key -isnot [string]){throw 'Denied'}}
    foreach($key in @('installationId','deviceId')){if($record.$key -cnotmatch ('^'+$uuid+'$')){throw 'Denied'}}
    if(($record.purpose -ceq 'UPGRADE8' -and $record.sourceSchema -ceq '8') -or ($record.purpose -ceq 'RESTORE41' -and $record.sourceSchema -ceq '41')){}else{throw 'Denied'}
    if($record.format -ceq 'POS_IMPORTED_ROOT_LEDGER_V1'){Validate-ImportedRecord $record}
    if($record.sourceFileIdentity -ceq $record.destinationFileIdentity){throw 'Denied'}
    if($record.kind -ceq 'INTENT'){
      if($null -ne $record.intentDigest -or $null -ne $record.targetStateDigest -or $null -ne $record.targetVaultDigest -or $null -ne $record.generation){throw 'Denied'}
    }elseif($record.kind -ceq 'QUARANTINED_NO_ADMISSION'){
      if(($null -ne $record.intentDigest -and $record.intentDigest -cnotmatch '^[a-f0-9]{64}$') -or $null -ne $record.targetStateDigest -or $null -ne $record.targetVaultDigest -or $null -ne $record.generation){throw 'Denied'}
    }else{
      foreach($key in @('intentDigest','targetStateDigest','targetVaultDigest')){if($record.$key -isnot [string] -or $record.$key -cnotmatch '^[a-f0-9]{64}$'){throw 'Denied'}}
      if($record.kind -ceq 'CURRENT'){if($record.generation -isnot [string] -or $record.generation -cnotmatch '^[1-9][0-9]?$' -or [int]$record.generation -gt 64){throw 'Denied'}}elseif($null -ne $record.generation){throw 'Denied'}
    }
  }
  function Same-Operation($record,$intent){foreach($key in $keys){if($key -in @('kind','sequence','previousDigest','createdAtMs','intentDigest','targetStateDigest','targetVaultDigest','generation')){continue};if($record.$key -cne $intent.$key){throw 'Denied'}}}
  function Check-Transition($record,$ledger){
    Validate-Record $record
    $last=if($ledger.records.Count){$ledger.records[$ledger.records.Count-1]}else{$null}
    if([int]$record.sequence -ne $ledger.records.Count+1 -or $record.previousDigest -cne $(if($null -eq $last){$null}else{$last.digest}) -or ($null -ne $last -and [long]$record.createdAtMs -lt [long]$last.record.createdAtMs)){throw 'Denied'}
    $state=if($ledger.operations.ContainsKey($record.operationId)){$ledger.operations[$record.operationId]}else{$null}
    if($record.kind -ceq 'INTENT'){
      if($null -ne $state){throw 'Denied'}
      foreach($operation in $ledger.operations.Values){if($operation.status -in @('INTENT','COMMITTED')){throw 'Denied'}}
      $expectedSource=if($null -eq $ledger.current){if($record.format -ceq 'POS_IMPORTED_ROOT_LEDGER_V1' -and $ledger.records.Count -eq 0){$record.sourceFileIdentity}else{$record.rootDatabaseFingerprint}}else{$ledger.current.record.destinationFileIdentity}
      if($record.sourceFileIdentity -cne $expectedSource -or ($null -ne $ledger.current -and $record.sourceSchema -cne '41')){throw 'Denied'}
    }elseif($record.kind -ceq 'QUARANTINED_NO_ADMISSION'){
      if($null -ne $state){if($state.status -cne 'INTENT'){throw 'Denied'};Same-Operation $record $state.intent.record;if($record.intentDigest -cne $state.intent.digest){throw 'Denied'}}elseif($null -ne $record.intentDigest){throw 'Denied'}
    }elseif($record.kind -ceq 'COMMITTED'){
      if($null -eq $state -or $state.status -cne 'INTENT'){throw 'Denied'}
      Same-Operation $record $state.intent.record;if($record.intentDigest -cne $state.intent.digest){throw 'Denied'}
    }else{
      if($null -eq $state -or $state.status -cne 'COMMITTED'){throw 'Denied'}
      Same-Operation $record $state.intent.record
      if($record.intentDigest -cne $state.intent.digest -or $record.targetStateDigest -cne $state.commit.record.targetStateDigest -or $record.targetVaultDigest -cne $state.commit.record.targetVaultDigest){throw 'Denied'}
      $expectedGeneration=if($null -eq $ledger.current){1}else{[int]$ledger.current.record.generation+1}
      if([int]$record.generation -ne $expectedGeneration){throw 'Denied'}
    }
  }
  function Add-Record($entry,$ledger){
    Check-Transition $entry.record $ledger
    $record=$entry.record
    if($record.kind -ceq 'INTENT'){$ledger.operations[$record.operationId]=@{status='INTENT';intent=$entry}}
    elseif($record.kind -ceq 'COMMITTED'){$ledger.operations[$record.operationId].status='COMMITTED';$ledger.operations[$record.operationId].commit=$entry}
    elseif($record.kind -ceq 'CURRENT'){$ledger.operations[$record.operationId].status='CURRENT';$ledger.current=$entry}
    else{$ledger.operations[$record.operationId]=@{status='QUARANTINED_NO_ADMISSION'}}
    [void]$ledger.records.Add($entry)
  }
  function Read-Ledger {
    $ledger=@{records=(New-Object Collections.Generic.List[object]);pending=(New-Object Collections.Generic.List[object]);operations=@{};current=$null;plainBytes=0}
    $entries=New-Object Collections.Generic.List[string]
    foreach($entry in [IO.Directory]::EnumerateFileSystemEntries($directory)){if($entries.Count -ge 96 -or [IO.Directory]::Exists($entry)){throw 'Denied'};[void]$entries.Add($entry)}
    $total=0
    foreach($file in @($entries | Sort-Object -CaseSensitive)){
      $name=[IO.Path]::GetFileName($file)
      $isPending=$name -cmatch ('^[0-9]{6}\.'+$uuid+'\.(intent|committed|current|quarantined)\.dpapi\.'+$uuid+'\.pending$')
      if(-not $isPending -and $name -cnotmatch ('^[0-9]{6}\.'+$uuid+'\.(intent|committed|current|quarantined)\.dpapi$')){throw 'Denied'}
      $bytes=Read-File $file $isPending
      if($isPending){[void]$ledger.pending.Add(@{name=$name;bytes=[string]$bytes.Length;sha256=(Digest $bytes)});continue}
      if([Text.Encoding]::ASCII.GetString($bytes,0,8) -cne 'POSCND01'){throw 'Denied'}
      $encrypted=New-Object byte[] ($bytes.Length-8);[Array]::Copy($bytes,8,$encrypted,0,$encrypted.Length)
      $decoded=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
      try{
        $total+=$decoded.Length;$ledger.plainBytes=$total;if($decoded.Length -lt 1 -or $decoded.Length -gt 8192 -or $total -gt 98304 -or $ledger.records.Count -ge 64){throw 'Denied'}
        $record=$utf8.GetString($decoded) | ConvertFrom-Json
        $kindName=if($record.kind -ceq 'QUARANTINED_NO_ADMISSION'){'quarantined'}else{([string]$record.kind).ToLowerInvariant()}
        $expected=([string]$record.sequence).PadLeft(6,'0')+'.'+$record.operationId+'.'+$kindName+'.dpapi'
        if($name -cne $expected){throw 'Denied'}
        Add-Record @{name=$name;payload=[Convert]::ToBase64String($decoded);digest=(Digest $decoded);ciphertextSha256=(Digest $bytes);record=$record} $ledger
      }finally{[Array]::Clear($decoded,0,$decoded.Length)}
    }
    return $ledger
  }
  $ledger=Read-Ledger
  if($m.operation -ceq 'candidate-list'){
    $rows=@($ledger.records | ForEach-Object {@{name=$_.name;payload=$_.payload;ciphertextSha256=$_.ciphertextSha256}})
    [Console]::Out.Write((ConvertTo-Json -Depth 5 -Compress -InputObject @{sid=$sid.Value;records=$rows;pending=$ledger.pending.ToArray();abandoned=$abandoned}))
  }elseif($m.operation -ceq 'candidate-append'){
    $plain=[Convert]::FromBase64String([string]$m.payload)
    if($plain.Length -lt 1 -or $plain.Length -gt 8192){throw 'Denied'}
    $record=$utf8.GetString($plain) | ConvertFrom-Json
    Check-Transition $record $ledger
    $kindName=if($record.kind -ceq 'QUARANTINED_NO_ADMISSION'){'quarantined'}else{([string]$record.kind).ToLowerInvariant()}
    $name=([string]$record.sequence).PadLeft(6,'0')+'.'+$record.operationId+'.'+$kindName+'.dpapi'
    $target=[IO.Path]::Combine($directory,$name);$pending=$target+'.'+[guid]::NewGuid().ToString()+'.pending'
    if([IO.File]::Exists($target) -or $ledger.records.Count -ge 64 -or $ledger.pending.Count+$ledger.records.Count -ge 95 -or $ledger.plainBytes+$plain.Length -gt 98304){throw 'Denied'}
    $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $stream=New-Object IO.FileStream($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
    $magic=[Text.Encoding]::ASCII.GetBytes('POSCND01');$stream.Write($magic,0,8);$stream.Write($cipher,0,$cipher.Length);$stream.Flush($true);$stream.Dispose();$stream=$null
    [void](Read-File $pending $true)
    # Re-read state under SAME verified mutex immediately before publication.
    # A delayed orphan can never publish COMMITTED/CURRENT after quarantine wins.
    $beforePublication=Read-Ledger;Check-Transition $record $beforePublication
    if(-not [ShopPosCandidate.Native]::MoveFileExW($pending,$target,8)){throw 'Denied'}
    [void](Read-File $target $false)
    [Console]::Out.Write('true')
  }else{throw 'Denied'}
}catch{[Console]::Error.Write('Protected candidate publication unavailable.');exit 1}
finally{
  if($null -ne $stream){$stream.Dispose()}
  if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
  if($null -ne $cipher){[Array]::Clear($cipher,0,$cipher.Length)}
  if($held -and $null -ne $mutex){$mutex.ReleaseMutex()}
  if($null -ne $mutex){$mutex.Dispose()}
  if($null -ne $parentHandle){$parentHandle.Dispose()}
}
