/**
 * 가용시간 로직 — 프레임워크 무관 순수 함수(단일 진실 원천).
 *
 * remaining = totalAvailable − allocated + refunded
 *   - allocated: 생성된 작업의 estimatedDuration 누계(삭제/취소 시에만 감소, 완료로는 감소 안 함)
 *   - refunded : 조기완료 환급 누계
 *   → 완료 시 allocated 는 그대로 두고 (est−elapsed) 만 refunded 로 돌려주므로 순소비 = elapsed (정확).
 *
 * recalculate 는 아래 5가지 이벤트에서만 발생(컴포넌트는 파생값만 구독, 직접 계산 금지).
 */

export const initialAvailability = (totalAvailable = 0) => ({ totalAvailable, allocated: 0, refunded: 0 });

// ── 5가지 이벤트 reducer ──────────────────────────────────────
export const onSetAvailable = (s, totalAvailable) => ({ ...s, totalAvailable: Math.max(0, totalAvailable) }); // ① 직접 변경
export const onCreateTask = (s, est) => ({ ...s, allocated: s.allocated + Math.max(0, est) });                // ② 생성 성공
export const onDeleteTask = (s, est) => ({ ...s, allocated: Math.max(0, s.allocated - Math.max(0, est)) });   // ③ 삭제/취소
export const onEarlyCompletion = (s, refundSeconds) => ({ ...s, refunded: s.refunded + Math.max(0, refundSeconds) }); // ④ 조기완료
export const onMidnightReset = (totalAvailable = 0) => initialAvailability(totalAvailable);                    // ⑤ 자정 초기화

// ── 파생값 ────────────────────────────────────────────────────
export const computeRemaining = ({ totalAvailable, allocated, refunded }) => totalAvailable - allocated + refunded;

export const isInsufficient = (remaining, duration) => duration > remaining;

/** 'OK' | 'WARNING'(20% 미만) | 'CRITICAL'(0 이하) */
export function insufficiencyLevel(remaining, totalAvailable) {
  if (remaining <= 0) return 'CRITICAL';
  if (totalAvailable > 0 && remaining < totalAvailable * 0.2) return 'WARNING';
  return 'OK';
}

/** 코어 상태 → 컴포넌트가 구독할 파생 스냅샷. */
export function deriveAvailability(state) {
  const remaining = computeRemaining(state);
  return {
    ...state,
    remaining,
    insufficiencyLevel: insufficiencyLevel(remaining, state.totalAvailable),
    isInsufficient: (duration) => isInsufficient(remaining, duration),
  };
}
