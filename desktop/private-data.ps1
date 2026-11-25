Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
try {
 $m=[Console]::In.ReadToEnd() | ConvertFrom-Json
 if ((($m.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'directory') {throw 'Denied'}
 $target=[string]$m.directory
 if (-not [IO.Path]::IsPathRooted($target) -or $target.StartsWith('\\') -or [IO.Path]::GetFullPath($target) -ne $target) {throw 'Denied'}
 $leaf=[IO.Path]::GetFileName($target)
 $shopRoot=$target.EndsWith('\Programs\SalamTech\ShopPOSData\1.0.0',[StringComparison]::OrdinalIgnoreCase)
 if ($leaf -ne 'ShopPOSTestData' -and $leaf -ne 'ShopPOSEvalData' -and -not $shopRoot -and $leaf -notmatch '^posdt-[a-f0-9-]{36}$') {throw 'Denied'}
 $parent=New-Object IO.DirectoryInfo([IO.Path]::GetDirectoryName($target))
 if (-not $parent.Exists) {throw 'Denied'}
 while($null -ne $parent) {if(-not $parent.Exists -or ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Denied'};$parent=$parent.Parent}
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 if($sid.Value -eq 'S-1-5-18'){throw 'Denied'}
 $system=[Security.Principal.SecurityIdentifier]::new('S-1-5-18')
 if (-not [IO.Directory]::Exists($target)) {
  $entry=[IO.Directory]::CreateDirectory($target)
  $acl=[Security.AccessControl.DirectorySecurity]::new()
  $acl.SetAccessRuleProtection($true,$false)
  $inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
  foreach($identity in @($sid,$system)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl',$inherit,'None','Allow'))}
  $entry.SetAccessControl($acl)
 }
 $entry=New-Object IO.DirectoryInfo($target)
 if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Denied'}
 $acl=$entry.GetAccessControl()
 if(-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Denied'}
 $userFound=$false;$systemFound=$false
 foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl'){throw 'Denied'}
  if($rule.IdentityReference.Value -eq $sid.Value){$userFound=$true}
  elseif($rule.IdentityReference.Value -eq $system.Value){$systemFound=$true}
  else{throw 'Denied'}
 }
 if(-not $userFound -or -not $systemFound){throw 'Denied'}
 [Console]::Out.Write('true')
} catch {[Console]::Out.Write('false');exit 1}
