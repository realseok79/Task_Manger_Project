import './SummaryBar.css';

/**
 * SummaryBar — a quiet, factual summary strip.
 * No assistant voice, no animated icon, no fabricated metrics. Renders nothing
 * when there's no message so empty states stay clean.
 */
export default function SummaryBar({ message }) {
  if (!message) return null;
  return (
    <div className="summary-bar anim-section-in" role="status">
      <p className="summary-bar__message">{message}</p>
    </div>
  );
}
