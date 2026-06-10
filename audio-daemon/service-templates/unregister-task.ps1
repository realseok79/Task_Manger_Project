# REFERENCE script — counterpart to register-task.ps1 (MSI uninstall custom action).
param(
  [string]$TaskName = "TeamSigma_AudioDaemon"
)
$ErrorActionPreference = 'SilentlyContinue'
Stop-ScheduledTask -TaskName $TaskName
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Unregistered scheduled task '$TaskName'."
