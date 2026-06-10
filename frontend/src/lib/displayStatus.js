/**
 * displayStatus — 버튼 렌더용 "표시 상태" 파생(단일 진실 원천).
 *
 * 스펙의 IDLE/ACTIVE/PAUSED/OVERDUE/COMPLETED 는 단일 enum 이 아니라
 * ① business status(PENDING/COMPLETED/ARCHIVED) ② run status(useTaskRuntime: IDLE/RUNNING/PAUSED + OVERTIME)
 * ③ deadline(D+N=기한초과) 의 파생이다. 이 함수가 그 셋을 하나로 합쳐 카드 버튼을 결정한다.
 */
export const DISPLAY_STATUS = {
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  OVERDUE: 'OVERDUE',
  COMPLETED: 'COMPLETED',
};

/** D-day 라벨이 'D+N'(기한 지남)인지. */
export function isOverdue(dday) {
  return typeof dday === 'string' && dday.startsWith('D+');
}

/**
 * @param view  toViewModel 결과({ status, dday })
 * @param runStatus  useTaskRuntime 의 상태('IDLE'|'RUNNING'|'PAUSED'|'OVERTIME'|'COMPLETED')
 */
export function deriveDisplayStatus(view, runStatus) {
  if (view?.status === 'COMPLETED') return DISPLAY_STATUS.COMPLETED;
  if (runStatus === 'RUNNING' || runStatus === 'OVERTIME') return DISPLAY_STATUS.ACTIVE;
  if (runStatus === 'PAUSED') return DISPLAY_STATUS.PAUSED;
  if (isOverdue(view?.dday)) return DISPLAY_STATUS.OVERDUE;
  return DISPLAY_STATUS.IDLE;
}

/** 표시 상태 → 노출할 버튼 키 배열. (TaskActionButtons 가 이 매핑을 따른다) */
export function taskActionButtonSet(status) {
  switch (status) {
    case DISPLAY_STATUS.COMPLETED: return [];
    case DISPLAY_STATUS.ACTIVE: return ['pause', 'finish'];
    case DISPLAY_STATUS.PAUSED:
    case DISPLAY_STATUS.OVERDUE: return ['resume', 'finish'];
    case DISPLAY_STATUS.IDLE:
    default: return ['start'];
  }
}
