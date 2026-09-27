# Reads the visible Chrome window: saves a PNG of it and lists the controls we could set.
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing, UIAutomationClient, UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$out = 'C:\Users\nz_jo\projects\youtube-vibe-borders\out\cws'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$proc = Get-Process chrome | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
if (-not $proc) { Write-Output 'NO CHROME WINDOW'; exit 1 }
Write-Output ("window: " + $proc.MainWindowTitle)
if ([Win]::IsIconic($proc.MainWindowHandle)) { [Win]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null; Start-Sleep -Milliseconds 900 }

$r = New-Object Win+RECT
[Win]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
$wd = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
Write-Output ("rect: {0}x{1} at {2},{3}" -f $wd, $ht, $r.Left, $r.Top)
$bmp = New-Object System.Drawing.Bitmap $wd, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$bmp.Save((Join-Path $out 'listing.png'), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "saved listing.png"

$el = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$script:rows = @()
function Walk($node, $depth) {
  if ($depth -gt 16 -or $script:rows.Count -gt 200) { return }
  $child = $walker.GetFirstChild($node)
  while ($child) {
    $ct = ''; $nm = ''; $val = ''
    try { $ct = $child.Current.ControlType.ProgrammaticName -replace 'ControlType\.','' } catch {}
    try { $nm = ($child.Current.Name -replace '\s+',' ') } catch {}
    try { $val = $child.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
    if ($ct -in @('Edit','Button','TabItem','ComboBox','CheckBox','RadioButton','Hyperlink')) {
      $line = "$ct | $nm"
      if ($val) { $line += "  value=[$val]" }
      $script:rows += $line
    }
    Walk $child ($depth + 1)
    $child = $walker.GetNextSibling($child)
  }
}
Walk $el 0
Write-Output '--- controls ---'
$script:rows | Select-Object -First 100 | ForEach-Object { Write-Output $_ }
