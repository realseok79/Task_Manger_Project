import { Calendar, Star, Clock, Archive, Settings, HelpCircle, Plus } from 'lucide-react';
import './Sidebar.css';

const NAV = [
  { id: 'today', label: '오늘의 작업', Icon: Calendar },
  { id: 'important', label: '중요', Icon: Star },
  { id: 'history', label: '기록', Icon: Clock },
  { id: 'archive', label: '보관함', Icon: Archive },
];

/** Sidebar — brand, primary nav, Add button, secondary links. */
export default function Sidebar({ activeItem, onNavigate, onAddTask, onOpenSettings, onOpenHelp, isOpen }) {
  return (
    <aside className={`sidebar anim-sidebar-in ${isOpen ? 'sidebar--open' : ''}`} aria-label="주요 메뉴">
      <div className="sidebar__brand">
        <span className="sidebar__logo">SIGMA</span>
        <span className="sidebar__tagline sidebar__labels">적응형 할 일</span>
      </div>

      <nav className="sidebar__nav" aria-label="페이지 이동">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`sidebar-nav-item ${activeItem === id ? 'sidebar-nav-item--active' : ''}`}
            aria-current={activeItem === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} aria-hidden="true" />
            <span className="sidebar__labels">{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__spacer" />

      <button type="button" className="btn-primary sidebar__add" onClick={onAddTask}>
        <Plus size={18} aria-hidden="true" />
        <span className="sidebar__labels">새 작업 추가</span>
      </button>

      <div className="sidebar__footer">
        <button type="button" className="sidebar-nav-item" onClick={onOpenSettings}>
          <Settings size={18} aria-hidden="true" />
          <span className="sidebar__labels">설정</span>
        </button>
        <button type="button" className="sidebar-nav-item" onClick={onOpenHelp}>
          <HelpCircle size={18} aria-hidden="true" />
          <span className="sidebar__labels">도움말</span>
        </button>
      </div>
    </aside>
  );
}
