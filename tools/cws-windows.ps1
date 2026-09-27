Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$editType = [System.Windows.Automation.ControlType]::Edit
foreach ($p in (Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle })) {
  $line = ''
  try {
    $el = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $editType)
    $edit = $el.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if ($edit) { $line = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value }
  } catch {}
  # body text snippet, so I can tell a sign-in page from the dashboard
  $text = ''
  try {
    $docs = $el.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)))
    if ($docs.Count -gt 0) { $text = ($docs.Item(0).Current.Name -replace '\s+',' ') }
  } catch {}
  Write-Output ("WINDOW: " + $p.MainWindowTitle)
  Write-Output ("  url : " + $line)
  Write-Output ("  doc : " + $text.Substring(0, [Math]::Min(220, $text.Length)))
}
