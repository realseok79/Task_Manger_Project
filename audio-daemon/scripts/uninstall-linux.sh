#!/usr/bin/env bash
# Disable + remove the AudioDaemon systemd --user unit.
set -euo pipefail

VENV="${XDG_DATA_HOME:-$HOME/.local/share}/teamsigma-audiodaemon/venv"

if [ -x "$VENV/bin/python" ]; then
  "$VENV/bin/python" -m audio_daemon --service unregister || true
fi
rm -f "$HOME/.config/systemd/user/teamsigma-audiodaemon.service"
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/teamsigma-audiodaemon"
systemctl --user daemon-reload || true
echo "==> AudioDaemon unregistered and removed. (linger left as-is)"
