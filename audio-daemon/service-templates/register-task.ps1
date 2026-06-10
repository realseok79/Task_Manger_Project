# REFERENCE script. The authoritative registration is performed at runtime by
# audio_daemon/platforms/windows.py. This standalone form is for MSI custom
# actions / manual use. Run as the target user (NOT elevated — least privilege).
param(
  [string]$Execute   = "$env:LOCALAPPDATA\TeamSigma\audio-daemon\audio-daemon.exe",
  [string]$Arguments = "--mode=daemon",
  [string]$TaskName  = "TeamSigma_AudioDaemon"
)
$ErrorActionPreference = 'Stop'

$action = New-ScheduledTaskAction -Execute $Execute -Argument $Arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# LogonType Interactive + RunLevel Limited => has a desktop session (mic) at least privilege.
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Registered scheduled task '$TaskName'."
