import { memo } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useTimerFlip, useRipple } from '../../hooks/useAnimations';
import './TimerDisplay.css';

/**
 * TimerDisplay — monospace HH:MM:SS with a flip on change + pause/stop controls.
 */
function TimerDisplay({ value, isRunning, onPause, onResume, onStop, size = 'lg' }) {
  const flipKey = useTimerFlip(value);
  const ripple = useRipple();

  return (
    <div className="timer">
      <span
        key={flipKey}
        className={`timer-display timer-display--${size} anim-digit-flip`}
        aria-live="off"
      >
        {value}
      </span>
      {(onPause || onStop) && (
        <div className="timer__controls">
          <button
            type="button"
            className="timer__btn ripple-host"
            onPointerDown={ripple}
            onClick={isRunning ? onPause : onResume}
            aria-label={isRunning ? '타이머 일시정지' : '타이머 재생'}
          >
            {isRunning ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            className="timer__btn timer__btn--stop ripple-host"
            onPointerDown={ripple}
            onClick={onStop}
            aria-label="타이머 정지"
          >
            <Square size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(TimerDisplay);
