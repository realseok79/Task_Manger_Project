"""Per-OS microphone-permission guidance.

Actual grant/denial is detected at capture time by AudioEngine (PortAudio errors);
this module supplies the human guidance + a deep link the UI can surface.
"""
from __future__ import annotations

import os
import sys
from typing import Optional


def settings_hint() -> str:
    if sys.platform == "darwin":
        return "시스템 설정 → 개인정보 보호 및 보안 → 마이크 에서 AudioDaemon을 허용하세요."
    if os.name == "nt":
        return "설정 → 개인정보 → 마이크 → '데스크톱 앱이 마이크에 액세스하도록 허용'을 켜세요."
    return "PulseAudio/PipeWire 가 사용자 세션에서 실행 중인지 확인하세요."


def settings_uri() -> Optional[str]:
    """A clickable deep link to the OS mic-privacy pane, where one exists."""
    if sys.platform == "darwin":
        return "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
    if os.name == "nt":
        return "ms-settings:privacy-microphone"
    return None
