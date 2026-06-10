import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import VUMeter from './VUMeter';
import WakeWordWizard from './WakeWordWizard';
import ToastNotification from './ToastNotification';
import { RefreshCw, Sparkles } from 'lucide-react';
import {
    getDevices,
    selectDevice as selectDeviceApi,
    controlStream,
    getStatus,
    setAutostart as setAutostartApi,
    AUDIO_DAEMON_WS,
} from '../../api/audioDaemon';
import { daemonIpc } from '../../api/daemonIpc';
import './AudioActivationSettings.css';

export default function AudioActivationSettings({ isOpen, onClose }) {
    // General Settings States
    const [isEnabled, setIsEnabled] = useState(true);
    const [devices, setDevices] = useState([{ id: 0, name: "내장 마이크", is_default: true }]);
    const [selectedDevice, setSelectedDevice] = useState(0);
    const [sensitivity, setSensitivity] = useState(50); // slider 0-100

    // OS-service registration (Start at Login) — driven via the daemon's control API.
    const [autostart, setAutostart] = useState(false);
    const [daemonOnline, setDaemonOnline] = useState(false);
    const [autostartBusy, setAutostartBusy] = useState(false);

    // Clap Trigger States
    const [clapEnabled, setClapEnabled] = useState(false);
    const [doubleClapRequired, setDoubleClapRequired] = useState(true);
    const [clapSensitivity, setClapSensitivity] = useState(40);
    const [clapTestActive, setClapTestActive] = useState(false);
    const [clapTestCount, setClapTestCount] = useState(0);

    // Voice Activation States
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [wakeWord, setWakeWord] = useState("헤이 자비스");
    const [modelConfidence, setModelConfidence] = useState(87);
    const [lastTrainedDays, setLastTrainedDays] = useState(3);
    const [wizardOpen, setWizardOpen] = useState(false);
    
    // Toast Alert Trigger
    const [showTriggerToast, setShowTriggerToast] = useState(false);

    // On open: load real devices + current service status from the daemon.
    // Falls back gracefully (mock device list, offline badge) when it's not running.
    useEffect(() => {
        if (!isOpen) return undefined;
        let alive = true;

        (async () => {
            try {
                const data = await getDevices();
                if (alive && data.length > 0) {
                    setDevices(data);
                    const defaultDev = data.find((d) => d.is_default) || data[0];
                    setSelectedDevice(defaultDev.id);
                }
            } catch {
                console.warn("Unable to connect to audio service backend. Using mock device list.");
            }

            try {
                const status = await getStatus();
                if (alive) {
                    setDaemonOnline(true);
                    setAutostart(Boolean(status.autostart));
                }
            } catch {
                if (alive) setDaemonOnline(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [isOpen]);

    // Toggle OS-level auto-start at login (register/unregister LaunchAgent/unit/task).
    const handleToggleAutostart = async () => {
        if (autostartBusy) return;
        const next = !autostart;
        setAutostartBusy(true);
        setAutostart(next); // optimistic
        try {
            const res = await setAutostartApi(next);
            setAutostart(Boolean(res.autostart));
            setDaemonOnline(true);
        } catch {
            setAutostart(!next); // revert
            setDaemonOnline(false);
        } finally {
            setAutostartBusy(false);
        }
    };

    // Handle Factory Reset
    const handleReset = () => {
        setIsEnabled(true);
        setSelectedDevice(0);
        setSensitivity(50);
        setClapEnabled(false);
        setDoubleClapRequired(true);
        setClapSensitivity(40);
        setVoiceEnabled(false);
        setWakeWord("헤이 자비스");
        setModelConfidence(87);
        setLastTrainedDays(3);
    };

    // Handle Settings Save
    const handleSave = async () => {
        try {
            await selectDeviceApi(selectedDevice);
            await controlStream(isEnabled ? 'start' : 'stop');
        } catch {
            console.warn("Audio service backend offline. Saved local settings state.");
        }
        // Notify the daemon over IPC that settings changed (CONFIG_UPDATED).
        daemonIpc.sendConfigUpdated({
            changed_keys: ['audio.device_id', 'audio.enabled', 'wake_word.phrase'],
            reload_required: voiceEnabled ? ['wake_word_model'] : [],
            restart_required: false,
        });
        onClose();
    };

    // Test clap simulation
    const simulateClap = () => {
        if (!clapTestActive) {
            setClapTestActive(true);
            setClapTestCount(0);
        }
        setClapTestCount((c) => {
            const next = c + 1;
            if (next >= 5) {
                setClapTestActive(false);
                return 5;
            }
            return next;
        });
    };

    const handleWizardComplete = (newWord) => {
        setWakeWord(newWord);
        setVoiceEnabled(true);
        setModelConfidence(94);
        setLastTrainedDays(0); // trained today
        setWizardOpen(false);
        // Show high-fidelity toast alert
        setShowTriggerToast(true);
    };

    if (!isOpen) return null;

    return (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={onClose}>
            <div className="settings-container" onMouseDown={(e) => e.stopPropagation()}>
                <header className="settings-header-top">
                    <h2 id="settings-title" className="settings-main-title">
                        🎙️ 음성 인식 활성화 설정
                    </h2>
                    <button type="button" className="settings-close-btn" onClick={onClose} aria-label="설정 창 닫기">
                        &times;
                    </button>
                </header>

                <div className="settings-scroll-body">
                    {/* SECTION 1: GENERAL CONTROLS */}
                    <fieldset className="settings-section">
                        <legend className="settings-section__title">기본 설정</legend>
                        <div className="settings-control-row">
                            <div>
                                <label className="settings-lbl" htmlFor="enable-audio">음성 인식 기능 활성화</label>
                                <span className="settings-hint">앱이 마이크 입력을 통해 오디오 이벤트를 감지할 수 있도록 합니다.</span>
                            </div>
                            <button
                                id="enable-audio"
                                type="button"
                                role="switch"
                                aria-checked={isEnabled}
                                className={`switch ${isEnabled ? 'is-on' : ''}`}
                                onClick={() => setIsEnabled(!isEnabled)}
                            />
                        </div>

                        <div className="settings-control-row">
                            <div>
                                <label className="settings-lbl" htmlFor="enable-autostart">로그인 시 자동 시작</label>
                                <span className="settings-hint">
                                    {daemonOnline
                                        ? '컴퓨터 로그인 시 음성 인식 서비스가 자동으로 실행됩니다.'
                                        : '오디오 서비스(데몬)가 실행 중이 아닙니다 — 데몬을 먼저 실행하세요.'}
                                </span>
                            </div>
                            <button
                                id="enable-autostart"
                                type="button"
                                role="switch"
                                aria-checked={autostart}
                                disabled={!daemonOnline || autostartBusy}
                                className={`switch ${autostart ? 'is-on' : ''}`}
                                onClick={handleToggleAutostart}
                            />
                        </div>

                        {isEnabled && (
                            <>
                                <div className="settings-field-col">
                                    <label className="settings-lbl" htmlFor="mic-select">마이크 입력 장치</label>
                                    <select 
                                        id="mic-select"
                                        className="settings-select"
                                        value={selectedDevice}
                                        onChange={(e) => setSelectedDevice(Number(e.target.value))}
                                    >
                                        {devices.map(d => (
                                            <option key={d.id} value={d.id}>{d.name} ({d.host_api})</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="settings-field-col">
                                    <div className="slider-label-row">
                                        <label className="settings-lbl" htmlFor="mic-sensitivity">마이크 입력 감도</label>
                                        <span className="slider-val mono">{sensitivity}%</span>
                                    </div>
                                    <div className="slider-container">
                                        <input 
                                            id="mic-sensitivity"
                                            type="range" 
                                            min="0" 
                                            max="100" 
                                            value={sensitivity}
                                            onChange={(e) => setSensitivity(Number(e.target.value))}
                                            className="settings-slider"
                                        />
                                        <span className="slider-caption">
                                            {sensitivity < 30 ? "낮음" : sensitivity < 70 ? "보통" : "높음"}
                                        </span>
                                    </div>
                                </div>
                            </>
                        )}
                    </fieldset>

                    {/* SECTION 2: CLAP DETECTION */}
                    {isEnabled && (
                        <fieldset className="settings-section">
                            <legend className="settings-section__title">박수 감지</legend>
                            <div className="settings-control-row">
                                <label className="settings-lbl" htmlFor="enable-clap">박수 감지 활성화</label>
                                <button
                                    id="enable-clap"
                                    type="button"
                                    role="switch"
                                    aria-checked={clapEnabled}
                                    className={`switch ${clapEnabled ? 'is-on' : ''}`}
                                    onClick={() => setClapEnabled(!clapEnabled)}
                                />
                            </div>

                            {clapEnabled && (
                                <div className="settings-subsection-body">
                                    <div className="settings-control-row">
                                        <label className="settings-lbl" htmlFor="double-clap">두 번 연속 박수 필요</label>
                                        <button
                                            id="double-clap"
                                            type="button"
                                            role="switch"
                                            aria-checked={doubleClapRequired}
                                            className={`switch ${doubleClapRequired ? 'is-on' : ''}`}
                                            onClick={() => setDoubleClapRequired(!doubleClapRequired)}
                                        />
                                    </div>

                                    <div className="settings-field-col">
                                        <div className="slider-label-row">
                                            <label className="settings-lbl" htmlFor="clap-sensitivity">박수 감도</label>
                                            <span className="slider-val mono">{clapSensitivity}%</span>
                                        </div>
                                        <input 
                                            id="clap-sensitivity"
                                            type="range" 
                                            min="10" 
                                            max="90" 
                                            value={clapSensitivity}
                                            onChange={(e) => setClapSensitivity(Number(e.target.value))}
                                            className="settings-slider"
                                        />
                                    </div>

                                    <div className="clap-tester-row">
                                        <button type="button" className="settings-btn-action" onClick={simulateClap}>
                                            🎤 박수 감지 테스트
                                        </button>
                                        <div className="clap-test-status" aria-live="polite">
                                            {[...Array(5)].map((_, i) => (
                                                <span key={i} className={`clap-node ${i < clapTestCount ? 'is-clap' : ''}`} />
                                            ))}
                                            <span className="clap-node-text mono">
                                                {clapTestActive ? "감지 중..." : "대기 중"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </fieldset>
                    )}

                    {/* SECTION 3: VOICE WAKE WORD */}
                    {isEnabled && (
                        <fieldset className="settings-section">
                            <legend className="settings-section__title">음성 호출어(Wake Word)</legend>
                            <div className="settings-control-row">
                                <label className="settings-lbl" htmlFor="enable-voice">음성 호출 활성화</label>
                                <button
                                    id="enable-voice"
                                    type="button"
                                    role="switch"
                                    aria-checked={voiceEnabled}
                                    className={`switch ${voiceEnabled ? 'is-on' : ''}`}
                                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                                />
                            </div>

                            {voiceEnabled && (
                                <div className="settings-subsection-body">
                                    <div className="wakeword-status-card">
                                        <div className="wakeword-phrase-row">
                                            <span className="wakeword-label">호출어:</span>
                                            <strong className="wakeword-value">"{wakeWord}"</strong>
                                            <button type="button" className="wakeword-edit-btn" onClick={() => setWizardOpen(true)}>
                                                ✏️ 변경
                                            </button>
                                        </div>

                                        <div className="wakeword-actions">
                                            <button type="button" className="settings-btn-primary settings-btn--fit" onClick={() => setWizardOpen(true)}>
                                                🎙️ 새 호출어 등록
                                            </button>
                                        </div>

                                        <div className="model-status-box">
                                            <div className="status-row">
                                                <span className="status-indicator pass">✅ 학습 완료 ({modelConfidence}% 신뢰도)</span>
                                                <button type="button" className="settings-retrain-btn" onClick={() => setWizardOpen(true)} aria-label="음성 모델 재학습">
                                                    <RefreshCw size={12} /> 재학습
                                                </button>
                                            </div>
                                            <span className="status-sub">최근 학습: {lastTrainedDays === 0 ? "오늘" : `${lastTrainedDays}일 전`}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </fieldset>
                    )}

                    {/* SECTION 4: REAL-TIME VU METER */}
                    {isEnabled && (
                        <fieldset className="settings-section">
                            <legend className="settings-section__title">마이크 입력 레벨</legend>
                            <VUMeter wsUrl={AUDIO_DAEMON_WS} />
                        </fieldset>
                    )}
                </div>

                {/* BOTTOM BUTTON BAR */}
                <footer className="settings-footer-actions">
                    <div className="footer-left-group">
                        <button type="button" className="settings-btn-link-action" onClick={() => alert("보정 마법사(데모)가 실행되었습니다.")}>
                            <Sparkles size={14} /> 마이크 보정 마법사 실행
                        </button>
                        <button type="button" className="settings-btn-link-action" onClick={handleReset}>
                            초기화
                        </button>
                    </div>
                    <div className="footer-right-group">
                        <button type="button" className="settings-btn-sec-act" onClick={onClose}>
                            취소
                        </button>
                        <button type="button" className="settings-btn-primary-act" onClick={handleSave}>
                            설정 저장
                        </button>
                    </div>
                </footer>
            </div>

            {/* WIZARD ENROLLMENT MODAL OVERLAY */}
            <AnimatePresence>
                {wizardOpen && (
                    <WakeWordWizard 
                        onComplete={handleWizardComplete} 
                        onClose={() => setWizardOpen(false)} 
                    />
                )}
            </AnimatePresence>

            {/* TEST TOAST ALERTS */}
            <ToastNotification 
                show={showTriggerToast} 
                message={`🎙️ 호출어가 감지되었습니다: "${wakeWord}"`} 
                onClose={() => setShowTriggerToast(false)} 
            />
        </div>
    );
}
