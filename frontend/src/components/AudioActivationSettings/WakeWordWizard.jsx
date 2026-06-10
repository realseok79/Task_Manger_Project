import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, ArrowLeft, RefreshCw, Check, AlertTriangle, ArrowRight, AudioLines } from 'lucide-react';
import './WakeWordWizard.css';

const STEPS = {
    INTRO: 1,
    RECORDING: 2,
    TRAINING: 3,
    VALIDATION: 4
};

export default function WakeWordWizard({ onComplete, onClose }) {
    const [step, setStep] = useState(STEPS.INTRO);
    const [wakeWord, setWakeWord] = useState("헤이 자비스");
    const [reps, setReps] = useState(0); // 0 to 5
    const [repStatus, setRepStatus] = useState(""); // "", "Good", "Quiet", "Noisy"
    const [isListening, setIsListening] = useState(false);
    const [trainProgress, setTrainProgress] = useState(0);
    const [trainStage, setTrainStage] = useState("녹음 파일 처리 중...");
    const [valState, setValState] = useState("listening"); // "listening" | "detecting" | "detected" | "failed"
    const [confidence, setConfidence] = useState(0);
    const waveAnimRef = useRef(null);

    // Tip checks for Step 1
    const wordCount = wakeWord.trim().split(/\s+/).filter(Boolean).length;
    const isWordCountGood = wordCount >= 2 && wordCount <= 4;
    const hasStarter = /^(hey|ok|hello|hi|야|헤이|안녕)/i.test(wakeWord.trim());
    const isCommonWord = /^(네|아니오|오늘|작업|투두|안녕|yes|no|today|task|todo)$/i.test(wakeWord.trim());

    // Step 2 Waveform SVG pulsing animation
    useEffect(() => {
        if (step !== STEPS.RECORDING) return;
        setIsListening(true);
        setRepStatus("");
    }, [step, reps]);

    // Step 3 Training progress simulator
    useEffect(() => {
        if (step !== STEPS.TRAINING) return;
        setTrainProgress(0);
        const interval = setInterval(() => {
            setTrainProgress((p) => {
                const next = p + 7;
                if (next >= 100) {
                    clearInterval(interval);
                    setTimeout(() => setStep(STEPS.VALIDATION), 800);
                    return 100;
                }
                if (next > 70) {
                    setTrainStage("로컬 음성 모델 배포 중...");
                } else if (next > 35) {
                    setTrainStage("인공신경망 가중치 최적화 중...");
                }
                return next;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [step]);

    // Handle rep capture simulation
    const triggerSpeechSimulation = () => {
        if (step !== STEPS.RECORDING || reps >= 5) return;
        // Randomly simulate Good/Too Quiet to make the UX realistic
        const outcomes = ["Good", "Good", "Good", "Quiet"];
        const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        
        if (outcome === "Good") {
            setRepStatus("Good");
            setTimeout(() => {
                setReps((r) => {
                    const next = r + 1;
                    if (next === 5) {
                        setTimeout(() => setStep(STEPS.TRAINING), 1000);
                    }
                    return next;
                });
                setRepStatus("");
            }, 1000);
        } else {
            setRepStatus("Quiet");
            setTimeout(() => setRepStatus(""), 1600);
        }
    };

    // Handle verification test speech simulation
    const simulateValidationSpeech = (success = true) => {
        if (step !== STEPS.VALIDATION) return;
        setValState("detecting");
        setTimeout(() => {
            if (success) {
                setValState("detected");
                setConfidence(94);
            } else {
                setValState("failed");
            }
        }, 1200);
    };

    return (
        <div className="wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="wiz-title">
            <div className="wizard-card">
                <header className="wizard-header">
                    <button type="button" className="wiz-back-btn" onClick={onClose} aria-label="마법사 취소 및 닫기">
                        <ArrowLeft size={18} />
                    </button>
                    <span className="wizard-step-indicator">{step} / 4 단계</span>
                </header>

                <div className="wizard-body">
                    <AnimatePresence mode="wait">
                        {/* SCREEN 1: INTRODUCTION */}
                        {step === STEPS.INTRO && (
                            <motion.div 
                                key="intro" 
                                initial={{ opacity: 0, x: 20 }} 
                                animate={{ opacity: 1, x: 0 }} 
                                exit={{ opacity: 0, x: -20 }}
                                className="wiz-step"
                            >
                                <h2 id="wiz-title" className="wiz-step-title">음성 호출어 설정</h2>
                                <p className="wiz-step-desc">
                                    마이크에 대고 말할 때 자연스러운 호출어 문구를 설정해 주세요. 2~4단어로 구성하는 것이 가장 좋습니다.
                                </p>

                                <div className="wiz-field">
                                    <input 
                                        type="text" 
                                        className="wiz-input" 
                                        placeholder="예: 헤이 자비스"
                                        value={wakeWord}
                                        onChange={(e) => setWakeWord(e.target.value)}
                                        maxLength={40}
                                        aria-label="호출어 문구 입력"
                                    />
                                </div>

                                <div className="wiz-tips">
                                    <h4 className="wiz-tips__title">호출어 설정 팁</h4>
                                    <ul className="wiz-tips__list">
                                        <li className={isWordCountGood ? "pass" : "fail"}>
                                            {isWordCountGood ? "✅" : "❌"} 2~4단어로 입력해 주세요 (현재 단어 수: {wordCount})
                                        </li>
                                        <li className={hasStarter ? "pass" : "info"}>
                                            {hasStarter ? "✅" : "💡"} 시작 단어를 명확하게 해주세요 (예: "헤이", "오케이")
                                        </li>
                                        <li className={isCommonWord ? "fail" : "pass"}>
                                            {isCommonWord ? "❌ 흔하게 사용되는 단어는 피해 주세요" : "✅ 훌륭하고 고유한 호출어 선택입니다"}
                                        </li>
                                    </ul>
                                </div>

                                <button 
                                    type="button" 
                                    className="wiz-btn-primary" 
                                    disabled={wakeWord.trim().length < 3}
                                    onClick={() => setStep(STEPS.RECORDING)}
                                    aria-label="녹음 단계로 진행"
                                >
                                    다음 <ArrowRight size={16} />
                                </button>
                            </motion.div>
                        )}

                        {/* SCREEN 2: RECORDING REPETITIONS */}
                        {step === STEPS.RECORDING && (
                            <motion.div 
                                key="recording" 
                                initial={{ opacity: 0, x: 20 }} 
                                animate={{ opacity: 1, x: 0 }} 
                                exit={{ opacity: 0, x: -20 }}
                                className="wiz-step wiz-step--center"
                            >
                                <h2 id="wiz-title" className="wiz-step-title">"{wakeWord}"라고 말해 주세요</h2>
                                <p className="wiz-step-desc">인공지능 모델 학습을 위해 호출어를 5번 반복하여 녹음합니다.</p>

                                <div className="wiz-mic-wrapper">
                                    <div className={`wiz-mic-circle ${isListening ? 'is-active' : ''}`}>
                                        <Mic size={36} className="wiz-mic-icon" />
                                    </div>
                                    <div className="wiz-waveform">
                                        {/* Waveform visual simulation */}
                                        <AudioLines size={40} className="wiz-waveform-bars" />
                                    </div>
                                </div>

                                <div className="wiz-progress-dots" aria-label={`5회 중 ${reps}회 녹음 완료`}>
                                    {[...Array(5)].map((_, i) => (
                                        <span 
                                            key={i} 
                                            className={`wiz-dot ${i < reps ? 'is-done' : ''} ${i === reps ? 'is-active' : ''}`} 
                                        />
                                    ))}
                                    <span className="wiz-progress-text mono">5회 중 {reps}회 녹음 완료</span>
                                </div>

                                {/* Quality Feedback Banner */}
                                <div className="wiz-feedback-banner">
                                    <AnimatePresence mode="wait">
                                        {repStatus === "Good" && (
                                            <motion.span key="good" initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }} className="quality-lbl quality-lbl--good">
                                                ✅ 녹음 완료 (상태 양호)
                                            </motion.span>
                                        )}
                                        {repStatus === "Quiet" && (
                                            <motion.span key="quiet" initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }} className="quality-lbl quality-lbl--warn">
                                                ⚠️ 소리가 너무 작습니다 — 조금 더 크게 말씀해 주세요
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div className="wiz-actions-row">
                                    <button type="button" className="wiz-btn-sec" onClick={triggerSpeechSimulation}>
                                        🎤 음성 입력 시뮬레이션
                                    </button>
                                    <button type="button" className="wiz-btn-link" onClick={() => setReps((r) => Math.min(5, r + 1))}>
                                        현재 녹음 건너뛰기
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* SCREEN 3: MODEL TRAINING */}
                        {step === STEPS.TRAINING && (
                            <motion.div 
                                key="training" 
                                initial={{ opacity: 0, x: 20 }} 
                                animate={{ opacity: 1, x: 0 }} 
                                exit={{ opacity: 0, x: -20 }}
                                className="wiz-step"
                            >
                                <h2 id="wiz-title" className="wiz-step-title">모델 학습 중...</h2>
                                <p className="wiz-step-desc">사용자의 개별 음성 시그니처를 고유 알고리즘 모델에 학습시키는 중입니다.</p>

                                <div className="wiz-loader-box">
                                    <div className="wiz-progress-gauge">
                                        <div className="wiz-progress-fill" style={{ width: `${trainProgress}%` }} />
                                    </div>
                                    <div className="wiz-loader-label mono">
                                        <span>{trainStage}</span>
                                        <span>{trainProgress}%</span>
                                    </div>
                                </div>

                                <div className="wiz-fun-fact">
                                    <p className="wiz-fun-fact__text">
                                        💡 <strong>팁</strong>: 이 과정은 사용자의 CPU 내에서 100% 오프라인 상태로 작동하는 프라이버시 보호형 온디바이스 음성 모델을 구축합니다. 외부 클라우드로 어떠한 음성 데이터도 유출되지 않습니다.
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {/* SCREEN 4: VALIDATION TEST */}
                        {step === STEPS.VALIDATION && (
                            <motion.div 
                                key="validation" 
                                initial={{ opacity: 0, x: 20 }} 
                                animate={{ opacity: 1, x: 0 }} 
                                exit={{ opacity: 0, x: -20 }}
                                className="wiz-step wiz-step--center"
                            >
                                <h2 id="wiz-title" className="wiz-step-title">인식 테스트</h2>
                                <p className="wiz-step-desc">설정한 호출어가 정상 작동하는지 확인하기 위해 "{wakeWord}"라고 큰 소리로 말씀해 주세요.</p>

                                <div className={`wiz-validator-state state--${valState}`}>
                                    {valState === "listening" && (
                                        <div className="val-circle val-circle--listen">
                                            <div className="val-ring" />
                                            <span>음성 대기 중...</span>
                                        </div>
                                    )}
                                    {valState === "detecting" && (
                                        <div className="val-circle val-circle--detect">
                                            <div className="val-ring val-ring--fast" />
                                            <span>분석 중...</span>
                                        </div>
                                    )}
                                    {valState === "detected" && (
                                        <div className="val-circle val-circle--pass">
                                            <Check size={28} />
                                            <span>인식 성공!</span>
                                        </div>
                                    )}
                                    {valState === "failed" && (
                                        <div className="val-circle val-circle--fail">
                                            <AlertTriangle size={28} />
                                            <span>인식 실패</span>
                                        </div>
                                    )}
                                </div>

                                <div className="val-output-box">
                                    {valState === "detected" && (
                                        <div className="val-success-msg">
                                            <span>✅ 호출어가 완벽하게 매칭 및 확인되었습니다!</span>
                                            <span className="mono font-xs">일치도 신뢰값: {confidence}%</span>
                                        </div>
                                    )}
                                    {valState === "failed" && (
                                        <div className="val-fail-msg">
                                            <span>마이크에 조금 더 가까이 대고 큰 소리로 말씀하시거나, 감도를 조절해 주세요.</span>
                                        </div>
                                    )}
                                </div>

                                <div className="wiz-actions-row">
                                    {valState === "listening" && (
                                        <>
                                            <button type="button" className="wiz-btn-primary" onClick={() => simulateValidationSpeech(true)}>
                                                인식 성공 시뮬레이션
                                            </button>
                                            <button type="button" className="wiz-btn-sec" onClick={() => simulateValidationSpeech(false)}>
                                                인식 실패 시뮬레이션
                                            </button>
                                        </>
                                    )}
                                    {valState === "detected" && (
                                        <button type="button" className="wiz-btn-primary" onClick={() => onComplete(wakeWord)}>
                                            ✅ 설정 저장 및 마침
                                        </button>
                                    )}
                                    {valState === "failed" && (
                                        <>
                                            <button type="button" className="wiz-btn-primary" onClick={() => setValState("listening")}>
                                                🔄 다시 시도
                                            </button>
                                            <button type="button" className="wiz-btn-sec" onClick={() => setStep(STEPS.RECORDING)}>
                                                🎙️ 재녹음하기
                                            </button>
                                        </>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
