import { motion } from 'framer-motion';
import { ClipboardList, Plus } from 'lucide-react';
import './EmptyState.css';

/**
 * EmptyState — tasks 가 0개일 때 중앙 CTA. (로딩 중에는 렌더하지 않는다 — 부모가 가드)
 * 진입: translateY(8px)+opacity 0 → 0/1, 300ms ease-out. 퇴장: opacity→0, 200ms (부모 <AnimatePresence>).
 *
 * 아이콘: 스펙의 Tabler ti-clipboard 대신 이 프로젝트가 쓰는 lucide ClipboardList.
 * CTA: 스펙의 하드코딩 파란색(#1a4b8c) 대신 테마 토큰 기반 btn-primary 를 유지(다크모드 정합성).
 *
 * props: { onAddTask }
 */
export default function EmptyState({ onAddTask }) {
  return (
    <motion.div
      className="empty-state-full"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="empty-state-full__art" aria-hidden="true">
        <ClipboardList size={40} strokeWidth={1.5} />
      </div>
      <p className="empty-state-full__title">오늘의 작업이 없습니다</p>
      <p className="empty-state-full__subtitle">새 작업을 추가해서 오늘을 시작해보세요</p>
      <button type="button" className="btn-primary empty-state-full__cta" onClick={onAddTask}>
        새 작업 추가하기 <Plus size={16} aria-hidden="true" />
      </button>
    </motion.div>
  );
}
