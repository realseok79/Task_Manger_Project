"""TeamSigma AudioDaemon.

A small, always-on local process that owns the microphone and exposes an HTTP/WS
API on 127.0.0.1 (default :8770) for the browser UI, plus a cross-platform
ServiceManager that registers the daemon as an OS-level user service
(macOS LaunchAgent / Linux systemd --user / Windows Task Scheduler).
"""

__version__ = "0.1.0"
