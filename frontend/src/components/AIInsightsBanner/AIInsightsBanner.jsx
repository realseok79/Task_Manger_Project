import { Sparkles } from 'lucide-react';
import './AIInsightsBanner.css';

/**
 * AIInsightsBanner — variant: 'insight' | 'alert' | 'stable'.
 * Renders a rotating spark icon, message, and an optional CTA on the right.
 */
export default function AIInsightsBanner({ message, ctaLabel, onCta, variant = 'insight' }) {
  return (
    <div className={`ai-banner ai-banner--${variant} anim-section-in`}>
      <span className="ai-banner__icon anim-slow-spin" aria-hidden="true">
        <Sparkles size={18} />
      </span>
      <p className="ai-banner__message">{message}</p>
      {ctaLabel && (
        <button type="button" className="ai-banner__cta" onClick={onCta}>
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
