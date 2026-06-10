# Unregister + remove the AudioDaemon scheduled task.
$ErrorActionPreference = 'SilentlyContinue'

$Venv = Join-Path $env:LOCALAPPDATA 'TeamSigma\audio-daemon\venv'
if (Test-Path "$Venv\Scripts\python.exe") {
  & "$Venv\Scripts\python.exe" -m audio_daemon --service unregister
}
Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA 'TeamSigma\audio-daemon')
Write-Host "==> AudioDaemon unregistered and removed."
