# Install + register the AudioDaemon as a Task Scheduler "At log on" task.
# Idempotent. Call from an MSI custom action (deferred, run as the user — NOT elevated).
$ErrorActionPreference = 'Stop'

$PkgDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path     # audio-daemon\
$Venv   = Join-Path $env:LOCALAPPDATA 'TeamSigma\audio-daemon\venv'

Write-Host "==> Creating venv at $Venv"
py -3 -m venv $Venv
& "$Venv\Scripts\pip.exe" install --quiet --upgrade pip
& "$Venv\Scripts\pip.exe" install --quiet $PkgDir

Write-Host "==> Registering scheduled task (AtLogOn, restart-on-failure)"
& "$Venv\Scripts\python.exe" -m audio_daemon --service register
& "$Venv\Scripts\python.exe" -m audio_daemon --service start

Write-Host "==> Done. Status:"
& "$Venv\Scripts\python.exe" -m audio_daemon --service status
Write-Host "Ensure Settings -> Privacy -> Microphone -> 'Let desktop apps access your microphone' is ON."
