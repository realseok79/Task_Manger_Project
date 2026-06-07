import { motion } from 'framer-motion';
import './FilterTabs.css';

/**
 * FilterTabs — role=tablist with a Framer layoutId sliding indicator.
 */
export default function FilterTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="filter-tabs" role="tablist" aria-label="기간 필터">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`filter-tab ${isActive ? 'filter-tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {isActive && (
              <motion.span
                layoutId="filter-indicator"
                className="filter-tab__indicator"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="filter-tab__label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
