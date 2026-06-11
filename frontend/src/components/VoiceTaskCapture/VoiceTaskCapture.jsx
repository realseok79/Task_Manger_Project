import { useEffect, useRef, useState } from 'react';
import Modal from '../Modal/Modal';
import { createTaskWithBudget } from '../../api/availableTime';
import { getAllPending, getZombieTasks } from '../../api/tasks';
import { parseVoiceInput, parsedToSpeech } from '../../lib/voiceNlp';
import { parseWithGemini, isGeminiAvailable, generateBriefing } from '../../lib/voiceGemini';
import './VoiceTaskCapture.css';

/**
 * VoiceTaskCapture — the "JARVIS" half of the wake-word flow.
 *
 * Opened when the daemon fires a VOICE_ACTIVATION (👏👏 clap-only or combo).
 * Uses Web Speech API:
 * 1. Fetches current task status and generates a briefing (Gemini AI).
 * 2. Speaks the briefing (TTS).
 * 3. Listens for user input (STT, ko-KR).
 * 4. Parses the spoken text (Gemini AI or rule-based fallback).
 * 5. Extracts title, deadline, importance, category, energy, and duration.
 * 6. Creates the task automatically.
 */
const PROMPT = '오늘 어떤 작업을 하실 건가요?';
const SpeechRecognitionCtor =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const VOICE_SUPPORTED =
  Boolean(SpeechRecognitionCtor) && typeof window !== 'undefined' && 'speechSynthesis' in window;

const IMPORTANCE_LABELS = { 5: '매우 높음', 4: '높음', 3: '보통', 2: '낮음', 1: '매우 낮음' };
const ENERGY_LABELS = { HIGH: '높음', MEDIUM: '보통', LOW: '낮음' };

function speak(text, onEnd) {
  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    if (onEnd) {
      utter.onend = onEnd;
      utter.onerror = onEnd; // fallback if TTS fails to play
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch {
    if (onEnd) onEnd();
  }
}

function formatDeadline(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return `${month}/${day} (${dayNames[d.getDay()]})`;
  } catch {
    return null;
  }
}

export default function VoiceTaskCapture({ open, onClose, onToast, onCreated }) {
  // idle | preparing_briefing | briefing | listening | parsing | parsed | creating | done | error | unsupported
  const [phase, setPhase] = useState('idle');
  const [briefingText, setBriefingText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [manual, setManual] = useState('');
  const [parsedResult, setParsedResult] = useState(null);
  const [aiSource, setAiSource] = useState(null); // 'gemini' | 'local'
  const recogRef = useRef(null);
  const cancelRef = useRef(false);

  const createFromParsed = async (result) => {
    if (cancelRef.current) return;
    setPhase('creating');
    try {
      await createTaskWithBudget({
        title: result.title,
        requiredEnergy: result.requiredEnergy,
        importance: result.importance,
        category: result.category,
        estimatedMinutes: result.estimatedMinutes,
        deadline: result.deadline,
      });
      setTranscript(result.title);
      setPhase('done');
      const tts = result.ttsResponse || parsedToSpeech(result);
      speak(tts);
      onToast?.(`📝 ${tts}`);
      onCreated?.();
      setTimeout(() => { if (!cancelRef.current) onClose?.(); }, 2200);
    } catch (e) {
      setPhase('error');
      onToast?.(e?.message || '작업 기록에 실패했어요.');
    }
  };

  /** Gemini → rule-based fallback */
  const smartParse = async (text) => {
    if (cancelRef.current) return;
    setPhase('parsing');

    // 1) Gemini (if key available)
    if (isGeminiAvailable()) {
      const geminiResult = await parseWithGemini(text);
      if (geminiResult && !cancelRef.current) {
        setAiSource('gemini');
        setParsedResult(geminiResult);
        setPhase('parsed');
        setTimeout(() => createFromParsed(geminiResult), 2000);
        return;
      }
    }

    // 2) Rule-based fallback
    if (cancelRef.current) return;
    const localResult = parseVoiceInput(text);
    setAiSource('local');
    setParsedResult(localResult);
    setPhase('parsed');
    setTimeout(() => createFromParsed(localResult), 1800);
  };

  const handleVoiceResult = (text) => {
    setTranscript(text);
    smartParse(text);
  };

  const handleManualSubmit = (text) => {
    setTranscript(text);
    smartParse(text);
  };

  // Run the briefing → ask → listen conversation each time the modal opens.
  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current = false;
    setTranscript('');
    setManual('');
    setParsedResult(null);
    setAiSource(null);
    setBriefingText('');
    if (!VOICE_SUPPORTED) {
      setPhase('unsupported');
      return undefined;
    }
    
    let cancelled = false;

    const startListening = () => {
      if (cancelled) return;
      setPhase('listening');
      const recog = new SpeechRecognitionCtor();
      recog.lang = 'ko-KR';
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      recogRef.current = recog;
      recog.onstart = () => !cancelled && setPhase('listening');
      recog.onerror = () => !cancelled && setPhase('error');
      recog.onresult = (e) => {
        if (cancelled) return;
        const text = e.results?.[0]?.[0]?.transcript?.trim();
        if (text) handleVoiceResult(text);
        else setPhase('error');
      };
      try { recog.start(); } catch { setPhase('error'); }
    };

    const doBriefing = async () => {
      setPhase('preparing_briefing');
      try {
        const [pending, zombies] = await Promise.all([
          getAllPending(),
          getZombieTasks()
        ]);
        if (cancelled) return;
        
        const text = await generateBriefing(pending, zombies);
        if (cancelled) return;
        
        setBriefingText(text);
        setPhase('briefing');
        speak(text, startListening);
      } catch (err) {
        if (cancelled) return;
        console.warn('[VoiceTaskCapture] Briefing failed', err);
        speak(PROMPT, startListening);
      }
    };

    doBriefing();

    return () => {
      cancelled = true;
      cancelRef.current = true;
      try { recogRef.current?.abort(); } catch { /* noop */ }
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const showManual = phase === 'unsupported' || phase === 'error';
  const showParsed = phase === 'parsed' || phase === 'creating' || phase === 'done';

  return (
    <Modal isOpen={open} onClose={onClose} title="🎙️ 음성으로 작업 추가" maxWidth={480}>
      <div className="voice-capture">
        
        {phase === 'preparing_briefing' && (
          <p className="voice-capture__status voice-capture__status--parsing">
            <span className="voice-capture__spinner" />
            작업 현황을 파악 중입니다…
          </p>
        )}

        {phase === 'briefing' && (
          <div className="voice-capture__briefing">
            <p className="voice-capture__briefing-text">{briefingText}</p>
            <p className="voice-capture__status">
              <span className="voice-capture__pulse" style={{ background: '#3b82f6' }} />
              자비스가 브리핑 중입니다…
            </p>
          </div>
        )}

        {phase === 'listening' && (
          <p className="voice-capture__status voice-capture__status--live">
            <span className="voice-capture__pulse" />
            듣고 있어요 — 작업을 말씀해 주세요
          </p>
        )}

        {phase === 'parsing' && (
          <p className="voice-capture__status voice-capture__status--parsing">
            <span className="voice-capture__spinner" />
            AI가 분석 중이에요…
          </p>
        )}

        {/* 원본 음성 텍스트 */}
        {transcript && (showParsed || phase === 'parsing') && (
          <p className="voice-capture__transcript">🗣️ "{transcript}"</p>
        )}

        {/* 파싱 결과 확인 카드 */}
        {showParsed && parsedResult && (
          <div className="voice-capture__card">
            <div className="voice-capture__card-header">
              <div className="voice-capture__card-title">📝 {parsedResult.title}</div>
              {aiSource === 'gemini' && (
                <span className="voice-capture__ai-badge">✨ Gemini AI</span>
              )}
            </div>
            <div className="voice-capture__card-tags">
              {parsedResult.deadline && (
                <span className="voice-capture__tag voice-capture__tag--deadline">
                  📅 {formatDeadline(parsedResult.deadline)}
                </span>
              )}
              <span className="voice-capture__tag voice-capture__tag--importance">
                ⭐ {IMPORTANCE_LABELS[parsedResult.importance]}
              </span>
              <span className="voice-capture__tag voice-capture__tag--category">
                📂 {parsedResult.category}
              </span>
              <span className="voice-capture__tag voice-capture__tag--energy">
                ⚡ {ENERGY_LABELS[parsedResult.requiredEnergy]}
              </span>
              <span className="voice-capture__tag voice-capture__tag--duration">
                ⏱ {parsedResult.estimatedMinutes}분
              </span>
            </div>
            {phase === 'parsed' && (
              <div className="voice-capture__card-actions">
                <div className="voice-capture__progress" />
              </div>
            )}
            {phase === 'creating' && <p className="voice-capture__status">기록 중…</p>}
            {phase === 'done' && (
              <p className="voice-capture__status voice-capture__status--ok">✅ 기록 완료!</p>
            )}
          </div>
        )}

        {phase === 'unsupported' && (
          <p className="voice-capture__status">이 브라우저는 음성 인식을 지원하지 않아요. 직접 입력해 주세요.</p>
        )}
        {phase === 'error' && (
          <p className="voice-capture__status voice-capture__status--err">못 알아들었어요. 아래에 직접 입력해 주세요.</p>
        )}

        {showManual && (
          <form
            className="voice-capture__manual"
            onSubmit={(e) => {
              e.preventDefault();
              const t = manual.trim();
              if (t) handleManualSubmit(t);
            }}
          >
            <input
              className="voice-capture__input"
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="예: 내일까지 급한 보고서 작성"
            />
            <button type="submit" className="btn-primary">추가</button>
          </form>
        )}
      </div>
    </Modal>
  );
}
