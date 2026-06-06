import { AlarmClock } from 'lucide-react';
import './TagBadge.css';

/**
 * TagBadge — neutral monospace pill (matches the reference). Pass `tinted` to
 * opt into the category colour system; `deadline` renders the red D-day style.
 */
export default function TagBadge({ label, category = 'neutral', tinted = false }) {
  if (category === 'deadline') {
    return (
      <span className="tag-badge tag-badge--deadline">
        <AlarmClock size={11} aria-hidden="true" />
        {label}
      </span>
    );
  }
  const cls = `tag-badge${tinted ? ` tag-badge--tint-${category}` : ''}`;
  return <span className={cls}>{label}</span>;
}
