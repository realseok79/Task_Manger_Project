import { memo, useState } from 'react';
import { Check, AlertTriangle, Play, Pause } from 'lucide-react';
import TagBadge from '../TagBadge/TagBadge';
import TimerDisplay from '../TimerDisplay/TimerDisplay';
import CountdownTimer from '../CountdownTimer/CountdownTimer';
import TaskActionButtons from '../TaskActionButtons/TaskActionButtons';
import { usePulse } from '../../hooks/useAnimations';
import './TaskCard.css';

/**
 * TaskCard — variant: 'default' | 'priority' | 'zombie' | 'completed'.
 * delayCount >= 5 forces the zombie variant.
 */
function TaskCard({
  variant = 'default',
  title,
  description,
  tags = [],
  dday,
  scheduledTime,
  completedAt,
  delayedFrom,
  delayCount = 0,
  timeRange,
  isCritical = false,
  assignees = [],
  dimmed = false,
  layout = 'card', // 'card' | 'line'
  isTimerRunning = false,
  timerValue,
  onComplete,
  onClick,
  onPauseTimer,
  onResumeTimer,
  onStopTimer,
  // GOAL-3: 작업 진행 상태 제어 (IDLE/RUNNING/PAUSED). 제공되면 시작/중지/끝내기 버튼을 렌더.
  runStatus,
  displayTime,
  onStart,
  onPause,
  onResume,
  onFinish,
  // 카운트다운 타이머(소요시간 기반). 제공되면 위 run 버튼 대신 CountdownTimer 를 렌더.
  countdown,
  // displayStatus 기반 제어 버튼(IDLE/ACTIVE/PAUSED/OVERDUE/COMPLETED). 제공되면 TaskActionButtons 렌더.
  actions,
}) {
  const hasTimer = Boolean(onPauseTimer || onResumeTimer || onStopTimer);
  const resolved = delayCount >= 5 ? 'zombie' : variant;
  const hasControls = Boolean(runStatus) || Boolean(countdown) || Boolean(actions);
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn?.();
  };
  const truncated = title && title.length > 50 ? `${title.slice(0, 50)}…` : title;

  // --- History (completed) row: single line, tag + time pushed right -------
  if (resolved === 'completed') {
    return (
      <div className="task-card task-card--completed">
        <button
          type="button"
          className="task-card__check is-checked"
          role="checkbox"
          aria-checked="true"
          aria-label={`${title} 완료됨`}
          onClick={onComplete}
        >
          <Check size={14} strokeWidth={3} />
        </button>
        <span className="task-card__title" title={title}>{truncated}</span>
        {tags.map((t) => (
          <TagBadge key={t.label} label={t.label} category={t.category} />
        ))}
        {completedAt && <span className="task-card__completed-time mono">{completedAt}</span>}
      </div>
    );
  }

  // --- Active card (default / priority / zombie) ---------------------------
  const zombieClass = usePulse(resolved === 'zombie', 'anim-zombie-in');
  const [done, setDone] = useState(false);
  // Check fills, the row dims/strikes, then completes — the parent's removal
  // triggers the list exit (fade + collapse) animation.
  const handleCheck = (e) => {
    e.stopPropagation();
    if (done) return;
    setDone(true);
    setTimeout(() => onComplete?.(), 280);
  };

  // --- Flat-line layout (Things/Linear): one line, meta pushed right -------
  if (layout === 'line') {
    return (
      <div
        className={`task-card task-card--line task-card--line-${resolved} ${dimmed ? 'task-card--dimmed' : ''} ${done ? 'task-card--done' : ''} ${onClick ? 'is-interactive' : ''}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      >
        <button
          type="button"
          className={`task-card__check ${done ? 'is-checked' : ''}`}
          role="checkbox"
          aria-checked={done}
          aria-label={`${title} 완료 처리`}
          onClick={handleCheck}
        >
          {done && <Check size={14} strokeWidth={3} />}
        </button>
        <span className="task-card__title" title={title}>{truncated}</span>
        {resolved === 'zombie' && (
          <span className="task-card__delay-badge">
            <AlertTriangle size={12} aria-hidden="true" />
            {delayCount}번 미뤄짐
          </span>
        )}
        {hasControls && (countdown || actions) && (
          <div className="task-card__controls" onClick={(e) => e.stopPropagation()} role="presentation">
            {countdown && <CountdownTimer {...countdown} hideControls={Boolean(actions)} />}
            {actions && <TaskActionButtons {...actions} />}
          </div>
        )}
        <span className="task-card__line-meta">
          {scheduledTime && <span className="task-card__sub mono">{scheduledTime}</span>}
          {tags.map((t) => (
            <TagBadge key={t.label} label={t.label} category={t.category} />
          ))}
          {dday && <span className="task-card__dday-slot"><TagBadge label={dday} category="deadline" /></span>}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`task-card task-card--${resolved} ${zombieClass} ${dimmed ? 'task-card--dimmed' : ''} ${done ? 'task-card--done' : ''} ${onClick ? 'is-interactive' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
    >
      <div className="task-card__body">
        {!hasControls && (
          <button
            type="button"
            className={`task-card__check ${done ? 'is-checked' : ''}`}
            role="checkbox"
            aria-checked={done}
            aria-label={`${title} 완료 처리`}
            onClick={handleCheck}
          >
            {done && <Check size={14} strokeWidth={3} />}
          </button>
        )}

        <div className="task-card__content">
          <div className="task-card__titlerow">
            <span className="task-card__title" title={title}>{truncated}</span>
            {resolved === 'zombie' && (
              <span className="task-card__delay-badge">
                <AlertTriangle size={12} aria-hidden="true" />
                {delayCount}번 미뤄짐
              </span>
            )}
          </div>

          {description && <p className="task-card__desc">{description}</p>}

          {(tags.length > 0 || dday || scheduledTime) && (
            <div className="task-card__meta">
              {tags.map((t) => (
                <TagBadge key={t.label} label={t.label} category={t.category} />
              ))}
              {dday && <TagBadge label={dday} category="deadline" />}
              {scheduledTime && <span className="task-card__sub">{scheduledTime}</span>}
            </div>
          )}

          {delayedFrom && <p className="task-card__delayed-from">{delayedFrom}부터 미뤄진 작업</p>}

          {dimmed && <span className="task-card__dim-note">지금 상황엔 무리 · 시간·에너지 초과</span>}

          {(timeRange || isCritical || assignees.length > 0) && (
            <div className="task-card__footer">
              {timeRange && <span className="task-card__sub mono">{timeRange}</span>}
              {isCritical && <span className="task-card__critical">! 중요</span>}
              {assignees.length > 0 && (
                <span className="task-card__avatars">
                  {assignees.map((a, i) => (
                    <span key={i} className="task-card__avatar" style={{ background: a.color }} title={a.name}>
                      {a.name?.[0] ?? '·'}
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
        </div>

        {hasControls && (countdown || actions) && (
          <div className="task-card__controls" onClick={(e) => e.stopPropagation()} role="presentation">
            {countdown && <CountdownTimer {...countdown} hideControls={Boolean(actions)} />}
            {actions && <TaskActionButtons {...actions} />}
          </div>
        )}

        {hasControls && !countdown && !actions && (
          <div className="task-card__controls">
            {(runStatus === 'RUNNING' || runStatus === 'PAUSED') && displayTime && (
              <TimerDisplay value={displayTime} isRunning={runStatus === 'RUNNING'} size="md" />
            )}

            {runStatus === 'IDLE' && (
              <button type="button" className="run-btn run-btn--start" onClick={stop(onStart)}>
                <Play size={14} aria-hidden="true" /> 시작
              </button>
            )}

            {runStatus === 'RUNNING' && (
              <>
                <button type="button" className="run-btn" onClick={stop(onPause)}>
                  <Pause size={14} aria-hidden="true" /> 중지
                </button>
                <button type="button" className="run-btn run-btn--finish" onClick={stop(onFinish)}>
                  <Check size={14} aria-hidden="true" /> 끝내기
                </button>
              </>
            )}

            {runStatus === 'PAUSED' && (
              <>
                <button type="button" className="run-btn run-btn--start" onClick={stop(onResume)}>
                  <Play size={14} aria-hidden="true" /> 재시작
                </button>
                <button type="button" className="run-btn run-btn--finish" onClick={stop(onFinish)}>
                  <Check size={14} aria-hidden="true" /> 끝내기
                </button>
              </>
            )}
          </div>
        )}

        {!hasControls && hasTimer && (
          <TimerDisplay
            value={timerValue}
            isRunning={isTimerRunning}
            onPause={onPauseTimer}
            onResume={onResumeTimer}
            onStop={onStopTimer}
          />
        )}
      </div>
    </div>
  );
}

export default memo(TaskCard);
