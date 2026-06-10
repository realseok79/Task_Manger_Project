/**
 * taskStoreCore — TaskStore 의 순수 로직 단일 진실 원천(프레임워크 비의존, node 검증 가능).
 *
 * 스펙 vs 현실(중요):
 *  - 스펙의 Task.status('IDLE'|'ACTIVE'|'PAUSED'|'OVERDUE'|'COMPLETED')는 이 앱에서
 *    단일 저장 enum 이 아니라 ① business status(PENDING/COMPLETED) ② 타이머 run 상태
 *    ③ deadline(D+N) 의 파생이다(lib/displayStatus.deriveDisplayStatus 참고).
 *  - 이 스토어는 그 "표시 상태"를 명시적 오버레이로 소유해 버튼 노출을 즉시 제어한다(낙관적 업데이트).
 *    run 상태(카운트다운)는 여전히 TimerContext 가, 환급은 AvailableTime 이 담당한다.
 *  - 전이 규칙은 백엔드 상태머신(alarm-system/src/state/taskTransitions.ts)과 1:1로 맞춘다.
 */

export const STATUS = Object.freeze({
  IDLE: 'IDLE', ACTIVE: 'ACTIVE', PAUSED: 'PAUSED', OVERDUE: 'OVERDUE', COMPLETED: 'COMPLETED',
});
export const ACTION = Object.freeze({ START: 'START', PAUSE: 'PAUSE', RESUME: 'RESUME', FINISH: 'FINISH' });
export const CREATE_RESULT = Object.freeze({
  SUCCESS: 'SUCCESS', PRIORITY_EXISTS: 'PRIORITY_EXISTS', INSUFFICIENT_TIME: 'INSUFFICIENT_TIME',
});

// 허용 전이(백엔드 TABLE 미러) + action → 낙관적 결과 상태
const ALLOWED = {
  START: [STATUS.IDLE],
  PAUSE: [STATUS.ACTIVE],
  RESUME: [STATUS.PAUSED, STATUS.OVERDUE],
  FINISH: [STATUS.ACTIVE, STATUS.PAUSED, STATUS.OVERDUE],
};
const ACTION_RESULT = {
  START: STATUS.ACTIVE, PAUSE: STATUS.PAUSED, RESUME: STATUS.ACTIVE, FINISH: STATUS.COMPLETED,
};

export function canTransition(current, action) {
  return (ALLOWED[action] || []).includes(current);
}
/** 낙관적 업데이트가 적용할 다음 표시 상태(불허면 null). */
export function optimisticStatusFor(current, action) {
  return canTransition(current, action) ? ACTION_RESULT[action] : null;
}

function overdueDaysFromDday(dday) {
  return typeof dday === 'string' && dday.startsWith('D+') ? Number(dday.slice(2)) || 0 : 0;
}

/** 표시 상태 정규화: 이미 표시 enum 이면 그대로, business status 면 파생. */
export function normalizeStatus(raw) {
  const s = raw?.status;
  if (s && STATUS[s]) return s;                                  // 이미 IDLE/ACTIVE/...
  if (s === 'COMPLETED') return STATUS.COMPLETED;
  if (typeof raw?.dday === 'string' && raw.dday.startsWith('D+')) return STATUS.OVERDUE;
  return STATUS.IDLE;                                            // PENDING/SNOOZED/그 외 → IDLE
}

/** 서버 TaskResponse / toViewModel 결과 / 스토어 Task 어느 형태든 스토어 Task 로 정규화. */
export function normalizeTask(raw) {
  return {
    id: String(raw.id ?? raw.taskId),
    title: raw.title ?? '',
    category: raw.category ?? raw.tags?.[0]?.label ?? '',
    status: normalizeStatus(raw),
    is_priority: Boolean(raw.is_priority ?? raw.isPriority),
    estimated_duration:
      raw.estimated_duration ?? (raw.estimatedMinutes != null ? raw.estimatedMinutes * 60 : 0),
    elapsed_time: raw.elapsed_time ?? 0,
    due_date: raw.due_date ?? raw.deadline ?? null,
    overdue_days: raw.overdue_days ?? overdueDaysFromDday(raw.dday),
    created_at: raw.created_at ?? raw.createdAt ?? null,
  };
}
export function normalizeList(list) {
  return Array.isArray(list) ? list.map(normalizeTask) : [];
}

// ── 파생값(셀렉터가 소비) ─────────────────────────────────────────────
/** 로딩 중에는 false 로 강제해 Empty State 깜빡임 방지(스펙 ③). */
export function deriveIsEmpty(tasks, isLoading) {
  return !isLoading && tasks.length === 0;
}
export function deriveHasPriorityTask(tasks) {
  return tasks.some((t) => t.is_priority && t.status !== STATUS.COMPLETED);
}
export function derivePriorityTask(tasks) {
  return tasks.find((t) => t.is_priority && t.status !== STATUS.COMPLETED) ?? null;
}

// ── 순수 mutator(새 배열 반환) ────────────────────────────────────────
export function getStatus(tasks, taskId) {
  const t = tasks.find((x) => x.id === String(taskId));
  return t ? t.status : null;
}
export function applyOptimisticStatus(tasks, taskId, newStatus) {
  return tasks.map((t) => (t.id === String(taskId) ? { ...t, status: newStatus } : t));
}
export function applyRollbackStatus(tasks, taskId, previousStatus) {
  return applyOptimisticStatus(tasks, taskId, previousStatus);
}
export function upsertTask(tasks, task) {
  const id = task.id;
  return tasks.some((t) => t.id === id) ? tasks.map((t) => (t.id === id ? task : t)) : [task, ...tasks];
}
export function removeTask(tasks, taskId) {
  return tasks.filter((t) => t.id !== String(taskId));
}

/** createTask 실패를 결과 코드로 분류(매핑 안되면 null → 호출부가 재throw). */
export function classifyCreateError(err) {
  const code = err?.code || err?.response?.data?.error || err?.response?.data?.code;
  const status = err?.status ?? err?.response?.status;
  if (code === 'PRIORITY_TASK_EXISTS' || code === 'PRIORITY_EXISTS' || status === 409) {
    return CREATE_RESULT.PRIORITY_EXISTS;
  }
  if (code === 'INSUFFICIENT_AVAILABLE_TIME' || code === 'INSUFFICIENT_TIME' || code === 'AVAILABLE_BELOW_ALLOCATED') {
    return CREATE_RESULT.INSUFFICIENT_TIME;
  }
  return null;
}
