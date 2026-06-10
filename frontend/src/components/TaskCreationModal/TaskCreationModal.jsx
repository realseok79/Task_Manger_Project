import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { X, Plus, AlertTriangle } from 'lucide-react';
import PriorityBlockedBanner from '../PriorityBlockedBanner/PriorityBlockedBanner';
import './TaskCreationModal.css';

const CATEGORIES = ['업무', '디자인', '개인', '학습', '건강', '기타'];
const DEFAULT_FORM = { title: '', category: '업무', deadline: '', hours: 0, minutes: 0, description: '', isPriority: false };

/** 초 → "X시간 Y분" */
function humanDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}시간 ${m}분`;
}
/** ISO 마감일 → D-N 라벨 */
function ddayLabel(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(`${dateStr}T00:00:00`).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  const d = Math.round(ms / 86400000);
  if (d === 0) return 'D-DAY';
  return d > 0 ? `D-${d}` : `D+${Math.abs(d)}`;
}

/**
 * TaskCreationModal — 새 작업 추가(제목/카테고리/마감일/소요시간).
 * 가용시간 부족(409)은 부모가 serverError 로 내려주며, 그 동안 생성 버튼 비활성·X(닫기)는 항상 활성.
 */
export default function TaskCreationModal({
  isOpen,
  onClose,
  onSubmit,
  serverError,
  onClearServerError,
  submitting = false,
  hasPriorityTask = false,
  priorityTaskTitle,
  initialTitle = '',
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [durationError, setDurationError] = useState('');
  const [titleError, setTitleError] = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    setForm({ ...DEFAULT_FORM, title: initialTitle || '' });
    setDurationError('');
    setTitleError('');
    const t = setTimeout(() => titleRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen, initialTitle]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const durationSeconds = useMemo(() => form.hours * 3600 + form.minutes * 60, [form.hours, form.minutes]);
  const dday = ddayLabel(form.deadline);

  if (!isOpen) return null;

  const update = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    if (serverError) onClearServerError?.(); // 입력 변경 시 409 배너 해제 → 재시도 가능
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    let ok = true;
    if (!form.title.trim()) { setTitleError('작업 제목을 입력해주세요'); ok = false; }
    if (durationSeconds <= 0) { setDurationError('소요시간을 입력해주세요'); ok = false; }
    if (!ok) return;
    onSubmit({
      title: form.title.trim(),
      category: form.category,
      deadline: form.deadline ? new Date(`${form.deadline}T23:59:00`).toISOString() : null,
      estimated_duration: durationSeconds,
      estimatedMinutes: Math.round(durationSeconds / 60),
      description: form.description.trim() || undefined,
      isPriority: form.isPriority && !hasPriorityTask, // 차단 상태면 강제 false
    });
  };

  // 최우선 토글이 켜진 채 차단 상태면 생성 불가
  const priorityBlocked = form.isPriority && hasPriorityTask;

  return (
    <div className="modal-overlay" onMouseDown={onClose} role="presentation">
      <div className="modal-panel task-create-modal" role="dialog" aria-modal="true" aria-labelledby="tc-title" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="tc-title" className="modal-title"><Plus size={18} aria-hidden="true" /> 새 작업 추가</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </header>

        {serverError && (
          <div className="tc-banner" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <div className="tc-banner__body">
              <strong>당신에게 남은 가용시간이 부족합니다</strong>
              <span className="tc-banner__detail">
                남은 가용시간: {humanDuration(serverError.remaining_seconds ?? 0)} / 요청 소요시간: {humanDuration(serverError.requested_seconds ?? durationSeconds)}
              </span>
            </div>
          </div>
        )}

        <form className="modal-body" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">작업 제목 <em className="field__req" aria-hidden="true">*</em></span>
            <input
              ref={titleRef}
              className={`field__input ${titleError ? 'field__input--error' : ''}`}
              type="text" maxLength={100} placeholder="무엇을 할까요?"
              value={form.title}
              onChange={(e) => { update({ title: e.target.value }); if (titleError) setTitleError(''); }}
            />
            {titleError && <span className="field__error" role="alert">{titleError}</span>}
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field__label">카테고리</span>
              <select className="field__input" value={form.category} onChange={(e) => update({ category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">마감일 {dday && <span className="tc-dday">{dday}</span>}</span>
              <input className="field__input" type="date" value={form.deadline} onChange={(e) => update({ deadline: e.target.value })} />
            </label>
          </div>

          <div className="field">
            <span className="field__label">소요시간 <em className="field__req" aria-hidden="true">*</em></span>
            <div className={`tc-duration ${durationError ? 'is-error' : ''}`}>
              <input
                className="tc-duration__num" type="number" min={0} max={23} aria-label="시간"
                value={form.hours}
                onChange={(e) => { update({ hours: Math.max(0, Math.min(23, Number(e.target.value) || 0)) }); if (durationError) setDurationError(''); }}
              />
              <span className="tc-duration__unit">시간</span>
              <input
                className="tc-duration__num" type="number" min={0} max={59} aria-label="분"
                value={form.minutes}
                onChange={(e) => { update({ minutes: Math.max(0, Math.min(59, Number(e.target.value) || 0)) }); if (durationError) setDurationError(''); }}
              />
              <span className="tc-duration__unit">분</span>
            </div>
            {durationError && <span className="field__error" role="alert">{durationError}</span>}
          </div>

          {/* 최우선 과제 설정 */}
          <div className="field">
            <div className="tc-priority-row">
              <span className="field__label">최우선 과제로 설정</span>
              <button
                type="button"
                className="toggle"
                role="switch"
                aria-checked={form.isPriority && !hasPriorityTask}
                aria-label="최우선 과제로 설정"
                disabled={hasPriorityTask}
                onClick={() => update({ isPriority: !form.isPriority })}
              />
            </div>
            <AnimatePresence initial={false}>
              {hasPriorityTask && <PriorityBlockedBanner existingTitle={priorityTaskTitle} />}
            </AnimatePresence>
          </div>

          <footer className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary" disabled={submitting || Boolean(serverError) || priorityBlocked}>
              {submitting ? '생성 중…' : '작업 생성'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
