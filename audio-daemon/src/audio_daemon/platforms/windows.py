"""Windows backend — Task Scheduler "At log on" task (least privilege)."""
from __future__ import annotations

import subprocess

from .. import config

TASK = config.WINDOWS_TASK


def _ps(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        text=True,
    )


def set_autostart(enabled: bool) -> bool:
    if enabled:
        args = config.daemon_program_arguments()
        execute = args[0]
        arguments = " ".join(args[1:])
        script = f"""
$ErrorActionPreference = 'Stop'
$action    = New-ScheduledTaskAction -Execute '{execute}' -Argument '{arguments}'
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings  = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
              -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName '{TASK}' -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null
"""
        return _ps(script).returncode == 0
    return _ps(
        f"Unregister-ScheduledTask -TaskName '{TASK}' -Confirm:$false -ErrorAction SilentlyContinue"
    ).returncode == 0


def get_autostart_status() -> bool:
    return _ps(
        f"if (Get-ScheduledTask -TaskName '{TASK}' -ErrorAction SilentlyContinue) {{ exit 0 }} else {{ exit 1 }}"
    ).returncode == 0


def start() -> bool:
    return _ps(f"Start-ScheduledTask -TaskName '{TASK}'").returncode == 0


def stop() -> bool:
    return _ps(f"Stop-ScheduledTask -TaskName '{TASK}'").returncode == 0


def restart() -> bool:
    stop()
    return start()
