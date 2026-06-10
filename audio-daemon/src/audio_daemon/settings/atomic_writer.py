"""Atomic settings persistence: tmp write + fsync + backup + atomic rename,
with backup/default fallback on load (crash recovery)."""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Optional

from pydantic import ValidationError

from .migrator import SettingsMigrator
from .schema import Settings


class AtomicSettingsWriter:
    def __init__(self, settings_path: Path):
        self._path = Path(settings_path)
        self._backup_path = self._path.with_suffix(".bak")
        self._tmp_path = self._path.with_suffix(".tmp")
        self._migrator = SettingsMigrator()

    def save(self, settings: Settings) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = settings.model_dump_json(indent=2)

        # 1+2. write tmp, flush, fsync (data durably on disk, not just OS cache)
        with open(self._tmp_path, "w", encoding="utf-8") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())

        # 3. back up the current good file before overwriting
        if self._path.exists():
            shutil.copy2(self._path, self._backup_path)

        # 4. atomic rename (atomic on POSIX, near-atomic on NTFS)
        os.replace(self._tmp_path, self._path)
        self._fsync_dir(self._path.parent)  # persist the rename itself

    def load(self) -> Settings:
        for candidate in (self._path, self._backup_path):
            loaded = self._try_load(candidate)
            if loaded is not None:
                return loaded
        return Settings.default()  # both corrupt/missing → factory defaults

    def _try_load(self, path: Path) -> Optional[Settings]:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        try:
            return Settings.model_validate(self._migrator.migrate(raw))
        except (ValidationError, ValueError, TypeError):
            return None

    @staticmethod
    def _fsync_dir(directory: Path) -> None:
        try:
            fd = os.open(str(directory), os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        except OSError:
            pass  # directory fsync unsupported (e.g. Windows) — best effort
