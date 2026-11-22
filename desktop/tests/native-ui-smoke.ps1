param(
 [Parameter(Mandatory=$true)][string]$Bundle,
 [Parameter(Mandatory=$true)][string]$Evidence,
 [string]$LifecycleInstaller,
 [string]$SameVersionRetentionInstaller,
 [string]$ReinstallRootWithSpaces,
 [string]$UpgradeInstaller,
 [string]$InstallRoot,
 [switch]$OwnerRecoveryEntryCheck,
 [switch]$OperationKeyCrashCheck,
 [switch]$SetupPolicyCheck,
 [switch]$OwnerWorkflowsCheck,
 [switch]$SharedLoginCheck,
 [switch]$SidebarNavigationCheck,
 [switch]$ReportsPresentationCheck,
 [switch]$DisplayStateCheck,
 [string]$FreshDataRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$Bundle=[IO.Path]::GetFullPath($Bundle);$Evidence=[IO.Path]::GetFullPath($Evidence)
$release=[string](Get-Content -LiteralPath (Join-Path $Bundle 'resources/app/package.json') -Raw | ConvertFrom-Json).version
if($release -notmatch '^0\.2\.0-test\.[1-9][0-9]*$'){throw 'Exact disposable TEST bundle version required'}
[void][IO.Directory]::CreateDirectory($Evidence)
$dataRoot=Join-Path 'D:\pos\web\test-results' ('posdt-'+[guid]::NewGuid())
if($FreshDataRoot){$dataRoot=[IO.Path]::GetFullPath($FreshDataRoot)}
if([IO.Path]::GetDirectoryName($dataRoot) -cne 'D:\pos\web\test-results' -or [IO.Path]::GetFileName($dataRoot) -notmatch '^posdt-[a-f0-9-]{36}$' -or (Test-Path -LiteralPath $dataRoot)){throw 'Financial QA requires a fresh nonexistent workspace UUID root; owner data roots are forbidden'}
$record=@{format='SHOP_POS_NATIVE_UIA_TEST_V1';bundle=$Bundle;dataRoot=$dataRoot;productionActivation=$false;checks=@();status='IN_PROGRESS'}
$record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Evidence 'native-attempt.json')
$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$bytes=New-Object byte[] 24;$rng.GetBytes($bytes);$admin='Test-A9!'+[BitConverter]::ToString($bytes).Replace('-','');$rng.GetBytes($bytes);$staff='Test-S9!'+[BitConverter]::ToString($bytes).Replace('-','');[Array]::Clear($bytes,0,$bytes.Length);$rng.Dispose()
$info=New-Object Diagnostics.ProcessStartInfo
$info.FileName=Join-Path $Bundle 'Shop POS TEST.exe';$info.WorkingDirectory=$Bundle;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true;$info.Arguments='--disposable-harness --force-renderer-accessibility';$info.EnvironmentVariables['SHOP_POS_DESKTOP_TEST_DATA']=$dataRoot
if($LifecycleInstaller -or $SameVersionRetentionInstaller){$info.EnvironmentVariables['PATH']=$env:SystemRoot+'\System32;'+$env:SystemRoot+';'+$env:SystemRoot+'\System32\WindowsPowerShell\v1.0'}
 Add-Type -TypeDefinition @"
using System;using System.Text;using System.Runtime.InteropServices;
public static class ShopPosOwnedMenu {
 [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr window);
 [DllImport("user32.dll")] public static extern IntPtr GetSubMenu(IntPtr menu,int index);
 [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr menu);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetMenuString(IntPtr menu,uint item,StringBuilder text,int capacity,uint flags);
 [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr menu,int index);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
 [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr window,ref Point point); public struct Point {public int X;public int Y;}
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window,uint message,IntPtr wParam,IntPtr lParam);
}
"@
$launchClock=[Diagnostics.Stopwatch]::StartNew();$process=[Diagnostics.Process]::Start($info);$stderrTask=$process.StandardError.ReadToEndAsync()
function InvokeEnabled($control){
 $until=[DateTime]::UtcNow.AddSeconds(60)
 while(-not $control.Current.IsEnabled -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100}
 if(-not $control.Current.IsEnabled){throw 'Owned form button did not become enabled'}
 ([Windows.Automation.InvokePattern]$control.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)).Invoke()
}
function SetEnabledValue($control,[string]$value){
 $until=[DateTime]::UtcNow.AddSeconds(60)
 while(-not $control.Current.IsEnabled -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100}
 if(-not $control.Current.IsEnabled){throw 'Owned form field did not become enabled'}
 ([Windows.Automation.ValuePattern]$control.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)).SetValue($value)
}
function SaveProgress { $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Evidence 'native-progress.json') }
function OwnedWindows {
 $condition=[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,$process.Id)
 return [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,$condition)
}
function CloseOwnedWindows {
 foreach($window in (OwnedWindows)){
  $handle=[IntPtr]$window.Current.NativeWindowHandle;$ownerId=[uint32]0
  [void][ShopPosOwnedMenu]::GetWindowThreadProcessId($handle,[ref]$ownerId)
  if($ownerId -eq $process.Id){[void][ShopPosOwnedMenu]::PostMessage($handle,16,[IntPtr]::Zero,[IntPtr]::Zero)}
 }
}
function FindControl($windows,[string]$name,[Windows.Automation.ControlType]$type){
 $condition=[Windows.Automation.AndCondition]::new([Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty,$name),[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty,$type))
 foreach($window in $windows){$found=$window.FindFirst([Windows.Automation.TreeScope]::Descendants,$condition);if($null -ne $found){return $found}}
 return $null
}
function FindNamedControl($windows,[string]$name){
 $condition=[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty,$name)
 foreach($window in $windows){$found=$window.FindFirst([Windows.Automation.TreeScope]::Descendants,$condition);if($null -ne $found){return $found}}
 return $null
}
function WaitControl([string]$name,[Windows.Automation.ControlType]$type,[int]$seconds=180){
 $until=[DateTime]::UtcNow.AddSeconds($seconds)
 while([DateTime]::UtcNow -lt $until){if($process.HasExited){throw 'Owned TEST executable exited before expected control'};$found=FindControl (OwnedWindows) $name $type;if($null -ne $found){return $found};Start-Sleep -Milliseconds 300}
 throw ('Owned TEST control unavailable: '+$name)
}
function WaitNamedControl([string]$name,[int]$seconds=60){
 $until=[DateTime]::UtcNow.AddSeconds($seconds)
 while([DateTime]::UtcNow -lt $until){if($process.HasExited){throw 'Owned TEST executable exited before expected report control'};$found=FindNamedControl (OwnedWindows) $name;if($null -ne $found){return $found};Start-Sleep -Milliseconds 200}
 throw ('Owned TEST report control unavailable: '+$name)
}
function SaveReportScreenshot([string]$name,[string]$expectedTitle){
 Add-Type -AssemblyName System.Drawing
 $target=$null;$titles=@()
 foreach($window in (OwnedWindows)){
  $titles+=([string]$window.Current.Name)
  if([string]$window.Current.Name -like ('*'+$expectedTitle+'*')){$target=$window;break}
 }
 if($null -eq $target){throw ('Owned report window title unavailable: '+$expectedTitle+'; windows: '+($titles -join ' | '))}
 $rectangle=$target.Current.BoundingRectangle;$path=Join-Path $Evidence $name
 $picture=New-Object Drawing.Bitmap ([int]$rectangle.Width),([int]$rectangle.Height);$graphics=[Drawing.Graphics]::FromImage($picture)
 try{$graphics.CopyFromScreen([int]$rectangle.X,[int]$rectangle.Y,0,0,$picture.Size);$picture.Save($path,[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$picture.Dispose()}
 if(-not $record.Contains('screenshots')){$record.screenshots=@{}}
 $record.screenshots[$name]=$path;SaveProgress
}
function WaitStaffControl([string]$name,[Windows.Automation.ControlType]$type,[int]$seconds=180){
 $until=[DateTime]::UtcNow.AddSeconds($seconds)
 while([DateTime]::UtcNow -lt $until){
  if($process.HasExited){throw 'Owned TEST exited before Staff control'}
  foreach($window in (OwnedWindows)){
   if($null -eq (FindControl @($window) 'Make a Sale' ([Windows.Automation.ControlType]::Hyperlink))){continue}
   $found=FindControl @($window) $name $type
   if($null -ne $found){return $found}
  };Start-Sleep -Milliseconds 200
 };throw ('Owned Staff control unavailable: '+$name)
}

function SharedPasswordSubmit([string]$value){
 $until=[DateTime]::UtcNow.AddSeconds(180)
 while([DateTime]::UtcNow -lt $until){
  if($process.HasExited){throw 'Shared TEST process exited'}
  foreach($window in (OwnedWindows)){
   $field=FindControl @($window) 'Password' ([Windows.Automation.ControlType]::Edit)
   $open=FindControl @($window) 'Open Shop' ([Windows.Automation.ControlType]::Button)
   if($null -ne $field -and $null -ne $open -and -not $field.Current.IsOffscreen -and $field.Current.IsEnabled -and $open.Current.IsEnabled){SetEnabledValue $field $value;InvokeEnabled $open;return}
  };Start-Sleep -Milliseconds 200
 };throw 'Visible shared login unavailable'
}

function WaitPrefix([string]$prefix,[Windows.Automation.ControlType]$type,[int]$seconds=60){
 $until=[DateTime]::UtcNow.AddSeconds($seconds)
 while([DateTime]::UtcNow -lt $until){
  foreach($w in (OwnedWindows)){
   $condition=[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty,$type)
   $nodes=$w.FindAll([Windows.Automation.TreeScope]::Descendants,$condition)
   foreach($n in $nodes){if($n.Current.Name.StartsWith($prefix) -and $n.Current.IsEnabled){return $n}}
  }
  Start-Sleep -Milliseconds 200
 };throw ('Owned control prefix unavailable: '+$prefix)
}
function Installer([string]$file,[string]$name,[bool]$success){
 $log=Join-Path $Evidence ($name+'.log')
 $args=@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',('/DIR="'+$InstallRoot+'"'),('/LOG="'+$log+'"'))
 $run=Start-Process -FilePath $file -ArgumentList $args -WindowStyle Hidden -PassThru -Wait
 if(($run.ExitCode -eq 0) -ne $success){throw ('Unexpected actual installer result: '+$name+' exit '+$run.ExitCode)}
 $record.checks+=($name+' actual installer exit '+$run.ExitCode);SaveProgress
}

function WaitOwnedMenuHeading {
 $until=[DateTime]::UtcNow.AddSeconds(30)
 while([DateTime]::UtcNow -lt $until){
  if($process.HasExited){throw 'Owned TEST executable exited before native menu'}
  foreach($window in (OwnedWindows)){
   $button=FindControl @($window) 'Shop POS TEST' ([Windows.Automation.ControlType]::Button)
   if($null -eq $button -or $button.Current.IsOffscreen -or -not $button.Current.IsEnabled){continue}
   try{$point=$button.GetClickablePoint()}catch{continue}
   return @{Window=$window;Point=$point}
  }
  Start-Sleep -Milliseconds 300
 }
 throw 'Visible clickable owned native menu heading unavailable'
}

function OpenAdminRole {
 $invoked=$false
 foreach($window in (OwnedWindows)){
  $handle=[IntPtr]$window.Current.NativeWindowHandle;$ownerId=[uint32]0;[void][ShopPosOwnedMenu]::GetWindowThreadProcessId($handle,[ref]$ownerId)
  if($ownerId -ne $process.Id){continue}
  $menu=[ShopPosOwnedMenu]::GetMenu($handle);if($menu -eq [IntPtr]::Zero){continue};$submenu=[ShopPosOwnedMenu]::GetSubMenu($menu,0)
  for($index=0;$index -lt [ShopPosOwnedMenu]::GetMenuItemCount($submenu);$index++){
   $text=New-Object Text.StringBuilder 128;[void][ShopPosOwnedMenu]::GetMenuString($submenu,[uint32]$index,$text,128,1024)
   if($text.ToString().Replace('&','') -eq 'Admin'){$item=[ShopPosOwnedMenu]::GetMenuItemID($submenu,$index);if($item -eq [uint32]::MaxValue){throw 'Owned native menu command unavailable'};$invoked=[ShopPosOwnedMenu]::PostMessage($handle,273,[IntPtr]$item,[IntPtr]::Zero);break}
  }
  if($invoked){break}
 }
 if(-not $invoked){
  # Electron Views exposes its menu heading as a Button. Target a normal mouse
  # message to this owned HWND, without moving the global cursor or a debug API.
  $menu=WaitOwnedMenuHeading;$point=$menu.Point;$window=$menu.Window;$handle=[IntPtr]$window.Current.NativeWindowHandle
  $ownerId=[uint32]0;[void][ShopPosOwnedMenu]::GetWindowThreadProcessId($handle,[ref]$ownerId)
  if($ownerId -ne $process.Id){throw 'Menu window ownership changed'}
  $client=New-Object ShopPosOwnedMenu+Point;$client.X=[int]$point.X;$client.Y=[int]$point.Y
  if(-not [ShopPosOwnedMenu]::ScreenToClient($handle,[ref]$client)){throw 'Owned menu point unavailable'}
  $position=[IntPtr](($client.X -band 65535) -bor (($client.Y -band 65535) -shl 16))
  [void][ShopPosOwnedMenu]::PostMessage($handle,512,[IntPtr]::Zero,$position)
  [void][ShopPosOwnedMenu]::PostMessage($handle,513,[IntPtr]1,$position)
  [void][ShopPosOwnedMenu]::PostMessage($handle,514,[IntPtr]::Zero,$position)
  $adminMenu=WaitControl 'Admin' ([Windows.Automation.ControlType]::MenuItem) 15
  ([Windows.Automation.InvokePattern]$adminMenu.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)).Invoke()
 }
}
function ReadOperationCheckpoint {
 $desktop=Get-Content -LiteralPath (Join-Path $dataRoot 'desktop-test.json') -Raw | ConvertFrom-Json
 if([string]$desktop.id -notmatch '^[a-f0-9-]{36}$'){throw 'Invalid owned fixture routing'}
 $directory=Join-Path $dataRoot ('test-results/sqlite-b1b-part1/'+$desktop.id+'/operation-keys')
 $nativeInfo=New-Object Diagnostics.ProcessStartInfo
 $nativeInfo.FileName=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
 $nativeInfo.Arguments='-NoLogo -NoProfile -NonInteractive -File "'+(Join-Path $Bundle 'resources/payload/server/desktop/operation-keys.ps1')+'"'
 $nativeInfo.UseShellExecute=$false;$nativeInfo.CreateNoWindow=$true;$nativeInfo.RedirectStandardInput=$true;$nativeInfo.RedirectStandardOutput=$true;$nativeInfo.RedirectStandardError=$true
 $native=[Diagnostics.Process]::Start($nativeInfo);$native.StandardInput.WriteLine((@{directory=$directory;operation='read'} | ConvertTo-Json -Compress));$native.StandardInput.Close()
 $outputTask=$native.StandardOutput.ReadToEndAsync();$errorTask=$native.StandardError.ReadToEndAsync()
 if(-not $native.WaitForExit(20000) -or $native.ExitCode -ne 0 -or $errorTask.Result){throw 'Owned metadata read unavailable; no reset permitted'}
 $value=$outputTask.Result | ConvertFrom-Json
 $plain=[Convert]::FromBase64String([string]$value.value)
 try{return [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json}finally{[Array]::Clear($plain,0,$plain.Length)}
}
function RetainedDataHashes {
 $result=@{};foreach($file in (Get-ChildItem -LiteralPath $dataRoot -File -Recurse)){
  # Browser caches and the TEST lifecycle log are volatile; all identity, SQLite,
  # backups, custody and configuration bytes must remain unchanged by installers.
  $relative=$file.FullName.Substring($dataRoot.Length+1)
  if($relative -notlike 'browser\*' -and $relative -ne 'desktop-harness-lifecycle.log'){$result[$relative]=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}
 };return ($result.GetEnumerator()|Sort-Object Name|ForEach-Object {$_.Name+' '+$_.Value}) -join "`n"
}
try{
 $adminInput=WaitControl 'Admin password' ([Windows.Automation.ControlType]::Edit)
 $staffInput=WaitControl 'Salesperson password' ([Windows.Automation.ControlType]::Edit)
 if($SetupPolicyCheck){
  $beforeRejected=RetainedDataHashes
  $check=WaitControl 'I confirm this exact disposable TEST setup. Existing data must be retained.' ([Windows.Automation.ControlType]::CheckBox)
  ([Windows.Automation.TogglePattern]$check.GetCurrentPattern([Windows.Automation.TogglePattern]::Pattern)).Toggle()
  foreach($case in @('COMMON','EQUAL')){
   $a=if($case -eq 'COMMON'){[string]12345678}else{$admin};$b=if($case -eq 'COMMON'){[string]87654321}else{$admin}
   SetEnabledValue $adminInput $a;SetEnabledValue $staffInput $b
   InvokeEnabled (WaitControl 'Confirm disposable TEST setup' ([Windows.Automation.ControlType]::Button))
   [void](WaitControl 'Use two different passwords of 8–128 characters. Common and repeated passwords are rejected. Re-enter both passwords; existing data is retained.' ([Windows.Automation.ControlType]::Text) 30)
   if((RetainedDataHashes) -cne $beforeRejected){throw 'Invalid setup changed protected state'}
   $record.checks+=('actual native '+$case+' password refusal keeps setup open with exact protected bytes unchanged');SaveProgress
  }
  $a=$null;$b=$null
  ([Windows.Automation.TogglePattern]$check.GetCurrentPattern([Windows.Automation.TogglePattern]::Pattern)).Toggle()
 }
 ([Windows.Automation.ValuePattern]$adminInput.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)).SetValue($admin)
 ([Windows.Automation.ValuePattern]$staffInput.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)).SetValue($staff)
 $confirmation=WaitControl 'I confirm this exact disposable TEST setup. Existing data must be retained.' ([Windows.Automation.ControlType]::CheckBox)
 ([Windows.Automation.TogglePattern]$confirmation.GetCurrentPattern([Windows.Automation.TogglePattern]::Pattern)).Toggle()
 $submit=WaitControl 'Confirm disposable TEST setup' ([Windows.Automation.ControlType]::Button)
 ([Windows.Automation.InvokePattern]$submit.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)).Invoke()
 $record.checks+= 'actual fused Electron sandbox setup via owned-window UIAutomation; passwords only in RAM'
 SaveProgress
 $password=WaitControl 'Password' ([Windows.Automation.ControlType]::Edit)
 if($DisplayStateCheck){[void](WaitControl 'Isolated TEST' ([Windows.Automation.ControlType]::Text));if($null -ne (FindControl (OwnedWindows) 'Salesperson Isolated TEST' ([Windows.Automation.ControlType]::Text))){throw 'Shared entry still has a false role-specific label'};$record.checks+='actual installed shared entry has neutral TEST wording with original layout'}
 $record.lastLoginReadyMs=$launchClock.Elapsed.TotalMilliseconds
 $until=[DateTime]::UtcNow.AddSeconds(60);while(-not $password.Current.IsEnabled -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 200}
 SetEnabledValue $password $staff
 $open=WaitControl 'Open Shop' ([Windows.Automation.ControlType]::Button)
 $until=[DateTime]::UtcNow.AddSeconds(60);while(-not $open.Current.IsEnabled -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 200}
 $loginClock=[Diagnostics.Stopwatch]::StartNew();InvokeEnabled $open
 [void](WaitControl 'Sales History' ([Windows.Automation.ControlType]::Hyperlink))
 [void](WaitControl 'Shop server connected' ([Windows.Automation.ControlType]::Text))
 $record.firstStaffLoginMs=$loginClock.Elapsed.TotalMilliseconds;$record.firstLoginReadyMs=$record.lastLoginReadyMs
 if($DisplayStateCheck){[void](WaitControl 'Rs. 0' ([Windows.Automation.ControlType]::Text));if((WaitControl 'Create Invoice' ([Windows.Automation.ControlType]::Button)).Current.IsEnabled){throw 'Empty cart can submit a financial command'};$record.checks+='actual installed empty cart shows Rs. 0 and cannot create an invoice'}
 $record.checks+='actual packaged protected HTTPS Salesperson login and approved POS navigation'
 SaveProgress
 # Open the second role through the application's native menu, with its own session.

 if($SharedLoginCheck){
  InvokeEnabled (WaitStaffControl 'Back to Login' ([Windows.Automation.ControlType]::Button))
  $switchClock=[Diagnostics.Stopwatch]::StartNew();SharedPasswordSubmit $admin
  [void](WaitControl 'Dashboard' ([Windows.Automation.ControlType]::Hyperlink))
  $record.sharedAdminWorkspaceMs=$switchClock.Elapsed.TotalMilliseconds
  if($DisplayStateCheck){[void](WaitControl 'Rs. 0' ([Windows.Automation.ControlType]::Text));if($null -ne (FindControl (OwnedWindows) 'Unavailable' ([Windows.Automation.ControlType]::Text))){throw 'Fresh authoritative dashboard zero is still unavailable'};$record.dashboardAuthoritativeZeroMs=$switchClock.Elapsed.TotalMilliseconds;$record.checks+='actual installed Admin dashboard receives authoritative empty-shop zeros after pending state; no fake financial data'}
  $record.checks+='same original login screen accepts Admin password and opens server-authorized Admin Dashboard without native role menu';SaveProgress
 }else{OpenAdminRole}
 if(-not $SharedLoginCheck){
 $password=WaitControl 'Password' ([Windows.Automation.ControlType]::Edit)
 $record.lastLoginReadyMs=$launchClock.Elapsed.TotalMilliseconds
 $until=[DateTime]::UtcNow.AddSeconds(60);while(-not $password.Current.IsEnabled -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 200}
 SetEnabledValue $password $admin
 $open=WaitControl 'Open Shop' ([Windows.Automation.ControlType]::Button)
 $loginClock=[Diagnostics.Stopwatch]::StartNew();InvokeEnabled $open
 [void](WaitControl 'Products' ([Windows.Automation.ControlType]::Hyperlink))
 }
 if($SharedLoginCheck){$record.checks+='actual separate Admin session issued by genuine shared password verification; source login window retired'}else{$record.checks+='actual separate Admin window/login through native menu; Staff window remains independent'}
 SaveProgress
 if($SidebarNavigationCheck){
  $record.navigationMs=@{}
  foreach($step in @(@('Products','Add Product','Hyperlink'),@('Reports','View Sales Report','Hyperlink'),@('Daily Closing','Business Date (Asia/Karachi)','Edit'))){
   $pageClock=[Diagnostics.Stopwatch]::StartNew();InvokeEnabled (WaitControl $step[0] ([Windows.Automation.ControlType]::Hyperlink));$stepType=if($step[2] -eq 'Edit'){[Windows.Automation.ControlType]::Edit}else{[Windows.Automation.ControlType]::Hyperlink};[void](WaitControl $step[1] $stepType);$record.navigationMs[$step[0]]=$pageClock.Elapsed.TotalMilliseconds;SaveProgress
  }
  $record.checks+='actual installed protected Products, Reports and Daily Closing sidebar pages render with recorded navigation timings';SaveProgress
 }
 if($SharedLoginCheck -and -not $OwnerWorkflowsCheck){
  InvokeEnabled (WaitControl 'Back to Login' ([Windows.Automation.ControlType]::Button));SharedPasswordSubmit $staff
  [void](WaitStaffControl 'Sales History' ([Windows.Automation.ControlType]::Hyperlink))
  $record.checks+='same original Admin-origin login screen accepts Salesperson password and opens protected POS';SaveProgress
 }
 if($OwnerWorkflowsCheck){
  $productName='Owner acceptance '+[guid]::NewGuid().ToString('N').Substring(0,10);$record.productName=$productName
  InvokeEnabled (WaitControl 'Products' ([Windows.Automation.ControlType]::Hyperlink))
  InvokeEnabled (WaitControl 'Add Product' ([Windows.Automation.ControlType]::Hyperlink))
  foreach($item in @(@('Product Name *',$productName),@('Buying Price (Rs.) *','100'),@('Selling Price (Rs.)','150'),@('Stock Quantity *','12'),@('Low Stock Alert *','3'))){SetEnabledValue (WaitControl $item[0] ([Windows.Automation.ControlType]::Edit)) $item[1]}
  InvokeEnabled (WaitControl 'Save Product' ([Windows.Automation.ControlType]::Button))
  InvokeEnabled (WaitControl 'View Products' ([Windows.Automation.ControlType]::Hyperlink))
  [void](WaitControl $productName ([Windows.Automation.ControlType]::Text))
  $record.checks+='actual installed Admin UI creates product with stock12 and saved inventory';SaveProgress
  if($SharedLoginCheck){
   InvokeEnabled (WaitControl 'Back to Login' ([Windows.Automation.ControlType]::Button))
   $switchClock=[Diagnostics.Stopwatch]::StartNew();SharedPasswordSubmit $staff
   [void](WaitStaffControl 'Sales History' ([Windows.Automation.ControlType]::Hyperlink))
   $record.sharedStaffWorkspaceMs=$switchClock.Elapsed.TotalMilliseconds
   $record.checks+='same original login screen accepts Salesperson password from Admin entry and opens server-authorized POS';SaveProgress
  }

  InvokeEnabled (WaitStaffControl 'Sales History' ([Windows.Automation.ControlType]::Hyperlink))
  InvokeEnabled (WaitControl 'Make a Sale' ([Windows.Automation.ControlType]::Hyperlink))
  SetEnabledValue (WaitControl 'Find Product' ([Windows.Automation.ControlType]::ComboBox)) $productName
  InvokeEnabled (WaitPrefix ($productName+' ') ([Windows.Automation.ControlType]::Button))
  InvokeEnabled (WaitControl 'Create Invoice' ([Windows.Automation.ControlType]::Button))
  SetEnabledValue (WaitControl 'Cash Tendered (PKR, planned until handover)' ([Windows.Automation.ControlType]::Edit)) '150'
  InvokeEnabled (WaitControl 'Allow Cash Handover' ([Windows.Automation.ControlType]::Button))
  $cashCheck=WaitPrefix 'I verified the actual cash received and change once on ' ([Windows.Automation.ControlType]::CheckBox)
  ([Windows.Automation.TogglePattern]$cashCheck.GetCurrentPattern([Windows.Automation.TogglePattern]::Pattern)).Toggle()
  InvokeEnabled (WaitControl 'Confirm Cash and Save' ([Windows.Automation.ControlType]::Button))
  InvokeEnabled (WaitControl 'Done' ([Windows.Automation.ControlType]::Button))
  InvokeEnabled (WaitStaffControl 'Sales History' ([Windows.Automation.ControlType]::Hyperlink))
  InvokeEnabled (WaitStaffControl 'View Invoice' ([Windows.Automation.ControlType]::Button))
  InvokeEnabled (WaitControl 'Done' ([Windows.Automation.ControlType]::Button))
  $record.checks+='actual installed Staff UI original-key cash admission/sale150, saved invoice and history re-open without financial replay';SaveProgress
  if($DisplayStateCheck -and $SharedLoginCheck){
   InvokeEnabled (WaitStaffControl 'Back to Login' ([Windows.Automation.ControlType]::Button));SharedPasswordSubmit $admin
   [void](WaitControl 'Dashboard' ([Windows.Automation.ControlType]::Hyperlink));[void](WaitControl 'Rs. 150' ([Windows.Automation.ControlType]::Text));[void](WaitControl 'Rs. 50' ([Windows.Automation.ControlType]::Text))
   if($null -ne (FindControl (OwnedWindows) 'Unavailable' ([Windows.Automation.ControlType]::Text))){throw 'Saved sale dashboard is unavailable'}
   $record.checks+='actual installed Dashboard reports sole sale revenue150/profit50 after role switch; saved figures are not demo zeros';SaveProgress
   InvokeEnabled (WaitControl 'Reports' ([Windows.Automation.ControlType]::Hyperlink));InvokeEnabled (WaitControl 'View Sales Report' ([Windows.Automation.ControlType]::Hyperlink));[void](WaitControl 'Rs. 150' ([Windows.Automation.ControlType]::Text))
   $record.checks+='actual installed sales report resolves current saved revenue150 after pending state';SaveProgress
  }
  if($ReportsPresentationCheck){
   if(-not $OwnerWorkflowsCheck -or -not $SharedLoginCheck){throw 'Actual report presentation check requires the isolated saved-sale workflow and shared role login'}
   SaveReportScreenshot 'reports-sales-chart.png' 'Sales Report'
   [void](WaitNamedControl 'Sales by Product')
   [void](WaitNamedControl 'Total Sales')
   [void](WaitNamedControl 'Items Sold')
   [void](WaitNamedControl 'Products Sold')
   [void](WaitNamedControl 'Sales Details')
   if($null -ne (FindNamedControl (OwnedWindows) 'Daily Sales Revenue')){throw 'Replacement sales time-series panel is present'}
   InvokeEnabled (WaitNamedControl 'View Sales Details')
   SaveReportScreenshot 'reports-sales-details.png' 'Sales Report'
   InvokeEnabled (WaitNamedControl ('View sales for '+$productName))
   [void](WaitNamedControl ('Individual sales for '+$productName))
   [void](WaitNamedControl 'Sale')
   $record.checks+='actual packaged Sales Report renders the saved SQLite sale, approved product chart/table, and View sales details';SaveProgress

   InvokeEnabled (WaitControl 'Reports' ([Windows.Automation.ControlType]::Hyperlink))
   InvokeEnabled (WaitControl 'View Profit Report' ([Windows.Automation.ControlType]::Hyperlink))
   SaveReportScreenshot 'reports-profit-chart.png' 'Profit Report'
   [void](WaitNamedControl 'Profit by Product')
   [void](WaitNamedControl 'Gross Profit')
   [void](WaitNamedControl 'Cost of Sold Items')
   [void](WaitNamedControl 'Highest Profit Product')
   [void](WaitNamedControl 'Profit Details')
   if($null -ne (FindNamedControl (OwnedWindows) 'Gross profit comparison') -or $null -ne (FindNamedControl (OwnedWindows) 'Daily Gross Profit')){throw 'Replacement profit report panels are present'}
   InvokeEnabled (WaitNamedControl 'View Profit Details')
   SaveReportScreenshot 'reports-profit-details.png' 'Profit Report'
   [void](WaitNamedControl $productName)
   $search=WaitControl 'Search by product name' ([Windows.Automation.ControlType]::Edit)
   SetEnabledValue $search '__no_matching_report_product__'
   [void](WaitNamedControl 'No products match your search in this period.' 30)
   InvokeEnabled (WaitNamedControl 'Clear search')
   [void](WaitNamedControl $productName 30)
   if($null -ne (FindNamedControl (OwnedWindows) 'Show Top 5')){$record.checks+='actual packaged Profit chart exposes Show Top 5 for its current product count'}else{$record.checks+='actual packaged one-product fixture has no Show Top 5 control; six-product interaction covered by focused UI tests'}
   $record.checks+='actual packaged Profit Report renders the saved SQLite sale, approved product chart/table, search and Clear Search';SaveProgress
  }
 }
 $second=[Diagnostics.Process]::Start($info);$secondExit=$second.WaitForExit(60000)
 if(-not $secondExit -or $process.HasExited){throw 'Single-instance handoff not confirmed'}
 $record.checks+='second EXE instance exits while the original role windows/backend remain live'
 SaveProgress
 if($OwnerRecoveryEntryCheck){
  $fakeArchive=Join-Path $Evidence 'not-a-backup.age';[IO.File]::WriteAllText($fakeArchive,'DISPOSABLE_UI_ONLY_NOT_AN_ARCHIVE')
  $menu=WaitOwnedMenuHeading;$point=$menu.Point;$menuWindow=$menu.Window;$handle=[IntPtr]$menuWindow.Current.NativeWindowHandle;$ownerId=[uint32]0
  [void][ShopPosOwnedMenu]::GetWindowThreadProcessId($handle,[ref]$ownerId);if($ownerId -ne $process.Id){throw 'Recovery menu ownership changed'}
  $client=New-Object ShopPosOwnedMenu+Point;$client.X=[int]$point.X;$client.Y=[int]$point.Y
  if(-not [ShopPosOwnedMenu]::ScreenToClient($handle,[ref]$client)){throw 'Recovery menu point unavailable'}
  $position=[IntPtr](($client.X -band 65535) -bor (($client.Y -band 65535) -shl 16))
  [void][ShopPosOwnedMenu]::PostMessage($handle,512,[IntPtr]::Zero,$position);[void][ShopPosOwnedMenu]::PostMessage($handle,513,[IntPtr]1,$position);[void][ShopPosOwnedMenu]::PostMessage($handle,514,[IntPtr]::Zero,$position)
  $recoverMenu=WaitControl 'Recover disposable TEST archive...' ([Windows.Automation.ControlType]::MenuItem) 15
  ([Windows.Automation.InvokePattern]$recoverMenu.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)).Invoke()
  $filename=WaitControl 'File name:' ([Windows.Automation.ControlType]::Edit) 20
  ([Windows.Automation.ValuePattern]$filename.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)).SetValue($fakeArchive)
  InvokeEnabled (WaitControl 'Open' ([Windows.Automation.ControlType]::Button) 20)
  [void](WaitControl 'Current source Admin password' ([Windows.Automation.ControlType]::Edit) 30)
  [void](WaitControl 'Restored Admin password' ([Windows.Automation.ControlType]::Edit) 15)
  [void](WaitControl 'Restored Salesperson password' ([Windows.Automation.ControlType]::Edit) 15)
  $expectedDescription='Archive: not-a-backup.age; SHA256: '+(Get-FileHash -LiteralPath $fakeArchive -Algorithm SHA256).Hash.ToLowerInvariant()
  [void](WaitControl $expectedDescription ([Windows.Automation.ControlType]::Text) 20)
  $confirmButton=WaitControl 'Confirm TEST operation' ([Windows.Automation.ControlType]::Button) 15
  $until=[DateTime]::UtcNow.AddSeconds(20);while(-not $confirmButton.Current.IsEnabled -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100}
  if(-not $confirmButton.Current.IsEnabled){throw 'Trusted owner context bridge did not initialize'}
  $ownerForm=$null;foreach($window in (OwnedWindows)){if($window.Current.Name -eq 'Shop POS TEST owner recovery'){$ownerForm=$window;break}}
  if($null -eq $ownerForm){throw 'Owned native recovery form not identified'}
  $handle=[IntPtr]$ownerForm.Current.NativeWindowHandle;$ownerId=[uint32]0;[void][ShopPosOwnedMenu]::GetWindowThreadProcessId($handle,[ref]$ownerId);if($ownerId -ne $process.Id){throw 'Native recovery form ownership changed'}
  [void][ShopPosOwnedMenu]::PostMessage($handle,16,[IntPtr]::Zero,[IntPtr]::Zero)
  [void](WaitControl 'Products' ([Windows.Automation.ControlType]::Hyperlink) 30)
  if($process.HasExited){throw 'Cancelling native recovery unexpectedly stopped the shop'}
  $record.checks+='actual native recovery file picker and isolated owner password form; cancelled before authorization, existing shop stays live';SaveProgress
 }
 if($OperationKeyCrashCheck){
  InvokeEnabled (WaitControl 'Products' ([Windows.Automation.ControlType]::Hyperlink))
  InvokeEnabled (WaitControl 'Add Product' ([Windows.Automation.ControlType]::Hyperlink))
  $productName='TEST native checkpoint '+[guid]::NewGuid().ToString().Substring(0,8)
  foreach($entry in @(@('Product Name *',$productName),@('Buying Price (Rs.) *','100'),@('Selling Price (Rs.)','110'),@('Stock Quantity *','12'),@('Low Stock Alert *','2'))){
   $control=WaitControl $entry[0] ([Windows.Automation.ControlType]::Edit)
   SetEnabledValue $control $entry[1]
  }
  $desktop=Get-Content -LiteralPath (Join-Path $dataRoot 'desktop-test.json') -Raw | ConvertFrom-Json
  $checkpoint=Join-Path $dataRoot ('test-results/sqlite-b1b-part1/'+$desktop.id+'/operation-keys/markers.dpapi')
  $before=(Get-Item -LiteralPath $checkpoint).LastWriteTimeUtc
  $ownedBackends=@(Get-CimInstance Win32_Process | Where-Object {$_.ParentProcessId -eq $process.Id -and $_.Name -eq 'node.exe'})
  if($ownedBackends.Count -ne 1){throw 'Exact owned backend could not be established before controlled TEST crash'}
  $ownedBackend=Get-Process -Id $ownedBackends[0].ProcessId
  InvokeEnabled (WaitControl 'Save Product' ([Windows.Automation.ControlType]::Button))
  $until=[DateTime]::UtcNow.AddSeconds(30)
  while((Get-Item -LiteralPath $checkpoint).LastWriteTimeUtc -eq $before -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 30}
  if((Get-Item -LiteralPath $checkpoint).LastWriteTimeUtc -eq $before){throw 'Native checkpoint was not acknowledged; financial crash case not executed'}
  Start-Sleep -Milliseconds 800
  # Only this harness-created main process is interrupted. Its original backend
  # must genuinely drain on IPC disconnect before another EXE may start.
  $record.crashedOwnedMainPid=$process.Id;$process.Kill();[void]$process.WaitForExit(15000)
  if(-not $ownedBackend.WaitForExit(60000)){throw 'Owned backend drain after main crash unconfirmed; data/process retained'}
  $stderrTask.Result | Set-Content -LiteralPath (Join-Path $Evidence 'controlled-main-crash-stderr.log')
  $saved=(ReadOperationCheckpoint).slots.ADMIN.inventory
  if($null -eq $saved -or $saved.kind -ne 'CREATE' -or $saved.state -notin @('PENDING','CONFIRMED')){throw 'Original inventory marker missing after actual main crash'}
  $record.markerStateAfterMainCrash=$saved.state
  $launchClock=[Diagnostics.Stopwatch]::StartNew();$process=[Diagnostics.Process]::Start($info);$stderrTask=$process.StandardError.ReadToEndAsync()
  $password=WaitControl 'Password' ([Windows.Automation.ControlType]::Edit)
 $record.lastLoginReadyMs=$launchClock.Elapsed.TotalMilliseconds
  SetEnabledValue $password $staff
  InvokeEnabled (WaitControl 'Open Shop' ([Windows.Automation.ControlType]::Button));[void](WaitControl 'Sales History' ([Windows.Automation.ControlType]::Hyperlink))
  OpenAdminRole
  $password=WaitControl 'Password' ([Windows.Automation.ControlType]::Edit)
 $record.lastLoginReadyMs=$launchClock.Elapsed.TotalMilliseconds
  SetEnabledValue $password $admin
  InvokeEnabled (WaitControl 'Open Shop' ([Windows.Automation.ControlType]::Button));[void](WaitControl 'Products' ([Windows.Automation.ControlType]::Hyperlink))
  $after=(ReadOperationCheckpoint).slots.ADMIN.inventory
  if($after.key -cne $saved.key -or $after.context -cne $saved.context -or $after.kind -cne $saved.kind){throw 'Native restart changed the original marker binding'}
  InvokeEnabled (WaitControl 'Products' ([Windows.Automation.ControlType]::Hyperlink))
  InvokeEnabled (WaitControl 'Add Product' ([Windows.Automation.ControlType]::Hyperlink))
  $resolve=WaitControl 'Resolve Previous Operation' ([Windows.Automation.ControlType]::Button)
  if((WaitControl 'Save Product' ([Windows.Automation.ControlType]::Button)).Current.IsEnabled){throw 'New mutation was enabled with an unresolved original marker'}
  InvokeEnabled $resolve
  $until=[DateTime]::UtcNow.AddSeconds(20);$ack=$null
  while([DateTime]::UtcNow -lt $until){$ack=FindControl (OwnedWindows) 'Acknowledge Saved Operation' ([Windows.Automation.ControlType]::Button);if($null -ne $ack){break};Start-Sleep -Milliseconds 250}
  if($null -ne $ack){$record.controlledCrashOutcome='COMMITTED';[void](WaitControl $productName ([Windows.Automation.ControlType]::Text))}
  else{
   InvokeEnabled (WaitControl 'Review Cancellation' ([Windows.Automation.ControlType]::Button))
   InvokeEnabled (WaitControl 'Confirm Resolve or Cancel' ([Windows.Automation.ControlType]::Button))
   $until=[DateTime]::UtcNow.AddSeconds(30)
   while([DateTime]::UtcNow -lt $until){$ack=FindControl (OwnedWindows) 'Acknowledge Saved Operation' ([Windows.Automation.ControlType]::Button);if($null -ne $ack){$record.controlledCrashOutcome='COMMITTED';break};$ack=FindControl (OwnedWindows) 'Acknowledge Cancelled Operation' ([Windows.Automation.ControlType]::Button);if($null -ne $ack){$record.controlledCrashOutcome='CANCELLED';break};Start-Sleep -Milliseconds 250}
  }
  if($null -eq $ack){throw 'Original operation terminal outcome unconfirmed; no replacement operation permitted'}
  InvokeEnabled $ack
  $until=[DateTime]::UtcNow.AddSeconds(30)
  while([DateTime]::UtcNow -lt $until){$after=(ReadOperationCheckpoint).slots.ADMIN.inventory;if($null -eq $after){break};Start-Sleep -Milliseconds 200}
  if($null -ne $after){throw 'Explicit fresh terminal acknowledgement did not clear only the original marker'}
  $saved=$null;$after=$null
  $record.checks+='actual fused EXE metadata claim before inventory POST, owned-main crash, original backend drain, fresh both-role login, exact original key/context recovery, replacement-save refusal and explicit authenticated terminal acknowledgement';SaveProgress
 }
 if($SameVersionRetentionInstaller){Installer $SameVersionRetentionInstaller 'current-live-app-install-refused' $false}
 if($LifecycleInstaller){Installer $LifecycleInstaller 'live-app-install-refused' $false}
 CloseOwnedWindows
 if(-not $process.WaitForExit(60000)){throw 'First packaged shutdown did not drain'}
 if($SameVersionRetentionInstaller){
  if(-not $InstallRoot -or $LifecycleInstaller -or $UpgradeInstaller){throw 'Isolated current-release retention arguments required'}
  $resolvedInstall=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
  $expectedInstall='D:\pos\desktop\test-results\lifecycle-spaced-1f90d010-c2b6-486d-a38d-5b4fbbf58c8b\Shop POS TEST installed'
  if($resolvedInstall -cne $expectedInstall -or -not $Bundle.StartsWith($resolvedInstall+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Owned disposable install root mismatch; no uninstall performed'}
  $registration=Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{D2F97747-843B-4FB6-8E58-61B1BDF80F9E}_is1'
  if(([string]$registration.InstallLocation).TrimEnd('\') -cne $resolvedInstall -or [string]$registration.DisplayVersion -cne $release){throw 'Registration is not the exact owned TEST release; no uninstall performed'}
  $reinstallTarget=$resolvedInstall
  if($ReinstallRootWithSpaces){
   $reinstallTarget=[IO.Path]::GetFullPath($ReinstallRootWithSpaces).TrimEnd('\')
   $safeParent='D:\pos\desktop\test-results\'
   if(-not $reinstallTarget.StartsWith($safeParent,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($reinstallTarget) -cne 'Shop POS TEST installed' -or [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($reinstallTarget)) -notmatch '^lifecycle-spaced-[a-f0-9-]{36}$' -or (Test-Path -LiteralPath $reinstallTarget)){throw 'Fresh owned spaced TEST install target not confirmed; no uninstall performed'}
  }
  $beforeData=RetainedDataHashes
  $uninstaller=Join-Path $resolvedInstall 'unins000.exe'
  $removed=Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="'+(Join-Path $Evidence 'current-release-uninstall.log')+'"')) -WindowStyle Hidden -PassThru -Wait
  if($removed.ExitCode -ne 0 -or (RetainedDataHashes) -cne $beforeData){throw 'Current-release uninstall or exact protected data/operation-key retention failed'}
  $record.checks+='actual current-release uninstall preserves every protected SQLite/custody/backup/DPAPI operation-key byte';SaveProgress
  $InstallRoot=$reinstallTarget
  Installer $SameVersionRetentionInstaller 'current-retained-data-reinstall' $true
  if($ReinstallRootWithSpaces){$Bundle=Join-Path $reinstallTarget ('versions/'+$release);$record.reinstalledBundle=$Bundle;$info.FileName=Join-Path $Bundle 'Shop POS TEST.exe';$info.WorkingDirectory=$Bundle}
  if((RetainedDataHashes) -cne $beforeData -or -not(Test-Path -LiteralPath $info.FileName)){throw 'Reinstall changed protected retained data or did not restore current code'}
  $record.checks+='actual current-release reinstall preserves original native operation-key checkpoint and protected data bytes';SaveProgress
 }
 if($LifecycleInstaller){
  if(-not $UpgradeInstaller -or -not $InstallRoot){throw 'Complete disposable installer arguments required'}
  $beforeData=RetainedDataHashes;$hash=[Security.Cryptography.SHA256]::Create();try{$record.retainedDataSha256=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($beforeData))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()};Start-Sleep -Seconds 2
  Installer $LifecycleInstaller 'existing-version-overwrite-refused' $false
  Installer $UpgradeInstaller 'versioned-upgrade' $true
  if(-not(Test-Path -LiteralPath $Bundle)){throw 'Prior compatible application version was not retained'}
  Installer $UpgradeInstaller 'upgrade-version-overwrite-refused' $false
  $uninstaller=Join-Path $InstallRoot 'unins000.exe'
  $removed=Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="'+(Join-Path $Evidence 'uninstall.log')+'"')) -WindowStyle Hidden -PassThru -Wait
  if($removed.ExitCode -ne 0 -or (RetainedDataHashes) -ne $beforeData){throw 'Uninstall failed or protected data bytes changed'}
  $record.checks+='actual uninstall retains all protected SQLite/identity/custody/configuration/backup bytes';SaveProgress
  Installer $UpgradeInstaller 'retained-data-reinstall' $true
  if((RetainedDataHashes) -ne $beforeData){throw 'Reinstall changed retained protected data bytes'}
  $Bundle=Join-Path $InstallRoot 'versions/0.2.0-test.2';$record.reinstalledBundle=$Bundle;$info.FileName=Join-Path $Bundle 'Shop POS TEST.exe';$info.WorkingDirectory=$Bundle
 }
 $launchClock=[Diagnostics.Stopwatch]::StartNew();$process=[Diagnostics.Process]::Start($info);$stderrTask=$process.StandardError.ReadToEndAsync()
 $password=WaitControl 'Password' ([Windows.Automation.ControlType]::Edit)
 $record.lastLoginReadyMs=$launchClock.Elapsed.TotalMilliseconds
 $until=[DateTime]::UtcNow.AddSeconds(60);while(-not $password.Current.IsEnabled -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 200}
 SetEnabledValue $password $staff
 $open=WaitControl 'Open Shop' ([Windows.Automation.ControlType]::Button)
 $loginClock=[Diagnostics.Stopwatch]::StartNew();InvokeEnabled $open
 [void](WaitControl 'Sales History' ([Windows.Automation.ControlType]::Hyperlink))
 [void](WaitControl 'Shop server connected' ([Windows.Automation.ControlType]::Text))
 $record.checks+='actual EXE relaunch retains original protected credentials and requires fresh Staff login'
 SaveProgress
 if($OwnerWorkflowsCheck){
  InvokeEnabled (WaitStaffControl 'Sales History' ([Windows.Automation.ControlType]::Hyperlink))
  InvokeEnabled (WaitStaffControl 'View Invoice' ([Windows.Automation.ControlType]::Button))
  [void](WaitControl 'Done' ([Windows.Automation.ControlType]::Button))
  $record.checks+='actual EXE restart and fresh Staff login reopen saved invoice; original product/sale persist';SaveProgress
 }
 $record.status='PASS'
}catch{
 $record.status='FAIL';$record.error=$_.Exception.Message
 try{Add-Type -AssemblyName System.Drawing;$captureIndex=0;foreach($owned in (OwnedWindows)){if($owned.Current.Name -notmatch 'Shop POS|Shop POS TEST|Sales History|Make a Sale'){continue};$rectangle=$owned.Current.BoundingRectangle;if($rectangle.Width -lt 1 -or $rectangle.Height -lt 1){continue};$picture=New-Object Drawing.Bitmap ([int]$rectangle.Width),([int]$rectangle.Height);$graphics=[Drawing.Graphics]::FromImage($picture);try{$graphics.CopyFromScreen([int]$rectangle.X,[int]$rectangle.Y,0,0,$picture.Size);$picture.Save((Join-Path $Evidence ('owned-failure-'+($captureIndex++)+'.png')),[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$picture.Dispose()}}}catch{}
 $controls=@();foreach($window in (OwnedWindows)){$nodes=$window.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition);foreach($node in $nodes){$current=$node.Current;if(-not $current.IsPassword){$controls+=@{name=$current.Name;type=[string]$current.ControlType;controlTypeId=$current.ControlType.Id;enabled=$current.IsEnabled}}}}
 $controls | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $Evidence 'owned-controls.json')
}finally{
 $admin=$null;$staff=$null
 # Normal native close asks the app to drain its original backend; never force-kill it.
 CloseOwnedWindows
 $closed=$process.WaitForExit(60000);$record.drainedExitObserved=$closed
 if(-not $closed){$record.status='FAIL';$record.shutdown='NOT_VERIFIED; owned process retained'}
 if($closed){if($stderrTask.Wait(5000)){$stderrTask.Result | Set-Content -LiteralPath (Join-Path $Evidence 'desktop-stderr.log')}else{$record.status='FAIL';$record.stderrDrain='NOT_VERIFIED; redirected stream retained'}}
 $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Evidence 'native-result.json')
}
$record | ConvertTo-Json -Depth 5
if($record.status -ne 'PASS'){exit 1}
