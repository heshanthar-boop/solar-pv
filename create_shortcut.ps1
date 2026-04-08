$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath    = Join-Path $scriptRoot "launch.bat"
$braveExe   = "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
$shell      = New-Object -ComObject WScript.Shell
$desktop    = [Environment]::GetFolderPath("Desktop")
$lnkPath    = Join-Path $desktop "SolarPV Field Tool.lnk"

$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath       = $batPath
$lnk.WorkingDirectory = $scriptRoot
$lnk.Description      = "SolarPV Field Tool - Heshan Engineering Solution"
$lnk.IconLocation     = "$braveExe,0"
$lnk.WindowStyle      = 7
$lnk.Save()

Write-Host "Shortcut created at: $lnkPath"
