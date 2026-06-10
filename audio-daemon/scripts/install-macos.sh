#!/usr/bin/env bash
# Install + register the AudioDaemon as a macOS LaunchAgent.
# Idempotent: safe to re-run for upgrades. Call from a .pkg postinstall script.
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"      # audio-daemon/
VENV="$HOME/Library/Application Support/TeamSigma/audio-daemon/venv"

echo "==> Creating venv at $VENV"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet "$PKG_DIR"

echo "==> Registering LaunchAgent (RunAtLoad + KeepAlive)"
"$VENV/bin/python" -m audio_daemon --service register
"$VENV/bin/python" -m audio_daemon --service start || true

echo "==> Done. Status:"
"$VENV/bin/python" -m audio_daemon --service status
echo "If macOS prompts for microphone access, allow it (or enable it later in"
echo "System Settings → Privacy & Security → Microphone)."
