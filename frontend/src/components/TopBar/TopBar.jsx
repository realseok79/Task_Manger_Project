import { Search, Moon, Sun, Bell, User, Menu } from 'lucide-react';
import './TopBar.css';

/** TopBar — search, dark-mode toggle, notifications, profile. */
export default function TopBar({
  placeholder = '작업 검색...',
  hasNotification = false,
  isDarkMode,
  onSearch,
  onThemeToggle,
  onMenu,
}) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__menu" onClick={onMenu} aria-label="메뉴 열기">
        <Menu size={20} />
      </button>

      <div className="topbar__search">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          placeholder={placeholder}
          aria-label="작업 검색"
          onChange={(e) => onSearch?.(e.target.value)}
        />
      </div>

      <div className="topbar__actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onThemeToggle}
          aria-label={isDarkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
          aria-pressed={isDarkMode}
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button type="button" className="icon-btn topbar__bell" aria-label={hasNotification ? '읽지 않은 알림 있음' : '알림'}>
          <Bell size={20} />
          {hasNotification && <span className="topbar__dot" aria-hidden="true" />}
        </button>

        <button type="button" className="icon-btn" aria-label="프로필">
          <User size={20} />
        </button>
      </div>
    </header>
  );
}
