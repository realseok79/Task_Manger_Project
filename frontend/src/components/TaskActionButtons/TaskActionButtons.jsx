import { Play, Pause, Check } from 'lucide-react';
import { taskActionButtonSet } from '../../lib/displayStatus';
import './TaskActionButtons.css';

/**
 * TaskActionButtons — 표시 상태(displayStatus)에 따라 제어 버튼 세트를 렌더(버그 수정 버전).
 *  COMPLETED → null · ACTIVE → [중지][끝내기] · PAUSED/OVERDUE → [이어서 시작하기][끝내기] · IDLE → [시작하기]
 *
 * props: { status, onStart, onPause, onResume, onFinish }
 */
export default function TaskActionButtons({ status, onStart, onPause, onResume, onFinish }) {
  const set = taskActionButtonSet(status);
  if (set.length === 0) return null; // COMPLETED

  const overdue = status === 'OVERDUE';
  const stop = (fn) => (e) => { e.stopPropagation(); fn?.(); };

  return (
    <div className={`task-actions${overdue ? ' task-actions--overdue' : ''}`} role="group" aria-label="작업 제어">
      {set.includes('start') && (
        <button type="button" className="ta-btn ta-btn--start" onClick={stop(onStart)}>
          <Play size={14} aria-hidden="true" /> 시작하기
        </button>
      )}
      {set.includes('resume') && (
        <button type="button" className="ta-btn ta-btn--resume" onClick={stop(onResume)}>
          {/* OVERDUE 는 ▶ prefix(별도 엘리먼트 — 라벨 텍스트 노드는 그대로 유지) */}
          {overdue
            ? <span className="ta-btn__prefix" aria-hidden="true">▶</span>
            : <Play size={14} aria-hidden="true" />}{' '}
          이어서 시작하기
        </button>
      )}
      {set.includes('pause') && (
        <button type="button" className="ta-btn ta-btn--pause" onClick={stop(onPause)}>
          <Pause size={14} aria-hidden="true" /> 중지
        </button>
      )}
      {set.includes('finish') && (
        <button type="button" className="ta-btn ta-btn--finish" onClick={stop(onFinish)}>
          <Check size={14} aria-hidden="true" /> 끝내기
        </button>
      )}
    </div>
  );
}
