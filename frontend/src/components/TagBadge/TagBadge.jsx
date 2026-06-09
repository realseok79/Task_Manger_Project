import { AlarmClock } from 'lucide-react';
import './TagBadge.css';

/**
 * TagBadge — category label tinted with the semantic 8-colour palette by default
 * (soft fill + darker text). `deadline` renders the red D-day style.
 */
export default function TagBadge({ label, category = 'neutral' }) {
  if (category === 'deadline') {
    return (
      <span className="tag-badge tag-badge--deadline">
        <AlarmClock size={11} aria-hidden="true" />
        {label}
      </span>
    );
  }
  return <span className={`tag-badge tag-badge--tint-${category}`}>{label}</span>;
}
