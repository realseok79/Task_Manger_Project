import { memo } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import './TimerDisplay.css';

/**
 * TimerDisplay — calm focus timer.
 * Idle shows a quiet "집중 시작" button; running/paused shows a small monospace
 * time + controls. No per-tick flip animation (tabular-nums keeps it steady).
 */
function TimerDisplay({ value, isRunning, onPause, onResume, onStop, size = 'sm' }) {
  const hasControls = Boolean(onPause || onResume || onStop);
  const idle = !isRunning && (!value || value === '00:00:00');

  if (idle && hasControls) {
    return (
      <button type="button" className="timer-start" onClick={onResume}>
        <Play size={14} aria-hidden="true" /> 집중 시작
      </button>
    );
  }

  return (
    <div className="timer">
      <span className={`timer-display timer-display--${size}`} aria-live="off">
        {value}
      </span>
      {hasControls && (
        <div className="timer__controls">
          <button
            type="button"
            className="timer__btn"
            onClick={isRunning ? onPause : onResume}
            aria-label={isRunning ? '타이머 일시정지' : '타이머 재생'}
          >
            {isRunning ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button type="button" className="timer__btn timer__btn--stop" onClick={onStop} aria-label="타이머 정지">
            <Square size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(TimerDisplay);
