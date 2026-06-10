import { useEffect, useRef } from 'react';
import { CheckCheck } from 'lucide-react';
import NotificationItem from '../NotificationItem/NotificationItem';
import './NotificationPanel.css';

/**
 * NotificationPanel — 벨 클릭 시 뜨는 드롭다운.
 * 헤더("알림" + "모두 읽음") + 목록 + 빈/로딩 상태. role="menu", 첫 항목 자동 포커스.
 */
export default function NotificationPanel({
  items = [],
  isLoading = false,
  unreadCount = 0,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onMarkAllRead,
  onMarkRead,
  onDismiss,
  onResolve,
  onNavigate,
}) {
  const listRef = useRef(null);

  // 열릴 때 첫 메뉴 항목으로 포커스 이동(키보드 접근성)
  useEffect(() => {
    const first = listRef.current?.querySelector('[role="menuitem"] .notif-item__main');
    first?.focus();
  }, [isLoading]);

  return (
    <div className="notif-panel" role="menu" aria-label="알림 목록">
      <header className="notif-panel__header">
        <h2 className="notif-panel__title">알림{unreadCount > 0 && <span className="notif-panel__count">{unreadCount}</span>}</h2>
        <button
          type="button"
          className="notif-panel__readall"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
        >
          <CheckCheck size={15} aria-hidden="true" /> 모두 읽음
        </button>
      </header>

      {isLoading ? (
        <div className="notif-panel__skeletons" aria-busy="true" aria-label="알림 불러오는 중">
          {[0, 1, 2].map((i) => <div key={i} className="notif-skel" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="notif-panel__empty">
          <span className="notif-panel__empty-emoji" aria-hidden="true">🎉</span>
          <p className="notif-panel__empty-text">밀린 작업이 없습니다.</p>
        </div>
      ) : (
        <ul className="notif-panel__list" ref={listRef}>
          {items.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onNavigate={onNavigate}
              onResolve={onResolve}
              onMarkRead={onMarkRead}
            />
          ))}
          {hasMore && (
            <li className="notif-panel__more">
              <button type="button" className="notif-panel__more-btn" onClick={onLoadMore} disabled={isLoadingMore}>
                {isLoadingMore ? '불러오는 중…' : '더 보기'}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
