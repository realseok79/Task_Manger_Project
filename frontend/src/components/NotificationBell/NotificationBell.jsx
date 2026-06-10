import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import NotificationPanel from '../NotificationPanel/NotificationPanel';
import './NotificationBell.css';

/**
 * NotificationBell — 우측 상단 벨. 미읽음 배지(99+), 로딩 dim, 드롭다운 패널 토글.
 * 접근성: aria-haspopup/expanded, Esc 닫기, 바깥 클릭 닫기, 닫을 때 버튼으로 포커스 복귀.
 */
export default function NotificationBell({
  items = [],
  unreadCount = 0,
  isLoading = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onMarkAllRead,
  onMarkRead,
  onDismiss,
  onResolve,
  onNavigate,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  const close = () => {
    setOpen(false);
    btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const badge = unreadCount > 99 ? '99+' : String(unreadCount);
  const label = unreadCount > 0 ? `알림, 읽지 않음 ${unreadCount}건` : '알림';

  const handleNavigate = (taskId) => {
    onNavigate?.(taskId);
    close();
  };

  return (
    <div className="notif-bell" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`icon-btn notif-bell__btn ${isLoading ? 'is-loading' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={20} />
        {!isLoading && unreadCount > 0 && (
          <span className="notif-bell__badge" aria-hidden="true">{badge}</span>
        )}
        {isLoading && <span className="notif-bell__pulse" aria-hidden="true" />}
      </button>

      {open && (
        <div className="notif-bell__dropdown">
          <NotificationPanel
            items={items}
            isLoading={isLoading}
            unreadCount={unreadCount}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
            onMarkAllRead={onMarkAllRead}
            onMarkRead={onMarkRead}
            onDismiss={onDismiss}
            onResolve={onResolve}
            onNavigate={handleNavigate}
          />
        </div>
      )}
    </div>
  );
}
