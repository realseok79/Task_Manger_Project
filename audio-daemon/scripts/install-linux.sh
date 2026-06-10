#!/usr/bin/env bash
# Install + enable the AudioDaemon as a systemd --user service (+ linger).
# Idempotent. Call from a .deb/.rpm postinst (run as the target user).
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"      # audio-daemon/
VENV="${XDG_DATA_HOME:-$HOME/.local/share}/teamsigma-audiodaemon/venv"

echo "==> Creating venv at $VENV"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet "$PKG_DIR"

echo "==> Enabling systemd --user unit (+ linger to survive logout)"
"$VENV/bin/python" -m audio_daemon --service register   # writes unit, enable --now, enable-linger
echo "==> Done. Status:"
"$VENV/bin/python" -m audio_daemon --service status
