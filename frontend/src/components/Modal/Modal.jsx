import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { overlayVariants, modalVariants } from '../../hooks/useAnimations';
import './Modal.css';

/**
 * Modal — shared dialog shell (overlay + titled card). Handles ESC, scroll lock,
 * click-outside, and focus restore. Settings/Help build on this.
 */
export default function Modal({ isOpen, onClose, title, children, maxWidth = 420 }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prevFocus?.focus?.();
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="show"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="modal-content app-modal"
            style={{ maxWidth }}
            variants={modalVariants}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="app-modal__head">
              <h2 className="app-modal__title">{title}</h2>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
                <X size={18} />
              </button>
            </div>
            <div className="app-modal__body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
