/**
 * AvailableTimeContext — Zustand 버전(stores/availableTimeStore.js)과 동일 로직의 Context API 구현.
 * 5가지 이벤트로만 recalculate. 컴포넌트는 파생값(remaining/insufficiencyLevel/isInsufficient)만 구독.
 */
import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import * as A from '../lib/availability';

function reducer(state, a) {
  switch (a.type) {
    case 'SET': return A.onSetAvailable(state, a.seconds);          // ①
    case 'CREATE': return A.onCreateTask(state, a.est);             // ②
    case 'DELETE': return A.onDeleteTask(state, a.est);             // ③
    case 'REFUND': return A.onEarlyCompletion(state, a.refund);     // ④
    case 'RESET': return A.onMidnightReset(a.total);               // ⑤
    default: return state;
  }
}

const Ctx = createContext(null);

export function AvailableTimeProvider({ children, initialTotal = 0 }) {
  const [state, dispatch] = useReducer(reducer, A.initialAvailability(initialTotal));

  const setAvailable = useCallback((seconds) => dispatch({ type: 'SET', seconds }), []);
  const createTask = useCallback((est) => dispatch({ type: 'CREATE', est }), []);
  const deleteTask = useCallback((est) => dispatch({ type: 'DELETE', est }), []);
  const applyEarlyCompletion = useCallback((refund) => dispatch({ type: 'REFUND', refund }), []);
  const midnightReset = useCallback((total = 0) => dispatch({ type: 'RESET', total }), []);

  // 파생 스냅샷(단일 진실 원천) — 컴포넌트는 직접 계산하지 않는다.
  const derived = useMemo(() => A.deriveAvailability(state), [state]);

  const value = useMemo(
    () => ({ ...derived, setAvailable, createTask, deleteTask, applyEarlyCompletion, midnightReset }),
    [derived, setAvailable, createTask, deleteTask, applyEarlyCompletion, midnightReset]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAvailability() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAvailability must be used within <AvailableTimeProvider>');
  return c;
}
