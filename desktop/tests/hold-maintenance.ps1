Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$held=$null;$parentProcess=$null
try{$message=[Console]::In.ReadToEnd() | ConvertFrom-Json;$parentProcess=[Diagnostics.Process]::GetProcessById([int]$message.parentId);[void]$parentProcess.Handle;$held=[Threading.Mutex]::new($false,'Local\ShopPOS-Disposable-Installer-v1');[Console]::Out.WriteLine('READY');[Console]::Out.Flush();$parentProcess.WaitForExit()}finally{if($held){$held.Dispose()};if($parentProcess){$parentProcess.Dispose()}}
