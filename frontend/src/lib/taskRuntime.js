/**
 * Client-side task run state machine (focus timer).
 *
 * 백엔드 상태(PENDING/COMPLETED/SNOOZED/ARCHIVED)와 별개로, "지금 이 작업을 진행 중인가"를
 * 표현하는 클라이언트 전용 상태다. COMPLETED 전이만 백엔드 complete 와 연동한다.
 *
 * 전이 규칙:
 *   IDLE    → RUNNING            ([시작])
 *   RUNNING → PAUSED             ([중지])
 *   RUNNING → COMPLETED          ([끝내기])
 *   PAUSED  → RUNNING            ([재시작])
 *   PAUSED  → COMPLETED          ([끝내기])
 *   COMPLETED → (전이 불가)
 *   IDLE → COMPLETED 직접 전이 불가 (반드시 RUNNING 경유)
 *
 * 모든 transition 함수는 순수 함수다(같은 entry를 받아 새 entry를 반환). 허용되지 않는
 * 전이는 입력 entry를 그대로 반환(no-op)하여 호출부가 안전하게 쓸 수 있다.
 */

export const RUN_STATUS = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
};

const ALLOWED = {
  [RUN_STATUS.IDLE]: [RUN_STATUS.RUNNING],
  [RUN_STATUS.RUNNING]: [RUN_STATUS.PAUSED, RUN_STATUS.COMPLETED],
  [RUN_STATUS.PAUSED]: [RUN_STATUS.RUNNING, RUN_STATUS.COMPLETED],
  [RUN_STATUS.COMPLETED]: [],
};

export function canTransition(from, to) {
  return (ALLOWED[from] ?? []).includes(to);
}

export function emptyEntry() {
  return { status: RUN_STATUS.IDLE, elapsedSeconds: 0, runStartMs: null, startedAt: null, completedAt: null };
}

/** 현재 표시할 경과 초. RUNNING이면 진행 중인 구간을 더해 계산한다. */
export function displaySeconds(entry, nowMs = Date.now()) {
  if (!entry) return 0;
  if (entry.status === RUN_STATUS.RUNNING && entry.runStartMs) {
    return entry.elapsedSeconds + Math.max(0, Math.floor((nowMs - entry.runStartMs) / 1000));
  }
  return entry.elapsedSeconds;
}

/** RUNNING 구간을 elapsedSeconds 로 접어 넣는다(누적). */
function foldRunning(entry, nowMs) {
  if (entry.status !== RUN_STATUS.RUNNING || !entry.runStartMs) return entry.elapsedSeconds;
  return entry.elapsedSeconds + Math.max(0, Math.floor((nowMs - entry.runStartMs) / 1000));
}

export function startEntry(entry, nowMs = Date.now()) {
  const e = entry ?? emptyEntry();
  if (!canTransition(e.status, RUN_STATUS.RUNNING)) return e; // IDLE 에서만
  return { ...e, status: RUN_STATUS.RUNNING, runStartMs: nowMs, startedAt: new Date(nowMs).toISOString() };
}

export function resumeEntry(entry, nowMs = Date.now()) {
  const e = entry ?? emptyEntry();
  if (!canTransition(e.status, RUN_STATUS.RUNNING)) return e; // PAUSED 에서만
  return { ...e, status: RUN_STATUS.RUNNING, runStartMs: nowMs };
}

export function pauseEntry(entry, nowMs = Date.now()) {
  const e = entry ?? emptyEntry();
  if (!canTransition(e.status, RUN_STATUS.PAUSED)) return e; // RUNNING 에서만
  return { ...e, status: RUN_STATUS.PAUSED, elapsedSeconds: foldRunning(e, nowMs), runStartMs: null };
}

export function finishEntry(entry, nowMs = Date.now()) {
  const e = entry ?? emptyEntry();
  if (!canTransition(e.status, RUN_STATUS.COMPLETED)) return e; // RUNNING/PAUSED 에서만
  return {
    ...e,
    status: RUN_STATUS.COMPLETED,
    elapsedSeconds: foldRunning(e, nowMs),
    runStartMs: null,
    completedAt: new Date(nowMs).toISOString(),
  };
}
