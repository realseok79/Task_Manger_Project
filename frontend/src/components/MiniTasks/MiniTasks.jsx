import { Check } from 'lucide-react';
import './MiniTasks.css';

/**
 * MiniTasks — compact today's-list rendered into a Document Picture-in-Picture
 * window (always-on-top). Shares the main app's task state via a React portal,
 * so completing here updates the main view too.
 */
export default function MiniTasks({ priorityTask, pending = [], onComplete }) {
  const items = [priorityTask, ...pending].filter(Boolean).slice(0, 8);

  return (
    <div className="mini">
      <div className="mini__head">오늘의 작업</div>
      {items.length === 0 ? (
        <p className="mini__empty">오늘 남은 작업이 없습니다.</p>
      ) : (
        <ul className="mini__list">
          {items.map((t) => (
            <li key={t.id} className="mini__item">
              <button
                type="button"
                className="mini__check"
                aria-label={`${t.title} 완료`}
                onClick={() => onComplete?.(t.id)}
              >
                <Check size={12} strokeWidth={3} />
              </button>
              <span className="mini__title" title={t.title}>{t.title}</span>
              {t.dday && <span className="mini__dday">{t.dday}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
