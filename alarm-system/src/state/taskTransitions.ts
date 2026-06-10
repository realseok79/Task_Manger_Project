/**
 * Task 상태 전이 머신 (순수). 허용/불허 전이 테이블 기반.
 *
 * 입력은 "표시 상태"(displayStatus) = 저장 timer_status + business status + deadline(overdue) 파생.
 *  - ACTIVE  ↔ timer_status RUNNING/OVERTIME
 *  - PAUSED  ↔ timer_status PAUSED
 *  - OVERDUE ↔ timer_status IDLE ∧ deadline 초과
 *  - IDLE    ↔ 그 외
 * 출력은 새 timer_status(+ FINISH 시 business status).
 */
export type DisplayStatus = 'IDLE' | 'ACTIVE' | 'PAUSED' | 'OVERDUE' | 'COMPLETED';
export type TimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'OVERTIME' | 'COMPLETED';
export type Action = 'START' | 'PAUSE' | 'RESUME' | 'FINISH';

export function deriveDisplayStatus(input: {
  businessStatus: string;       // PENDING/COMPLETED/ARCHIVED/SNOOZED
  timerStatus: TimerStatus | string;
  overdue: boolean;             // deadline < now ∧ 미완료
}): DisplayStatus {
  if (input.businessStatus === 'COMPLETED' || input.timerStatus === 'COMPLETED') return 'COMPLETED';
  if (input.timerStatus === 'RUNNING' || input.timerStatus === 'OVERTIME') return 'ACTIVE';
  if (input.timerStatus === 'PAUSED') return 'PAUSED';
  if (input.overdue) return 'OVERDUE';
  return 'IDLE';
}

interface Outcome { timerStatus: TimerStatus; businessStatus?: 'COMPLETED'; }

// 허용 전이 테이블: action → (현재 displayStatus → 결과)
const TABLE: Record<Action, Partial<Record<DisplayStatus, Outcome>>> = {
  START:  { IDLE: { timerStatus: 'RUNNING' } },
  PAUSE:  { ACTIVE: { timerStatus: 'PAUSED' } },
  RESUME: { PAUSED: { timerStatus: 'RUNNING' }, OVERDUE: { timerStatus: 'RUNNING' } },
  FINISH: {
    ACTIVE:  { timerStatus: 'COMPLETED', businessStatus: 'COMPLETED' },
    PAUSED:  { timerStatus: 'COMPLETED', businessStatus: 'COMPLETED' },
    OVERDUE: { timerStatus: 'COMPLETED', businessStatus: 'COMPLETED' },
  },
};

// 불허 전이의 사용자 메시지(대표 케이스 + 기본)
function messageFor(current: DisplayStatus, action: Action): string {
  if (current === 'COMPLETED') return '완료된 Task는 다시 시작할 수 없습니다.';
  if (action === 'PAUSE' && current === 'IDLE') return '시작하지 않은 Task는 일시정지할 수 없습니다.';
  if (action === 'START' && current !== 'IDLE') return '이미 시작된 Task는 다시 시작할 수 없습니다.';
  if (action === 'RESUME') return '이어서 시작할 수 있는 상태가 아닙니다.';
  return '허용되지 않는 상태 전이입니다.';
}

export interface TransitionResult {
  valid: boolean;
  timerStatus?: TimerStatus;
  businessStatus?: 'COMPLETED';
  message?: string;
}

/** 순수 전이 판정. 서비스가 !valid 일 때 400 INVALID_TRANSITION 을 던진다. */
export function transition(current: DisplayStatus, action: Action): TransitionResult {
  const outcome = TABLE[action]?.[current];
  if (!outcome) return { valid: false, message: messageFor(current, action) };
  return { valid: true, timerStatus: outcome.timerStatus, businessStatus: outcome.businessStatus };
}
