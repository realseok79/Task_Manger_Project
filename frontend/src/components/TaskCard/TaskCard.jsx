import { memo } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import TagBadge from '../TagBadge/TagBadge';
import TimerDisplay from '../TimerDisplay/TimerDisplay';
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
}) {
  const hasTimer = Boolean(onPauseTimer || onResumeTimer || onStopTimer);
  const resolved = delayCount >= 5 ? 'zombie' : variant;
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
  const handleCheck = (e) => {
    e.stopPropagation();
    onComplete?.();
  };

  // --- Flat-line layout (Things/Linear): one line, meta pushed right -------
  if (layout === 'line') {
    return (
      <div
        className={`task-card task-card--line task-card--line-${resolved} ${dimmed ? 'task-card--dimmed' : ''} ${onClick ? 'is-interactive' : ''}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      >
        <button
          type="button"
          className="task-card__check"
          role="checkbox"
          aria-checked="false"
          aria-label={`${title} 완료 처리`}
          onClick={handleCheck}
        />
        <span className="task-card__title" title={title}>{truncated}</span>
        {resolved === 'zombie' && (
          <span className="task-card__delay-badge">
            <AlertTriangle size={12} aria-hidden="true" />
            {delayCount}번 미뤄짐
          </span>
        )}
        <span className="task-card__line-meta">
          {tags.map((t) => (
            <TagBadge key={t.label} label={t.label} category={t.category} />
          ))}
          {dday && <TagBadge label={dday} category="deadline" />}
          {scheduledTime && <span className="task-card__sub mono">{scheduledTime}</span>}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`task-card task-card--${resolved} ${zombieClass} ${dimmed ? 'task-card--dimmed' : ''} ${onClick ? 'is-interactive' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
    >
      <div className="task-card__body">
        <button
          type="button"
          className="task-card__check"
          role="checkbox"
          aria-checked="false"
          aria-label={`${title} 완료 처리`}
          onClick={handleCheck}
        />

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

        {hasTimer && (
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
