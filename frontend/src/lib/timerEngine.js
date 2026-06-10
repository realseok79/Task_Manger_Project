/**
 * 타이머 엔진 — 프레임워크 무관 순수 함수(단일 진실 원천).
 * Zustand/Context 스토어는 이 함수들의 얇은 바인딩일 뿐이다. 모든 함수는 `now`(ms)를 주입받아 결정론적.
 *
 * TaskTimer = {
 *   taskId, estimatedDuration(초), remainingSeconds, elapsedSeconds,
 *   status: IDLE|RUNNING|PAUSED|OVERTIME|COMPLETED,
 *   startedAt(ms|null), pausedAt(ms|null), lastTickAt(ms)
 * }
 */

export const STATUS = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  OVERTIME: 'OVERTIME',
  COMPLETED: 'COMPLETED',
};

const isTicking = (t) => t.status === STATUS.RUNNING || t.status === STATUS.OVERTIME;

export function createTimer(taskId, estimatedDuration) {
  return {
    taskId,
    estimatedDuration,
    remainingSeconds: estimatedDuration,
    elapsedSeconds: 0,
    status: STATUS.IDLE,
    startedAt: null,
    pausedAt: null,
    lastTickAt: 0,
  };
}

/** IDLE/PAUSED → RUNNING. lastTickAt 을 now 로 리셋(이후 tick 의 기준점). */
export function start(timer, now) {
  if (timer.status === STATUS.COMPLETED) return timer;
  return { ...timer, status: STATUS.RUNNING, startedAt: timer.startedAt ?? now, pausedAt: null, lastTickAt: now };
}

/**
 * drift 보정 tick — setInterval 이 throttle 되어도 정확.
 * 이상적 1초가 아니라 (now − lastTickAt) "실제 경과"를 차감한다.
 */
export function tick(timer, now) {
  if (!isTicking(timer)) return timer;
  const actualElapsed = Math.max(0, (now - timer.lastTickAt) / 1000);
  const remainingSeconds = timer.remainingSeconds - actualElapsed;
  const elapsedSeconds = timer.elapsedSeconds + actualElapsed;
  const status = remainingSeconds <= 0 ? STATUS.OVERTIME : STATUS.RUNNING;
  return { ...timer, remainingSeconds, elapsedSeconds, lastTickAt: now, status };
}

/** RUNNING/OVERTIME → PAUSED. 멈추기 전 현재까지 정산(tick) 후 pausedAt 기록. */
export function pause(timer, now) {
  if (!isTicking(timer)) return timer;
  const settled = tick(timer, now);
  return { ...settled, status: STATUS.PAUSED, pausedAt: now };
}

/** PAUSED → RUNNING. lastTickAt 을 now 로 재설정(일시정지 구간은 경과에서 제외). */
export function resume(timer, now) {
  if (timer.status !== STATUS.PAUSED) return timer;
  return { ...timer, status: STATUS.RUNNING, pausedAt: null, lastTickAt: now };
}

/**
 * visibilitychange catch-up — 백그라운드로 가려져 있던 hiddenSeconds 만큼 남은 시간에서 차감.
 * (tick 이 멈춘 사이의 공백을 한 번에 메운다. lastTickAt 도 now 로 맞춘다.)
 */
export function applyHiddenGap(timer, hiddenSeconds, now) {
  if (!isTicking(timer)) return timer;
  const gap = Math.max(0, hiddenSeconds);
  const remainingSeconds = timer.remainingSeconds - gap;
  const elapsedSeconds = timer.elapsedSeconds + gap;
  const status = remainingSeconds <= 0 ? STATUS.OVERTIME : timer.status;
  return { ...timer, remainingSeconds, elapsedSeconds, lastTickAt: now ?? timer.lastTickAt, status };
}

/**
 * 외부 진실(performance.now 기반 실제 경과)으로 강제 재정합.
 * tick 누적 오차가 의심될 때 actualElapsed 로 remaining/elapsed 를 다시 계산한다.
 */
export function correctDrift(timer, actualElapsedSeconds) {
  const elapsedSeconds = Math.max(0, actualElapsedSeconds);
  const remainingSeconds = timer.estimatedDuration - elapsedSeconds;
  const status = remainingSeconds <= 0 && isTicking(timer) ? STATUS.OVERTIME : timer.status;
  return { ...timer, elapsedSeconds, remainingSeconds, status };
}

/** 완료 처리(현재까지 정산 후 COMPLETED). 환급 계산은 refundForCompletion. */
export function complete(timer, now) {
  const settled = isTicking(timer) ? tick(timer, now) : timer;
  return { ...settled, status: STATUS.COMPLETED, pausedAt: null };
}

/** 조기완료 환급(초) = estimated − elapsed (>0 일 때만). */
export function refundForCompletion(timer) {
  return Math.max(0, Math.round(timer.estimatedDuration - timer.elapsedSeconds));
}
