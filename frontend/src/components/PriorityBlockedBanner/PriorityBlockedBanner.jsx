import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import './PriorityBlockedBanner.css';

/**
 * PriorityBlockedBanner — 최우선 과제 단일성 차단 배너(coral chip).
 * 진입: height 0 → auto + opacity 0 → 1, 200ms ease-out(부모 <AnimatePresence> 가 퇴장 담당).
 * overflow:hidden 외곽 + padding 은 __inner 가 가져 height 애니메이션이 패딩에 깨지지 않는다.
 *
 * props: { existingTitle?: string }  — 있으면 스펙 문구, 없으면 일반 문구(토글 차단용).
 *
 * 아이콘: 스펙의 Tabler ti-alert-triangle 대신 이 프로젝트가 쓰는 lucide AlertTriangle.
 */
export default function PriorityBlockedBanner({ existingTitle }) {
  const detail = existingTitle
    ? `'${existingTitle}'을(를) 먼저 완료하거나 해제해주세요.`
    : '기존 최우선 과제를 완료하거나 해제한 후 설정할 수 있습니다.';

  return (
    <motion.div
      className="priority-blocked-banner"
      role="alert"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="priority-blocked-banner__inner">
        <AlertTriangle size={16} aria-hidden="true" className="priority-blocked-banner__icon" />
        <div className="priority-blocked-banner__body">
          <strong className="priority-blocked-banner__title">최우선 과제가 이미 존재합니다!!</strong>
          <span className="priority-blocked-banner__detail">{detail}</span>
        </div>
      </div>
    </motion.div>
  );
}
