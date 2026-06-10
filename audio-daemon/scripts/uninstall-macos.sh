#!/usr/bin/env bash
# Unregister + remove the AudioDaemon LaunchAgent. Call from a .pkg/uninstaller.
set -euo pipefail

VENV="$HOME/Library/Application Support/TeamSigma/audio-daemon/venv"

if [ -x "$VENV/bin/python" ]; then
  "$VENV/bin/python" -m audio_daemon --service unregister || true
fi
rm -f "$HOME/Library/LaunchAgents/com.teamsigma.audiodaemon.plist"
rm -rf "$HOME/Library/Application Support/TeamSigma/audio-daemon"
echo "==> AudioDaemon unregistered and removed."
