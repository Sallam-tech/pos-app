# Private pipe protocol only. No secrets in arguments, environment or diagnostics.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Security
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$plainBytes = $null
$protectedBytes = $null
$stream = $null
try {
    $message = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
    $entropy = [Text.Encoding]::UTF8.GetBytes('ShopPOS.ProtectedLocalIdentity.v1')
    function Assert-Directory([string]$target) {
        $item = New-Object System.IO.DirectoryInfo($target)
        while ($null -ne $item) {
            if (-not $item.Exists -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Denied' }
            $item = $item.Parent
        }
    }
    function Assert-Acl([string]$target, [bool]$directory) {
        $entry = if ($directory) { New-Object IO.DirectoryInfo($target) } else { New-Object IO.FileInfo($target) }
        if (-not $entry.Exists -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Denied' }
        $acl = $entry.GetAccessControl()
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'Denied' }
        if ($directory -and -not $acl.AreAccessRulesProtected) { throw 'Denied' }
        $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
        $foundUser = $false
        $foundSystem = $false
        foreach ($rule in $rules) {
            if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
                $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'Denied' }
            if ($rule.IdentityReference.Value -eq $sid.Value) { $foundUser = $true }
            elseif ($rule.IdentityReference.Value -eq $systemSid.Value) { $foundSystem = $true }
            else { throw 'Denied' }
        }
        if (-not $foundUser -or -not $foundSystem) { throw 'Denied' }
    }
    if ($message.operation -eq 'context') {
        [Console]::Out.Write(($sid.Value | ConvertTo-Json -Compress))
        exit 0
    }
    $directory = [string]$message.directory
    Assert-Directory $directory
    $filename = [IO.Path]::Combine($directory, 'identity.dpapi')
    if ($message.operation -eq 'seal') {
        if ([IO.Directory]::GetFileSystemEntries($directory).Length -ne 0) { throw 'Denied' }
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $currentOwner = (New-Object IO.DirectoryInfo($directory)).GetAccessControl().GetOwner([Security.Principal.SecurityIdentifier])
        if ($currentOwner.Value -ne $sid.Value) { throw 'Denied' }
        # Change only the DACL. Do not request WRITE_OWNER/elevation for an already-correct owner.
        $acl.SetAccessRuleProtection($true, $false)
        $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
        foreach ($identity in @($sid, $systemSid)) {
            $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $inherit, 'None', 'Allow')
            [void]$acl.AddAccessRule($rule)
        }
        (New-Object IO.DirectoryInfo($directory)).SetAccessControl($acl)
        Assert-Acl $directory $true
        $plainBytes = [Convert]::FromBase64String([string]$message.payload)
        if ($plainBytes.Length -lt 1 -or $plainBytes.Length -gt 65536) { throw 'Denied' }
        $protectedBytes = [Security.Cryptography.ProtectedData]::Protect($plainBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $stream = New-Object IO.FileStream($filename, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None, 4096, [IO.FileOptions]::WriteThrough)
        $magic = [Text.Encoding]::ASCII.GetBytes('POSKEY01')
        $stream.Write($magic, 0, $magic.Length)
        $stream.Write($protectedBytes, 0, $protectedBytes.Length)
        $stream.Flush($true)
        $stream.Dispose()
        $stream = $null
        Assert-Acl $filename $false
        [Console]::Out.Write('true')
    } elseif ($message.operation -eq 'open') {
        if ($message.PSObject.Properties.Name -contains 'applicationDirectory') {
            $applicationDirectory=[IO.Path]::GetFullPath([string]$message.applicationDirectory)
            $databaseDirectory=[IO.Path]::GetFullPath([string]$message.databaseDirectory)
            $databaseFilename=[string]$message.databaseFilename
            if ($databaseFilename -cnotmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.(db|sqlite|sqlite3)$' -or [IO.Path]::GetFullPath([IO.Path]::Combine($applicationDirectory,'protected-identity')) -ine [IO.Path]::GetFullPath($directory)) {throw 'Denied'}
            Assert-Directory $applicationDirectory;Assert-Acl $applicationDirectory $true
            Assert-Directory $databaseDirectory;Assert-Acl $databaseDirectory $true
            foreach($suffix in @('','-wal','-shm','-journal')){
                $databaseFile=[IO.Path]::Combine($databaseDirectory,$databaseFilename+$suffix)
                if([IO.File]::Exists($databaseFile)){Assert-Acl $databaseFile $false}elseif($suffix -eq ''){throw 'Denied'}
            }
        }
        Assert-Acl $directory $true
        Assert-Acl $filename $false
        $stream = New-Object IO.FileStream($filename, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
        if ($stream.Length -lt 9 -or $stream.Length -gt 131072) { throw 'Denied' }
        $stored = New-Object byte[] ([int]$stream.Length)
        $count = 0
        while ($count -lt $stored.Length) {
            $read = $stream.Read($stored, $count, $stored.Length - $count)
            if ($read -le 0) { throw 'Denied' }
            $count += $read
        }
        if ([Text.Encoding]::ASCII.GetString($stored, 0, 8) -cne 'POSKEY01') { throw 'Denied' }
        $protectedBytes = New-Object byte[] ($stored.Length - 8)
        [Array]::Copy($stored, 8, $protectedBytes, 0, $protectedBytes.Length)
        $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($protectedBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        if ($plainBytes.Length -lt 1 -or $plainBytes.Length -gt 65536) { throw 'Denied' }
        [Console]::Out.Write((@{ sid = $sid.Value; payload = [Convert]::ToBase64String($plainBytes) } | ConvertTo-Json -Compress))
    } else { throw 'Denied' }
} catch {
    [Console]::Error.Write('Protected local identity unavailable.')
    exit 1
} finally {
    if ($null -ne $stream) { $stream.Dispose() }
    if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
    if ($null -ne $protectedBytes) { [Array]::Clear($protectedBytes, 0, $protectedBytes.Length) }
}
