import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Pencil, Check, X } from 'lucide-react';
import './AvailableTimeDisplay.css';

const hm = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return { h: Math.floor(s / 3600), m: Math.round((s % 3600) / 60) };
};
const label = (sec) => { const { h, m } = hm(sec); return `${h}시간 ${m}분`; };

/**
 * AvailableTimeDisplay — 하단 현재 상태 패널의 가용시간 게이지/편집.
 *  - 잔여 게이지 바(잔여율 < 20% 빨강), 가용시간 인라인 편집 → onUpdateAvailable(seconds)
 *  - lastRefund(조기완료 환급) 변경 시 "+XX분 환급됨" 토스트 애니메이션
 */
export default function AvailableTimeDisplay({ snapshot, isLoading = false, onUpdateAvailable, lastRefund }) {
  const total = snapshot?.total_available ?? 0;
  const remaining = snapshot?.remaining ?? 0;
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const low = ratio < 0.2;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ h: 0, m: 0 });
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  // 환급 토스트
  useEffect(() => {
    if (lastRefund && lastRefund.seconds > 0) {
      const { h, m } = hm(lastRefund.seconds);
      setToast(`+${h > 0 ? `${h}시간 ` : ''}${m}분 환급됨`);
      const t = setTimeout(() => setToast(null), 2400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [lastRefund]);

  const startEdit = () => { setDraft(hm(total)); setError(''); setEditing(true); };
  const save = async () => {
    const seconds = (Number(draft.h) || 0) * 3600 + (Number(draft.m) || 0) * 60;
    try {
      await onUpdateAvailable(seconds);
      setEditing(false);
    } catch (e) {
      setError(e.code === 'AVAILABLE_BELOW_ALLOCATED' ? '이미 할당된 작업 시간보다 작게 설정할 수 없어요.' : (e.message || '설정 실패'));
    }
  };

  return (
    <div className="avail">
      <div className="avail__head">
        <span className="avail__label"><Clock size={15} aria-hidden="true" /> 오늘 가용시간</span>
        {!editing ? (
          <button type="button" className="avail__edit" onClick={startEdit} disabled={isLoading} aria-label="가용시간 편집">
            <span className="avail__total mono">{label(total)}</span> <Pencil size={13} aria-hidden="true" />
          </button>
        ) : (
          <span className="avail__editor">
            <input className="avail__num" type="number" min={0} max={23} aria-label="시간"
              value={draft.h} onChange={(e) => setDraft((d) => ({ ...d, h: e.target.value }))} />시
            <input className="avail__num" type="number" min={0} max={59} aria-label="분"
              value={draft.m} onChange={(e) => setDraft((d) => ({ ...d, m: e.target.value }))} />분
            <button type="button" className="avail__icon" onClick={save} aria-label="저장"><Check size={15} /></button>
            <button type="button" className="avail__icon" onClick={() => setEditing(false)} aria-label="취소"><X size={15} /></button>
          </span>
        )}
      </div>

      <div className="avail__gauge" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`avail__fill ${low ? 'is-low' : ''}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="avail__meta mono">
        잔여 {label(remaining)} · 할당 {label(snapshot?.allocated ?? 0)}
      </div>
      {error && <div className="avail__error" role="alert">{error}</div>}

      <AnimatePresence>
        {toast && (
          <motion.div className="avail__toast" role="status"
            initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
