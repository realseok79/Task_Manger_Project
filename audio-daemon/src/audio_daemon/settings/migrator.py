"""Schema migrations — upgrade an old settings dict to the current version."""
from __future__ import annotations

from .schema import Settings


class SettingsMigrator:
    MIGRATIONS = {
        1: "_migrate_v1_to_v2",
    }

    def migrate(self, raw: dict) -> dict:
        version = int(raw.get("schema_version", 1))
        target = Settings.model_fields["schema_version"].default
        while version < target:
            method = self.MIGRATIONS.get(version)
            if method is None:
                break
            raw = getattr(self, method)(raw)
            version = int(raw.get("schema_version", version + 1))
        return raw

    def _migrate_v1_to_v2(self, raw: dict) -> dict:
        # v1 used "voice_activation"; v2 renamed it to "wake_word".
        if "voice_activation" in raw:
            raw["wake_word"] = raw.pop("voice_activation")
        raw["schema_version"] = 2
        return raw
