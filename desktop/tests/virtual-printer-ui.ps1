Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$null=[Windows.Automation.AutomationElement]::RootElement
$providerAssembly=[Reflection.Assembly]::LoadWithPartialName("UIAutomationClientsideProviders")
if($null -eq $providerAssembly){throw "Built-in Microsoft UI Automation providers unavailable"}
$providerType=$providerAssembly.GetType("UIAutomationClientsideProviders.UIAutomationClientSideProviders",$true)
$providerTable=$providerType.GetField("ClientSideProviderDescriptionTable",[Reflection.BindingFlags]"Public,NonPublic,Static").GetValue($null)
if($null -eq $providerTable -or $providerTable.Count -lt 1){throw "Built-in native control descriptions unavailable"}
[Windows.Automation.ClientSettings]::RegisterClientSideProviders($providerTable)
Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;public static class PosPrintOwnedWindow{
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [StructLayout(LayoutKind.Sequential)]public struct Rect{public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint f);
 [DllImport("user32.dll")]public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
}
"@
$inputText=[Console]::In.ReadToEnd();$supplied=$inputText|ConvertFrom-Json;$inputText=$null
$bundle=[IO.Path]::GetFullPath([string]$supplied.bundle);$evidence=[IO.Path]::GetFullPath([string]$supplied.evidence);$dataRoot=[IO.Path]::GetFullPath([string]$supplied.dataRoot);$pdf=[IO.Path]::GetFullPath([string]$supplied.pdf)
if(-not $dataRoot.StartsWith('D:\pos\web\test-results\posdt-',[StringComparison]::OrdinalIgnoreCase) -or -not $pdf.StartsWith($evidence+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $pdf)){throw 'Confined fresh disposable print output required'}
$record=@{format='SHOP_POS_WINDOWS_VIRTUAL_PRINT_UIA_V1';productionActivation=$false;checks=@();status='IN_PROGRESS';submissionAttempted=$false}
function SaveProgress {$record|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $evidence 'windows-print-progress.json')}
$info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=Join-Path $bundle 'Shop POS TEST.exe';$info.WorkingDirectory=$bundle;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true;$info.Arguments='--disposable-harness --force-renderer-accessibility';$info.EnvironmentVariables['SHOP_POS_DESKTOP_TEST_DATA']=$dataRoot
$process=[Diagnostics.Process]::Start($info);$probe=$supplied.PSObject.Properties["closedStderrProbe"];$closedDiagnosticProbe=$null -ne $probe -and [bool]$probe.Value;if($closedDiagnosticProbe){$process.StandardError.Dispose();$stderr=$null;$record.stderrIntentionallyClosed=$true}else{$stderr=$process.StandardError.ReadToEndAsync()};$record.mainPid=$process.Id;SaveProgress
function Windows { if($process.HasExited){return @()};$process.Refresh();$seen=@{};$roots=New-Object System.Collections.Generic.List[System.Windows.Automation.AutomationElement];$handle=$process.MainWindowHandle;if($handle -ne [IntPtr]::Zero){$owner=[uint32]0;[void][PosPrintOwnedWindow]::GetWindowThreadProcessId($handle,[ref]$owner);if($owner -eq $process.Id){$w=[Windows.Automation.AutomationElement]::FromHandle($handle);$roots.Add($w);$seen[$handle.ToInt64()]=$true}};$c=[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,$process.Id);foreach($w in [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,$c)){$h=[IntPtr]$w.Current.NativeWindowHandle;$owner=[uint32]0;[void][PosPrintOwnedWindow]::GetWindowThreadProcessId($h,[ref]$owner);if($h -ne [IntPtr]::Zero -and $owner -eq $process.Id -and -not $seen.ContainsKey($h.ToInt64())){$roots.Add($w);$seen[$h.ToInt64()]=$true}};return $roots.ToArray() }
function Find($roots,[string]$name,[Windows.Automation.ControlType]$type){$c=[Windows.Automation.AndCondition]::new([Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty,$name),[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty,$type));foreach($w in $roots){$v=$w.FindFirst([Windows.Automation.TreeScope]::Descendants,$c);if($null -ne $v){return $v}};return $null}
function Wait([string]$name,[Windows.Automation.ControlType]$type,[int]$seconds=180){$until=[DateTime]::UtcNow.AddSeconds($seconds);while([DateTime]::UtcNow -lt $until){if($process.HasExited){throw 'Owned app exited'};$v=Find (Windows) $name $type;if($null -ne $v){return $v};Start-Sleep -Milliseconds 250};throw ('Expected owned print control absent: '+$name)}
function Invoke($c){$until=[DateTime]::UtcNow.AddSeconds(60);while(-not $c.Current.IsEnabled -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100};if(-not $c.Current.IsEnabled){throw 'Expected enabled owned control'};([Windows.Automation.InvokePattern]$c.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)).Invoke()}
function SetValue($c,[string]$value){$until=[DateTime]::UtcNow.AddSeconds(60);while(-not $c.Current.IsEnabled -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100};([Windows.Automation.ValuePattern]$c.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)).SetValue($value)}

function ActivateOwnedLogin {
 foreach($w in (Windows)){
  $handle=[IntPtr]$w.Current.NativeWindowHandle;$owner=[uint32]0
  [void][PosPrintOwnedWindow]::GetWindowThreadProcessId($handle,[ref]$owner)
  if($handle -eq [IntPtr]::Zero -or $owner -ne $process.Id -or $w.Current.Name -notlike '*Shop POS*'){continue}
  $record.loginWindowBeforeActivation=@{offscreen=$w.Current.IsOffscreen;enabled=$w.Current.IsEnabled};SaveProgress
  try{
   Add-Type -AssemblyName System.Drawing
   $rect=New-Object PosPrintOwnedWindow+Rect
   if([PosPrintOwnedWindow]::GetWindowRect($handle,[ref]$rect) -and ($rect.Right-$rect.Left) -gt 0 -and ($rect.Bottom-$rect.Top) -gt 0){
    $bmp=[System.Drawing.Bitmap]::new(($rect.Right-$rect.Left),($rect.Bottom-$rect.Top))
    $g=[System.Drawing.Graphics]::FromImage($bmp);$dc=$g.GetHdc()
    try{$captured=[PosPrintOwnedWindow]::PrintWindow($handle,$dc,2)}finally{$g.ReleaseHdc($dc)}
    if($captured){$bmp.Save((Join-Path $evidence 'owned-login-before-activation.png'),[System.Drawing.Imaging.ImageFormat]::Png)}
    $g.Dispose();$bmp.Dispose()
   }
  }catch{$record.captureDiagnostic='Owned-window image unavailable'}
  [void][PosPrintOwnedWindow]::ShowWindow($handle,9)
  $record.ownedForegroundRequested=[PosPrintOwnedWindow]::SetForegroundWindow($handle)
  try{$w.SetFocus()}catch{}
  SaveProgress;return
 }
 throw 'Exact owned Login window absent; no desktop or foreign window activated'
}

try{
 $until=[DateTime]::UtcNow.AddSeconds(180);$process.Refresh();while($process.MainWindowHandle -eq [IntPtr]::Zero -and -not $process.HasExited -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 250;$process.Refresh()}
 ActivateOwnedLogin
 $record.stage="LOGIN_FIELD";SaveProgress
 SetValue (Wait 'Password' ([Windows.Automation.ControlType]::Edit)) ([string]$supplied.staffPassword)
 $record.stage='LOGIN_SUBMIT';SaveProgress
 Invoke (Wait 'Open Shop' ([Windows.Automation.ControlType]::Button))
 $record.stage='HISTORY';SaveProgress
 Invoke (Wait 'Sales History' ([Windows.Automation.ControlType]::Hyperlink))
 $until=[DateTime]::UtcNow.AddSeconds(90);$view=$null
 while([DateTime]::UtcNow -lt $until -and $null -eq $view){foreach($w in (Windows)){$buttons=$w.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Button));foreach($b in $buttons){if($b.Current.Name -match '^View(?:\s|$)' -and $b.Current.IsEnabled){$view=$b;break}}};if($null -eq $view){Start-Sleep -Milliseconds 250}}
 if($null -eq $view){throw 'Genuine saved invoice View unavailable'};Invoke $view
 $print=Wait 'Print' ([Windows.Automation.ControlType]::Button) 90
 $names=@();foreach($w in (Windows)){$nodes=$w.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition);foreach($n in $nodes){if(-not $n.Current.IsPassword){$names+=$n.Current.Name}}}
 if(-not (($names -join ' ').Contains([string]$supplied.invoiceNumber))){throw 'Exact original saved invoice not visible before print'}
 $record.checks+='genuine fresh Staff login and exact saved original invoice visible in actual fused EXE';SaveProgress
 Invoke $print
 $until=[DateTime]::UtcNow.AddSeconds(60);$dialog=$null;$printer=$null
 while([DateTime]::UtcNow -lt $until -and $null -eq $printer){foreach($w in (Windows)){$nativeWindow=if($w.Current.Name -eq 'Print'){$w}else{Find @($w) 'Print' ([Windows.Automation.ControlType]::Window)};if($null -ne $nativeWindow){$candidate=Find @($nativeWindow) 'Microsoft Print to PDF' ([Windows.Automation.ControlType]::ListItem);if($null -ne $candidate){$dialog=$nativeWindow;$printer=$candidate;break}}};if($null -eq $printer){Start-Sleep -Milliseconds 250}}
 if($null -eq $printer){throw 'Native Microsoft Print to PDF selection not identified; no submission'}
 $selection=[Windows.Automation.SelectionItemPattern]$printer.GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern);$selection.Select();if(-not $selection.Current.IsSelected){throw 'Exact virtual printer selection not confirmed'}
 $button=Find @($dialog) 'Print' ([Windows.Automation.ControlType]::Button);if($null -eq $button -or -not $button.Current.IsEnabled){throw 'Native print submission unavailable'}
 $handle=[IntPtr]$button.Current.NativeWindowHandle;$owner=[uint32]0;[void][PosPrintOwnedWindow]::GetWindowThreadProcessId($handle,[ref]$owner)
 if($handle -eq [IntPtr]::Zero -or $owner -ne $process.Id){throw 'Native print button owner mismatch'}
 $record.submissionAttempted=$true;SaveProgress
 [void][PosPrintOwnedWindow]::PostMessage($handle,245,[IntPtr]::Zero,[IntPtr]::Zero)
 $record.checks+='actual Windows native Print dialog selects Microsoft Print to PDF once without touching default-printer controls';SaveProgress
 $until=[DateTime]::UtcNow.AddSeconds(60);$save=$null
 while([DateTime]::UtcNow -lt $until -and $null -eq $save){foreach($w in (Windows)){$candidate=if($w.Current.Name -eq 'Save Print Output As'){$w}else{Find @($w) 'Save Print Output As' ([Windows.Automation.ControlType]::Window)};if($null -ne $candidate){$save=$candidate;break}};if($null -eq $save){Start-Sleep -Milliseconds 250}}
 if($null -eq $save){throw 'Native virtual print Save dialog unavailable; original job not retried'}
 $filename=Find @($save) 'File name:' ([Windows.Automation.ControlType]::Edit);if($null -eq $filename){$filename=Find @($save) 'File name' ([Windows.Automation.ControlType]::Edit)}
 if($null -eq $filename){throw 'Exact native filename input not identified; original job retained'}
 SetValue $filename $pdf
 $saveButton=Find @($save) 'Save' ([Windows.Automation.ControlType]::Button);if($null -eq $saveButton){throw 'Native Save button absent'};Invoke $saveButton
 $until=[DateTime]::UtcNow.AddSeconds(90);$pdfComplete=$false
 while(-not $pdfComplete -and [DateTime]::UtcNow -lt $until){if(Test-Path -LiteralPath $pdf){try{$pdfBytes=[IO.File]::ReadAllBytes($pdf);if($pdfBytes.Length -gt 1024 -and $pdfBytes.Length -lt 16777216){$head=[Text.Encoding]::ASCII.GetString($pdfBytes,0,5);$start=[Math]::Max(0,$pdfBytes.Length-2048);$tail=[Text.Encoding]::ASCII.GetString($pdfBytes,$start,$pdfBytes.Length-$start);$pdfComplete=$head -eq "%PDF-" -and $tail.Contains("%%EOF")}}catch{}};if(-not $pdfComplete){Start-Sleep -Milliseconds 250}}
 if(-not $pdfComplete){throw "Original native PDF completion unconfirmed while app stayed open; no retry"}
 $record.pdfCompleteBeforeShutdown=$true
 $record.checks+='native Microsoft Print to PDF writes the explicitly selected fresh workspace file';$record.status='PASS'
}catch{
 $record.status='FAIL';$record.error=$_.Exception.Message;$controls=@();foreach($w in (Windows)){$nodes=$w.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition);foreach($n in $nodes){$v=$n.Current;if(-not $v.IsPassword){$controls+=@{name=$v.Name;type=$v.ControlType.ProgrammaticName;automationId=$v.AutomationId;handle=$v.NativeWindowHandle}}}};$controls|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $evidence 'windows-print-controls.json')
}finally{
 $main=[IntPtr]::Zero;if(-not $process.HasExited){$process.Refresh();$main=$process.MainWindowHandle};$pidOwner=[uint32]0;[void][PosPrintOwnedWindow]::GetWindowThreadProcessId($main,[ref]$pidOwner);if($main -ne [IntPtr]::Zero -and $pidOwner -eq $process.Id){[void][PosPrintOwnedWindow]::PostMessage($main,16,[IntPtr]::Zero,[IntPtr]::Zero)}
 foreach($w in (Windows)){$handle=[IntPtr]$w.Current.NativeWindowHandle;$owner=[uint32]0;[void][PosPrintOwnedWindow]::GetWindowThreadProcessId($handle,[ref]$owner);if($owner -eq $process.Id){[void][PosPrintOwnedWindow]::PostMessage($handle,16,[IntPtr]::Zero,[IntPtr]::Zero)}}
 $record.drainedExitObserved=$process.WaitForExit(90000);if($record.drainedExitObserved){$record.exitCode=$process.ExitCode}else{$record.status='FAIL';$record.error='Owned app drain unconfirmed'}
 if($record.drainedExitObserved){if($closedDiagnosticProbe){$stageFile=Join-Path $dataRoot 'desktop-harness-lifecycle.log';$lines=if(Test-Path $stageFile){[IO.File]::ReadAllLines($stageFile)}else{@()};$record.closedPipeDurableLifecycle=@('CLOSE_REQUESTED','DRAINED','NODE_STOPPED')|ForEach-Object {if($_ -notin $lines){$record.status='FAIL';$record.error='Actual closed-stderr lifecycle evidence incomplete'};$_}}elseif($stderr.Wait(5000)){$stderr.Result|Set-Content -LiteralPath (Join-Path $evidence 'windows-print-electron-stderr.log')}else{$record.status='FAIL';$record.error='Owned stderr drain unconfirmed'}};$supplied=$null;SaveProgress;$record|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $evidence 'windows-print-result.json')
}
if($record.status -ne 'PASS'){throw $record.error}
