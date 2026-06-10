"""Settings persistence: atomic recovery, copy-on-edit, migration, validation,
and targeted hot-reload (orchestrator)."""
from __future__ import annotations

import json
import time

import numpy as np
import pytest
from pydantic import ValidationError

from audio_daemon.model_slot import ModelSlot, TemplateWakeWordModel, WakeWordModel
from audio_daemon.settings.atomic_writer import AtomicSettingsWriter
from audio_daemon.settings.edit_session import SettingsEditSession
from audio_daemon.settings.migrator import SettingsMigrator
from audio_daemon.settings.orchestrator import ConfigReloadOrchestrator
from audio_daemon.settings.schema import Settings, WakeWordSettings
from audio_daemon.settings.store import SettingsStore
from audio_daemon.wakeword import WakeWordDetector


# ---------------- atomic write / crash recovery ----------------
def test_atomic_roundtrip_and_no_tmp_left(tmp_path):
    path = tmp_path / "settings.json"
    writer = AtomicSettingsWriter(path)
    s = Settings.default().model_copy(update={"sensitivity": 4})
    writer.save(s)
    assert writer.load().sensitivity == 4
    assert not path.with_suffix(".tmp").exists()  # tmp consumed by atomic rename


def test_crash_during_save_recovers_from_backup(tmp_path):
    path = tmp_path / "settings.json"
    writer = AtomicSettingsWriter(path)
    writer.save(Settings.default())                                   # v1: sensitivity 3
    writer.save(Settings.default().model_copy(update={"sensitivity": 5}))  # backs up v1, writes v2
    assert writer.load().sensitivity == 5

    path.write_text("{ corrupt", encoding="utf-8")                    # primary corrupted by a crash
    assert writer.load().sensitivity == 3                             # recovered from .bak

    path.with_suffix(".bak").write_text("also corrupt", encoding="utf-8")
    assert writer.load() == Settings.default()                        # both gone → factory defaults


def test_store_roundtrip(tmp_path):
    store = SettingsStore(tmp_path / "settings.json")
    store.save(Settings.default().model_copy(update={"show_notifications": False}))
    assert SettingsStore(tmp_path / "settings.json").load().show_notifications is False


# ---------------- copy-on-edit ----------------
def test_edit_session_discard_preserves_original_commit_returns_draft():
    original = Settings.default()
    session = SettingsEditSession(original)
    session.update_field("wake_word.phrase", "New Phrase")
    session.update_field("clap.sensitivity", 5)

    assert session.has_changes()
    assert set(session.get_changed_fields()) == {"wake_word.phrase", "clap.sensitivity"}
    assert session.discard().wake_word.phrase == Settings.default().wake_word.phrase  # untouched
    assert session.commit().wake_word.phrase == "New Phrase"
    assert original.wake_word.phrase == Settings.default().wake_word.phrase            # source object untouched


# ---------------- migration ----------------
def test_v1_settings_migrated_to_v2():
    raw = {"schema_version": 1, "voice_activation": {"enabled": False, "phrase": "x"}}
    migrated = SettingsMigrator().migrate(raw)
    assert migrated["schema_version"] == 2
    assert "wake_word" in migrated and "voice_activation" not in migrated
    s = Settings.model_validate(migrated)  # validates clean
    assert s.schema_version == 2 and s.wake_word.phrase == "x"


# ---------------- schema validation ----------------
def test_enabled_wake_word_requires_model_path():
    with pytest.raises(ValidationError):
        Settings.model_validate({"wake_word": {"enabled": True}})  # no model_path
    # ok once a model_path is present
    Settings.model_validate({"wake_word": {"enabled": True, "model_path": "/tmp/m.npz"}})


# ---------------- orchestrator (targeted hot-reload) ----------------
class _SpyClap:
    def __init__(self):
        self.configs = []

    def update_config(self, cfg):
        self.configs.append(cfg)


class _SpyWake:
    def __init__(self):
        self.swaps = []
        self.enabled = None
        self.threshold = 0.85

    def set_enabled(self, e):
        self.enabled = e

    def hot_swap_model(self, m):
        self.swaps.append(m)


class _SpyAudio:
    def __init__(self):
        self.calls = []

    def start(self):
        self.calls.append("start")

    def stop(self):
        self.calls.append("stop")

    def select_device(self, d):
        self.calls.append(("select", d))


def _orch():
    clap, wake, audio = _SpyClap(), _SpyWake(), _SpyAudio()
    return ConfigReloadOrchestrator(clap, wake, audio), clap, wake, audio


def test_clap_change_does_not_restart_audio():
    orch, clap, wake, audio = _orch()
    old = Settings.default()
    new = old.model_copy(update={"clap": old.clap.model_copy(update={"sensitivity": 5})})
    changed = orch.apply_settings(old, new)
    assert changed == {"clap.sensitivity"}
    assert len(clap.configs) == 1
    assert audio.calls == []          # NO stream restart
    assert wake.swaps == []


def test_wake_model_change_swaps_without_audio_restart(tmp_path):
    model_file = str(tmp_path / "m.npz")
    TemplateWakeWordModel(np.array([0.1, 0.2, 0.3]), "hey sigma").save(model_file)
    orch, clap, wake, audio = _orch()
    old = Settings.default()
    new = old.model_copy(update={"wake_word": old.wake_word.model_copy(update={"model_path": model_file})})
    orch.apply_settings(old, new)
    assert len(wake.swaps) == 1       # hot-swapped the loaded model
    assert audio.calls == []          # model change ≠ stream restart


def test_microphone_change_restarts_stream():
    orch, clap, wake, audio = _orch()
    old = Settings.default()
    new = old.model_copy(update={"microphone_id": "2"})
    orch.apply_settings(old, new)
    assert ("select", 2) in audio.calls   # coerced to device index, stream restart


def test_global_disable_stops_and_short_circuits():
    orch, clap, wake, audio = _orch()
    old = Settings.default()
    new = old.model_copy(update={"global_enabled": False})
    orch.apply_settings(old, new)
    assert "stop" in audio.calls
    assert clap.configs == []          # other changes irrelevant when globally off


def test_wake_hot_swap_latency_under_5ms():
    class _Stub(WakeWordModel):
        def infer(self, frame):
            return 0.0

    detector = WakeWordDetector(ModelSlot(_Stub()))
    times = []
    for _ in range(200):
        m = _Stub()
        t0 = time.perf_counter()
        detector.hot_swap_model(m)
        times.append(time.perf_counter() - t0)
    times.sort()
    assert times[int(0.99 * len(times))] < 5e-3
