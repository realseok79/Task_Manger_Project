import { Lightbulb, Zap } from 'lucide-react';
import './ContextBar.css';

const ENERGY = [
  { id: 'LOW', label: '낮음' },
  { id: 'MEDIUM', label: '보통' },
  { id: 'HIGH', label: '높음' },
];

const PRIORITY_LABEL = { Critical: '매우 높음', High: '높음', Medium: '보통', Low: '낮음' };

/**
 * ContextBar — current-state input (time slider + energy toggle) that drives the
 * expected-priority readout. Fully controlled via `onChange`.
 */
export default function ContextBar({ timeAvailable, energyLevel, expectedPriority, onChange }) {
  const priorityKo = PRIORITY_LABEL[expectedPriority] ?? '보통';
  const pct = (timeAvailable / 8) * 100;

  return (
    <section className="context-bar-panel anim-section-in" aria-label="현재 상태 입력">
      <h3 className="context-bar__heading">
        <Lightbulb size={18} aria-hidden="true" />
        현재 상태 입력
      </h3>

      <div className="context-bar__grid">
        {/* TIME AVAILABLE */}
        <div className="context-bar__field">
          <div className="context-bar__labelrow">
            <span className="context-bar__label">가용 시간</span>
            <span className="context-bar__value mono">{timeAvailable.toFixed(1)}시간</span>
          </div>
          <input
            type="range"
            className="context-bar__slider"
            min="0"
            max="8"
            step="0.5"
            value={timeAvailable}
            style={{ '--fill': `${pct}%` }}
            aria-label="가용 시간"
            aria-valuemin={0}
            aria-valuemax={8}
            aria-valuenow={timeAvailable}
            aria-valuetext={`${timeAvailable.toFixed(1)}시간`}
            onChange={(e) => onChange({ time: Number(e.target.value), energy: energyLevel })}
          />
        </div>

        {/* ENERGY LEVEL */}
        <div className="context-bar__field">
          <span className="context-bar__label">에너지 레벨</span>
          <div className="energy-toggle" role="radiogroup" aria-label="에너지 레벨">
            {ENERGY.map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={energyLevel === e.id}
                className={`energy-toggle__btn ${energyLevel === e.id ? 'is-active' : ''}`}
                onClick={() => onChange({ time: timeAvailable, energy: e.id })}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="context-bar__priority" data-level={expectedPriority}>
        <Zap size={15} aria-hidden="true" />
        예상 우선순위: <strong>{priorityKo}</strong>
      </div>
    </section>
  );
}
