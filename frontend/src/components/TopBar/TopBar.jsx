import { useEffect, useRef, useState } from 'react';
import { Search, Moon, Sun, Bell, User, Menu, AlertTriangle, Clock, Settings, HelpCircle } from 'lucide-react';
import NotificationBell from '../NotificationBell/NotificationBell';
import './TopBar.css';

/** TopBar — search, theme toggle, notifications popover, profile menu. */
export default function TopBar({
  placeholder = '작업 검색...',
  isDarkMode,
  notifications = [],
  onSearch,
  onThemeToggle,
  onMenu,
  onOpenSettings,
  onOpenHelp,
  notification,
}) {
  const [openMenu, setOpenMenu] = useState(null); // 'notif' | 'profile' | null
  const ref = useRef(null);
  const hasNotif = notifications.length > 0;

  useEffect(() => {
    if (!openMenu) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpenMenu(null);
    };
    const onKey = (e) => e.key === 'Escape' && setOpenMenu(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const toggle = (m) => setOpenMenu((cur) => (cur === m ? null : m));
  const go = (fn) => {
    setOpenMenu(null);
    fn?.();
  };

  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__menu" onClick={onMenu} aria-label="메뉴 열기">
        <Menu size={20} />
      </button>

      <div className="topbar__search">
        <Search size={18} aria-hidden="true" />
        <input type="search" placeholder={placeholder} aria-label="작업 검색" onChange={(e) => onSearch?.(e.target.value)} />
      </div>

      <div className="topbar__actions" ref={ref}>
        <button
          type="button"
          className="icon-btn"
          onClick={onThemeToggle}
          aria-label={isDarkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
          aria-pressed={isDarkMode}
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {notification ? (
          <NotificationBell {...notification} />
        ) : (
          <div className="topbar__pop">
            <button
              type="button"
              className={`icon-btn topbar__bell ${openMenu === 'notif' ? 'is-active' : ''}`}
              onClick={() => toggle('notif')}
              aria-label={hasNotif ? '읽지 않은 알림 있음' : '알림'}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'notif'}
            >
              <Bell size={20} />
              {hasNotif && <span className="topbar__dot" aria-hidden="true" />}
            </button>
          {openMenu === 'notif' && (
            <div className="topbar-menu topbar-menu--notif" role="menu" aria-label="알림">
              <div className="topbar-menu__head">알림</div>
              {notifications.length === 0 ? (
                <p className="topbar-menu__empty">새 알림이 없어요.</p>
              ) : (
                <ul className="notif-list">
                  {notifications.map((n) => (
                    <li key={n.id} className={`notif notif--${n.kind}`}>
                      <span className="notif__icon">
                        {n.kind === 'danger' ? <AlertTriangle size={15} /> : <Clock size={15} />}
                      </span>
                      <span className="notif__body">
                        <span className="notif__title" title={n.title}>{n.title}</span>
                        <span className="notif__text">{n.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        )}

        <div className="topbar__pop">
          <button
            type="button"
            className={`icon-btn ${openMenu === 'profile' ? 'is-active' : ''}`}
            onClick={() => toggle('profile')}
            aria-label="프로필"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'profile'}
          >
            <User size={20} />
          </button>
          {openMenu === 'profile' && (
            <div className="topbar-menu topbar-menu--profile" role="menu" aria-label="계정">
              <div className="profile-head">
                <span className="profile-avatar">S</span>
                <span className="profile-id">
                  <span className="profile-name">사용자</span>
                  <span className="profile-sub">SIGMA 워크스페이스</span>
                </span>
              </div>
              <div className="topbar-menu__sep" />
              <button type="button" className="topbar-menu__item" role="menuitem" onClick={() => go(onOpenSettings)}>
                <Settings size={16} /> 설정
              </button>
              <button type="button" className="topbar-menu__item" role="menuitem" onClick={() => go(onOpenHelp)}>
                <HelpCircle size={16} /> 도움말
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
