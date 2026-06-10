import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Check } from 'lucide-react';
import './CountdownTimer.css';

const pad = (n) => String(n).padStart(2, '0');
function fmt(totalSeconds, withHours) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return withHours || h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * CountdownTimer — estimated_duration 에서 0으로 내려가는 카운트다운.
 *
 * drift 보정: 표시값을 누적하지 않고 매 프레임 벽시계(Date.now())에서 재계산한다.
 *   RUNNING 일 때 elapsed = baseElapsed + (now − anchorMs)/1000 → 탭 스로틀/화면잠금에도 정확.
 *   requestAnimationFrame 루프(백그라운드 자동 정지) + visibilitychange/focus 복귀 시 즉시 재계산.
 *
 * props:
 *  - estimatedDuration: number(초)  · status: 'IDLE'|'RUNNING'|'PAUSED'|'COMPLETED'
 *  - anchorMs: number|null (RUNNING 시작 시각, = runtime.runStartMs)  · baseElapsed: number(초)
 *  - onStart/onPause/onResume/onComplete
 */
export default function CountdownTimer({
  estimatedDuration,
  status = 'IDLE',
  anchorMs = null,
  baseElapsed = 0,
  onStart,
  onPause,
  onResume,
  onComplete,
  hideControls = false, // true 면 시간 표시만(버튼은 TaskActionButtons 가 담당)
}) {
  const [, force] = useState(0);
  const vibrated = useRef(false);

  const elapsed =
    status === 'RUNNING' && anchorMs ? baseElapsed + Math.max(0, (Date.now() - anchorMs) / 1000) : baseElapsed;
  const remaining = estimatedDuration - elapsed;
  const overrun = remaining < 0;
  const withHours = estimatedDuration >= 3600;
  const ratio = estimatedDuration > 0 ? Math.max(0, Math.min(1, remaining / estimatedDuration)) : 0;

  // 색상 상태: 초과 > 60초 미만 > 25% 미만 > 정상
  const tone = overrun ? 'over' : remaining < 60 ? 'danger' : ratio < 0.25 ? 'warn' : 'run';

  // RUNNING 중 rAF 루프(백그라운드 자동 정지) — 값은 매번 벽시계로 재계산되어 drift 없음
  useEffect(() => {
    if (status !== 'RUNNING') return undefined;
    let raf;
    const loop = () => { force((n) => n + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  // 비가시 탭 복귀 시 즉시 catch-up 재계산
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') force((n) => n + 1); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  // 0초 도달 시 1회 진동(Vibration API)
  useEffect(() => {
    if (overrun && status === 'RUNNING' && !vibrated.current) {
      vibrated.current = true;
      navigator.vibrate?.([200, 100, 200]);
    }
    if (!overrun) vibrated.current = false;
  }, [overrun, status]);

  const display = overrun ? fmt(elapsed - estimatedDuration, withHours) : fmt(remaining, withHours);

  return (
    <div className={`countdown countdown--${tone}`} role="timer" aria-live="off">
      <div className="countdown__readout">
        <span className={`countdown__digits ${remaining < 60 && !overrun ? 'is-blink' : ''} mono`}>{display}</span>
        {overrun && <span className="countdown__overlabel">시간 초과 +</span>}
      </div>

      {!hideControls && (
      <div className="countdown__controls">
        {status === 'IDLE' && (
          <button type="button" className="cd-btn cd-btn--start" onClick={onStart}>
            <Play size={14} aria-hidden="true" /> 시작
          </button>
        )}
        {status === 'RUNNING' && (
          <button type="button" className="cd-btn" onClick={onPause} aria-label="일시정지">
            <Pause size={14} aria-hidden="true" /> 중지
          </button>
        )}
        {status === 'PAUSED' && (
          <button type="button" className="cd-btn cd-btn--start" onClick={onResume} aria-label="재시작">
            <Play size={14} aria-hidden="true" /> 재시작
          </button>
        )}
        {(status === 'RUNNING' || status === 'PAUSED') && (
          <button type="button" className="cd-btn cd-btn--complete" onClick={() => onComplete?.(Math.round(elapsed))}>
            <Check size={14} aria-hidden="true" /> 완료
          </button>
        )}
      </div>
      )}
    </div>
  );
}
