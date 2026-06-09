import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import './Toast.css';

/**
 * Toast — bottom-centre snackbar with an optional action (e.g. 실행취소).
 * `toast` is `{ id, message, actionLabel?, onAction? }` or null.
 */
export default function Toast({ toast, onClose }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          className="toast"
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
          <span className="toast__msg">{toast.message}</span>
          {toast.actionLabel && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                toast.onAction?.();
                onClose();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button type="button" className="toast__close" onClick={onClose} aria-label="알림 닫기">
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
