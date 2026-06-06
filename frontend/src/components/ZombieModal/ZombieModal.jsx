import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { overlayVariants, modalVariants } from '../../hooks/useAnimations';
import './ZombieModal.css';

/**
 * ZombieModal — accessible confirm dialog for archiving a repeatedly-delayed task.
 * Handles ESC, body scroll lock, and a basic focus trap.
 */
export default function ZombieModal({ isOpen, taskTitle, delayCount, onArchive, onKeep, onClose }) {
  const dialogRef = useRef(null);
  const archiveRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    archiveRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab') {
        // simple focus trap
        const focusables = dialogRef.current?.querySelectorAll('button');
        if (!focusables?.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      prevFocus?.focus?.();
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay zombie-modal__overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="show"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            className="modal-content zombie-modal"
            variants={modalVariants}
            role="dialog"
            aria-modal="true"
            aria-labelledby="zombie-title"
            aria-describedby="zombie-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="zombie-modal__icon anim-icon-bounce" aria-hidden="true">
              <AlertTriangle size={30} />
            </span>

            <h2 id="zombie-title" className="zombie-modal__title">
              {delayCount}번이나 미뤄진 작업이에요
            </h2>
            <p id="zombie-desc" className="zombie-modal__desc">
              지금은 타이밍이 아닐 수 있어요.
              <br />
              ‘보관함’으로 숨겨둘까요?
            </p>
            {taskTitle && <p className="zombie-modal__task">“{taskTitle}”</p>}

            <div className="zombie-modal__actions">
              <button ref={archiveRef} type="button" className="btn-primary zombie-modal__full" onClick={onArchive}>
                보관하기
              </button>
              <button type="button" className="btn-secondary zombie-modal__full" onClick={onKeep}>
                계속 유지
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
