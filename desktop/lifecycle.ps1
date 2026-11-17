Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$mutex=$null;$parentProcess=$null
try {
 $m=[Console]::In.ReadToEnd() | ConvertFrom-Json
 if ((($m.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'parentId') {throw 'Denied'}
 $parentProcess=[Diagnostics.Process]::GetProcessById([int]$m.parentId)
 [void]$parentProcess.Handle
 if($parentProcess.HasExited){throw 'Denied'}
 # Installer coordination only. The existing runtime guard remains the sole writer fence.
 $mutex=[Threading.Mutex]::new($false,'Local\ShopPOS-Disposable-Desktop-v1')
 # Create the application fence BEFORE checking maintenance. Setup/uninstall
 # create their maintenance fence BEFORE checking the application fence.
 # Either ordering therefore denies a simultaneous conflicting start.
 $maintenance=$null
 try {$maintenance=[Threading.Mutex]::OpenExisting('Local\ShopPOS-Disposable-Installer-v1')}
 catch [Threading.WaitHandleCannotBeOpenedException] {}
 if($null -ne $maintenance){$maintenance.Dispose();throw 'Maintenance active'}
 [Console]::Out.WriteLine('READY');[Console]::Out.Flush()
 $parentProcess.WaitForExit()
} catch {exit 1}
finally {if($mutex){$mutex.Dispose()};if($parentProcess){$parentProcess.Dispose()}}
