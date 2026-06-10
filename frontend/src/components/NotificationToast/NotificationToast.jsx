import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, AlertOctagon, X } from 'lucide-react';
import './NotificationToast.css';

const ICON = { OVERDUE_1DAY: AlertTriangle, OVERDUE_2DAY: AlertTriangle, DELETE_CONFIRM: AlertOctagon, INFO: AlertTriangle };
const AUTO_DISMISS_MS = 3000;

function Toast({ toast, onDismiss, onClick }) {
  const Icon = ICON[toast.type] ?? AlertTriangle;

  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <motion.div
      className={`notif-toast notif-toast--${toast.type.toLowerCase()}`}
      role="status"
      aria-live="polite"
      layout
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <button type="button" className="notif-toast__main" onClick={() => onClick?.(toast.task_id)}>
        <span className="notif-toast__icon" aria-hidden="true"><Icon size={18} strokeWidth={2.2} /></span>
        <span className="notif-toast__message">{toast.message}</span>
      </button>
      <button type="button" className="notif-toast__close" aria-label="알림 닫기" onClick={() => onDismiss(toast.id)}>
        <X size={14} />
      </button>
    </motion.div>
  );
}

/**
 * NotificationToastHost — 화면 우하단 토스트 스택. 각 토스트는 3초 후 자동 사라짐.
 * props: toasts: [{ id, type, message, task_id }], onDismiss(id), onClick(taskId)
 */
export default function NotificationToastHost({ toasts = [], onDismiss, onClick }) {
  return (
    <div className="notif-toast-host" aria-label="새 알림">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={onDismiss} onClick={onClick} />
        ))}
      </AnimatePresence>
    </div>
  );
}
