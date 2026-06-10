import { AlertTriangle, AlertOctagon, Check, Trash2 } from 'lucide-react';
import './NotificationItem.css';

/**
 * NotificationItem — 타입별 렌더(OVERDUE_1DAY / OVERDUE_2DAY / DELETE_CONFIRM).
 * 본문 클릭 시 관련 Task 로 이동(onNavigate). DELETE_CONFIRM 은 [완료로 처리]/[삭제] 버튼 노출.
 *
 * props:
 *  - notification: { id, task_id, type, message, is_read, created_at }
 *  - onNavigate(taskId), onResolve(taskId, 'COMPLETE'|'DELETE'), onMarkRead(id)
 */
const ICON = {
  OVERDUE_1DAY: AlertTriangle,
  OVERDUE_2DAY: AlertTriangle,
  DELETE_CONFIRM: AlertOctagon,
  INFO: AlertTriangle,
};

export default function NotificationItem({ notification, onNavigate, onResolve, onMarkRead }) {
  const { id, task_id: taskId, type, message, is_read: isRead } = notification;
  const Icon = ICON[type] ?? AlertTriangle;
  const isConfirm = type === 'DELETE_CONFIRM';

  const activate = () => {
    if (!isRead) onMarkRead?.(id);
    onNavigate?.(taskId);
  };

  return (
    <li
      className={`notif-item notif-item--${type.toLowerCase()} ${isRead ? 'is-read' : ''}`}
      role="menuitem"
      tabIndex={-1}
    >
      <button
        type="button"
        className="notif-item__main"
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        }}
        aria-label={`${message} — 관련 작업으로 이동`}
      >
        <span className="notif-item__icon" aria-hidden="true"><Icon size={18} strokeWidth={2.2} /></span>
        <span className="notif-item__body">
          <span className="notif-item__message">{message}</span>
          {!isRead && <span className="notif-item__unread-dot" aria-label="읽지 않음" />}
        </span>
      </button>

      {isConfirm && (
        <div className="notif-item__actions">
          <button
            type="button"
            className="notif-btn notif-btn--complete"
            onClick={() => onResolve?.(taskId, 'COMPLETE')}
          >
            <Check size={14} aria-hidden="true" /> 완료로 처리
          </button>
          <button
            type="button"
            className="notif-btn notif-btn--delete"
            onClick={() => onResolve?.(taskId, 'DELETE')}
          >
            <Trash2 size={14} aria-hidden="true" /> 삭제
          </button>
        </div>
      )}
    </li>
  );
}
