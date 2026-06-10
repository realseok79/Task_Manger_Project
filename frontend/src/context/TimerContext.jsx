/**
 * TimerContext — Zustand 버전(stores/timerStore.js)과 동일 로직의 Context API 구현.
 * 상태 전이는 모두 lib/timerEngine 순수 함수에 위임(단일 진실 원천).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import * as T from '../lib/timerEngine';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const initial = { activeTaskId: null, timers: {} };

function reducer(state, a) {
  switch (a.type) {
    case 'START': {
      const timers = { ...state.timers };
      if (state.activeTaskId && state.activeTaskId !== a.taskId && timers[state.activeTaskId]) {
        timers[state.activeTaskId] = T.pause(timers[state.activeTaskId], a.now);
      }
      const base = timers[a.taskId] ?? T.createTimer(a.taskId, a.estimatedDuration);
      timers[a.taskId] = T.start(base, a.now);
      return { timers, activeTaskId: a.taskId };
    }
    case 'PAUSE':
      return { ...state, timers: { ...state.timers, [a.taskId]: T.pause(state.timers[a.taskId], a.now) } };
    case 'RESUME': {
      const timers = { ...state.timers };
      if (state.activeTaskId && state.activeTaskId !== a.taskId && timers[state.activeTaskId]) {
        timers[state.activeTaskId] = T.pause(timers[state.activeTaskId], a.now);
      }
      timers[a.taskId] = T.resume(timers[a.taskId], a.now);
      return { timers, activeTaskId: a.taskId };
    }
    case 'TICK': {
      let changed = false;
      const timers = { ...state.timers };
      for (const id of Object.keys(timers)) {
        const t = timers[id];
        if (t.status === T.STATUS.RUNNING || t.status === T.STATUS.OVERTIME) {
          timers[id] = T.tick(t, a.now);
          changed = true;
        }
      }
      return changed ? { ...state, timers } : state;
    }
    case 'HIDDEN_GAP': {
      const id = state.activeTaskId;
      if (!id || !state.timers[id]) return state;
      return { ...state, timers: { ...state.timers, [id]: T.applyHiddenGap(state.timers[id], a.hiddenSeconds, a.now) } };
    }
    case 'CORRECT':
      return { ...state, timers: { ...state.timers, [a.taskId]: T.correctDrift(state.timers[a.taskId], a.actualElapsed) } };
    case 'COMPLETE':
      return {
        ...state,
        timers: { ...state.timers, [a.taskId]: a.done },
        activeTaskId: state.activeTaskId === a.taskId ? null : state.activeTaskId,
      };
    default:
      return state;
  }
}

const TimerCtx = createContext(null);

export function TimerProvider({ children, onEarlyCompletion }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const hiddenAt = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 1초 tick (값은 항상 실제 경과로 계산되므로 throttle 에도 drift 없음)
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'TICK', now: now() }), 1000);
    return () => clearInterval(id);
  }, []);

  // visibilitychange catch-up
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else if (document.visibilityState === 'visible' && hiddenAt.current != null) {
        const hiddenSeconds = (Date.now() - hiddenAt.current) / 1000;
        hiddenAt.current = null;
        dispatch({ type: 'HIDDEN_GAP', hiddenSeconds, now: now() });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const startTimer = useCallback((taskId, estimatedDuration) => dispatch({ type: 'START', taskId, estimatedDuration, now: now() }), []);
  const pauseTimer = useCallback((taskId) => dispatch({ type: 'PAUSE', taskId, now: now() }), []);
  const resumeTimer = useCallback((taskId) => dispatch({ type: 'RESUME', taskId, now: now() }), []);
  const correctDrift = useCallback((taskId, actualElapsed) => dispatch({ type: 'CORRECT', taskId, actualElapsed }), []);

  const completeTask = useCallback(
    async (taskId, completeApi) => {
      const done = T.complete(stateRef.current.timers[taskId], now());
      const refundSeconds = T.refundForCompletion(done);
      dispatch({ type: 'COMPLETE', taskId, done });
      if (completeApi) await completeApi(taskId, Math.round(done.elapsedSeconds));
      if (refundSeconds > 0) onEarlyCompletion?.(refundSeconds); // 가용시간 환급 트리거
      return { elapsedSeconds: done.elapsedSeconds, refundSeconds };
    },
    [onEarlyCompletion]
  );

  const value = useMemo(
    () => ({ activeTaskId: state.activeTaskId, timers: state.timers, startTimer, pauseTimer, resumeTimer, correctDrift, completeTask }),
    [state, startTimer, pauseTimer, resumeTimer, correctDrift, completeTask]
  );
  return <TimerCtx.Provider value={value}>{children}</TimerCtx.Provider>;
}

export function useTimers() {
  const c = useContext(TimerCtx);
  if (!c) throw new Error('useTimers must be used within <TimerProvider>');
  return c;
}
/** 특정 taskId 의 TaskTimer 만 구독. */
export function useTimer(taskId) {
  return useTimers().timers[taskId];
}
