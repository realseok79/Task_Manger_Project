/**
 * TimerStore (Zustand) — 전역 타이머 단일 진실 원천.
 * 설치: npm i zustand   (현재 미설치 → 산출물. Context 버전은 context/TimerContext.jsx)
 *
 * 모든 상태 전이는 lib/timerEngine 의 순수 함수에 위임. tick 은 1초 setInterval 이지만
 * 값은 항상 (now − lastTickAt) 실제 경과로 계산되어 throttling drift 에 강하다.
 */
import { create } from 'zustand';
import * as T from '../lib/timerEngine';
import { useAvailableTimeStore } from './availableTimeStore';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let intervalId = null;

export const useTimerStore = create((set, get) => ({
  activeTaskId: null,
  timers: {}, // taskId → TaskTimer

  startTimer: (taskId, estimatedDuration) => {
    set((s) => {
      const timers = { ...s.timers };
      // 동시 실행 금지: 기존 활성 타이머 자동 일시정지
      if (s.activeTaskId && s.activeTaskId !== taskId && timers[s.activeTaskId]) {
        timers[s.activeTaskId] = T.pause(timers[s.activeTaskId], now());
      }
      const base = timers[taskId] ?? T.createTimer(taskId, estimatedDuration);
      timers[taskId] = T.start(base, now());
      return { timers, activeTaskId: taskId };
    });
    get()._ensureInterval();
  },

  pauseTimer: (taskId) => {
    set((s) => ({ timers: { ...s.timers, [taskId]: T.pause(s.timers[taskId], now()) } }));
    get()._maybeStopInterval();
  },

  resumeTimer: (taskId) => {
    set((s) => {
      const timers = { ...s.timers };
      if (s.activeTaskId && s.activeTaskId !== taskId && timers[s.activeTaskId]) {
        timers[s.activeTaskId] = T.pause(timers[s.activeTaskId], now());
      }
      timers[taskId] = T.resume(timers[taskId], now());
      return { timers, activeTaskId: taskId };
    });
    get()._ensureInterval();
  },

  /** setInterval 1초마다 호출 — RUNNING/OVERTIME 타이머를 실제 경과로 감소(drift 보정). */
  tickTimer: () => {
    const n = now();
    set((s) => {
      let changed = false;
      const timers = { ...s.timers };
      for (const id of Object.keys(timers)) {
        const t = timers[id];
        if (t.status === T.STATUS.RUNNING || t.status === T.STATUS.OVERTIME) {
          timers[id] = T.tick(t, n);
          changed = true;
        }
      }
      return changed ? { timers } : s;
    });
  },

  /** visibilitychange 복귀 시 숨겨진 동안의 경과를 활성 타이머에 한 번에 반영. */
  applyHiddenGap: (hiddenSeconds) => {
    const n = now();
    set((s) => {
      const id = s.activeTaskId;
      if (!id || !s.timers[id]) return s;
      return { timers: { ...s.timers, [id]: T.applyHiddenGap(s.timers[id], hiddenSeconds, n) } };
    });
  },

  correctDrift: (taskId, actualElapsedSeconds) =>
    set((s) => ({ timers: { ...s.timers, [taskId]: T.correctDrift(s.timers[taskId], actualElapsedSeconds) } })),

  /** 완료: elapsed 정산 → (선택)서버 API → 조기완료 환급을 AvailableTimeStore 로 트리거. */
  completeTask: async (taskId, completeApi) => {
    const n = now();
    let refundSeconds = 0;
    let elapsedSeconds = 0;
    set((s) => {
      const done = T.complete(s.timers[taskId], n);
      refundSeconds = T.refundForCompletion(done);
      elapsedSeconds = done.elapsedSeconds;
      return {
        timers: { ...s.timers, [taskId]: done },
        activeTaskId: s.activeTaskId === taskId ? null : s.activeTaskId,
      };
    });
    if (completeApi) await completeApi(taskId, Math.round(elapsedSeconds)); // PATCH /api/tasks/:id/complete
    if (refundSeconds > 0) useAvailableTimeStore.getState().applyEarlyCompletion(refundSeconds); // 환급 트리거
    get()._maybeStopInterval();
    return { elapsedSeconds, refundSeconds };
  },

  _ensureInterval: () => {
    if (intervalId == null && typeof setInterval !== 'undefined') {
      intervalId = setInterval(() => get().tickTimer(), 1000);
    }
  },
  _maybeStopInterval: () => {
    const anyRunning = Object.values(get().timers).some(
      (t) => t.status === T.STATUS.RUNNING || t.status === T.STATUS.OVERTIME
    );
    if (!anyRunning && intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },
}));

/** 단일 타이머 구독 셀렉터(컴포넌트는 필요한 taskId 만 구독). */
export const selectTimer = (taskId) => (s) => s.timers[taskId];
