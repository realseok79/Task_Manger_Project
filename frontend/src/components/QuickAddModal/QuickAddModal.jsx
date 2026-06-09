import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { overlayVariants, modalVariants } from '../../hooks/useAnimations';
import './QuickAddModal.css';

/**
 * QuickAddModal — centred command composer for creating a task.
 * Opened by the quiet "+ 새 작업" trigger or the global ⌘K / Ctrl+K shortcut.
 * Enter adds, Esc closes, click-outside closes. Self-contained field state.
 */
const ENERGY = [
  { id: 'LOW', label: '낮음' },
  { id: 'MEDIUM', label: '보통' },
  { id: 'HIGH', label: '높음' },
];
const CATEGORIES = ['업무', '개인', '디자인', '문서', '회의', '개발', '인사'];
const IMPORTANCE = [
  { value: 5, label: '매우 높음' },
  { value: 4, label: '높음' },
  { value: 3, label: '보통' },
  { value: 2, label: '낮음' },
  { value: 1, label: '매우 낮음' },
];

export default function QuickAddModal({ isOpen, onClose, onAdd }) {
  const [title, setTitle] = useState('');
  const [energy, setEnergy] = useState('MEDIUM');
  const [category, setCategory] = useState('업무');
  const [importance, setImportance] = useState(3);
  const [deadline, setDeadline] = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    // Reset fields, lock scroll, focus title, restore focus on close.
    setTitle('');
    setEnergy('MEDIUM');
    setCategory('업무');
    setImportance(3);
    setDeadline('');
    const prevFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => titleRef.current?.focus(), 20);

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      prevFocus?.focus?.();
    };
  }, [isOpen, onClose]);

  const submit = (e) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd({
      title: trimmed,
      estimatedMinutes: 30,
      requiredEnergy: energy,
      importance: Number(importance),
      category,
      deadline: deadline ? new Date(`${deadline}T09:00:00`).toISOString() : undefined,
    });
    onClose?.();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay quick-add-modal__overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="show"
          exit="exit"
          onClick={onClose}
        >
          <motion.form
            className="modal-content quick-add-modal"
            variants={modalVariants}
            role="dialog"
            aria-modal="true"
            aria-label="새 작업 추가"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <div className="quick-add-modal__main">
              <Plus size={18} className="quick-add-modal__icon" aria-hidden="true" />
              <input
                ref={titleRef}
                className="quick-add-modal__title"
                placeholder="새 작업"
                aria-label="작업 제목"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="quick-add-modal__options">
              <label className="qa-field">
                <span>에너지</span>
                <select value={energy} onChange={(e) => setEnergy(e.target.value)}>
                  {ENERGY.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <label className="qa-field">
                <span>카테고리</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="qa-field">
                <span>중요도</span>
                <select value={importance} onChange={(e) => setImportance(e.target.value)}>
                  {IMPORTANCE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="qa-field">
                <span>마감</span>
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </label>
            </div>

            <div className="quick-add-modal__footer">
              <span className="quick-add-modal__hint">
                <kbd>Enter</kbd> 추가 · <kbd>Esc</kbd> 취소
              </span>
              <button type="submit" className="btn-primary">추가</button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
