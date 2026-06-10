import { useEffect, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import './AddTaskModal.css';

const CATEGORIES = ['개인', '업무', '학습', '건강', '기타'];
const DEFAULT_FORM = { title: '', category: '개인', importance: 3, description: '' };

/**
 * AddTaskModal — 새 작업 추가 모달 (GOAL-1).
 * 작업명 필수, 카테고리/중요도/메모 입력. Enter 제출 · Escape 닫기 · 작업명 자동 포커스.
 */
export default function AddTaskModal({ isOpen, onClose, onSubmit }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState('');
  const titleRef = useRef(null);

  // 열릴 때 폼 초기화 + 작업명 자동 포커스
  useEffect(() => {
    if (!isOpen) return;
    setForm(DEFAULT_FORM);
    setError('');
    const t = setTimeout(() => titleRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Escape 로 닫기
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setError('작업명을 입력해 주세요');
      titleRef.current?.focus();
      return;
    }
    onSubmit({
      title,
      category: form.category,
      importance: Number(form.importance),
      description: form.description.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="modal-panel add-task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-task-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="add-task-title" className="modal-title"><Plus size={18} aria-hidden="true" /> 새 작업 추가</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </header>

        <form className="modal-body" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">작업명 <em className="field__req" aria-hidden="true">*</em></span>
            <input
              ref={titleRef}
              className={`field__input ${error ? 'field__input--error' : ''}`}
              type="text"
              maxLength={100}
              placeholder="무엇을 할까요?"
              value={form.title}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'add-task-error' : undefined}
              onChange={(e) => {
                update({ title: e.target.value });
                if (error) setError('');
              }}
            />
            {error && <span id="add-task-error" className="field__error" role="alert">{error}</span>}
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field__label">카테고리</span>
              <select
                className="field__input"
                value={form.category}
                onChange={(e) => update({ category: e.target.value })}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            <label className="field">
              <span className="field__label">중요도 <span className="field__hint mono">{form.importance}/5</span></span>
              <input
                className="field__range"
                type="range"
                min={1}
                max={5}
                step={1}
                value={form.importance}
                onChange={(e) => update({ importance: Number(e.target.value) })}
              />
            </label>
          </div>

          <label className="field">
            <span className="field__label">메모 <span className="field__hint">(선택)</span></span>
            <textarea
              className="field__input field__textarea"
              maxLength={500}
              rows={3}
              placeholder="상세 내용을 남겨두면 좋아요"
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </label>

          <footer className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary">추가</button>
          </footer>
        </form>
      </div>
    </div>
  );
}
