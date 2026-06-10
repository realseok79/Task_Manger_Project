/**
 * TaskContext — TaskStore(stores/taskStore.js)와 동일 로직의 Context API 구현(실제 동작판).
 * 모든 상태 로직은 lib/taskStoreCore 순수 함수에 위임(단일 진실 원천). 낙관적 업데이트로
 * 버튼 클릭이 즉시 반영되고, 실패 시 rollback + onError(toast). 로컬 변경은 subscribeChange
 * 구독자(useTaskSync)에게 통지되어 BroadcastChannel 로 다른 탭에 전파된다(스펙 ②·④).
 */
import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';
import * as C from '../lib/taskStoreCore';
import {
  getAllPending,
  createTask as apiCreate,
  updateTaskStatus as apiUpdateStatus,
} from '../api/tasks';
import { DEFAULT_USER_ID } from '../api/client';

const initial = { tasks: [], isLoading: true, error: null };

function reducer(state, a) {
  switch (a.type) {
    case 'LOADING': return { ...state, isLoading: true, error: null };
    case 'SET_TASKS': return { ...state, tasks: C.normalizeList(a.raw), isLoading: false };
    case 'ERROR': return { ...state, isLoading: false, error: a.error };
    case 'UPSERT': return { ...state, tasks: C.upsertTask(state.tasks, a.task) };
    case 'OPTIMISTIC': return { ...state, tasks: C.applyOptimisticStatus(state.tasks, a.taskId, a.status) };
    case 'ROLLBACK': return { ...state, tasks: C.applyRollbackStatus(state.tasks, a.taskId, a.previousStatus) };
    case 'CLEAR_ERROR': return { ...state, error: null };
    default: return state;
  }
}

const TaskCtx = createContext(null);

export function TaskProvider({ children, userId = DEFAULT_USER_ID }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const tasksRef = useRef(state.tasks);
  tasksRef.current = state.tasks;
  const listeners = useRef(new Set()); // subscribeChange 구독자(useTaskSync)

  const emit = useCallback((event) => {
    listeners.current.forEach((fn) => { try { fn(event); } catch { /* noop */ } });
  }, []);
  const subscribeChange = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const fetchTasks = useCallback(async () => {
    dispatch({ type: 'LOADING' });
    try {
      const raw = await getAllPending(userId);
      dispatch({ type: 'SET_TASKS', raw });
    } catch (e) {
      dispatch({ type: 'ERROR', error: e?.message || '작업을 불러오지 못했어요.' });
    }
  }, [userId]);

  // 외부(폴링/BroadcastChannel)에서 받은 목록 반영 — 재요청 없이 즉시 sync
  const syncTasks = useCallback((raw) => dispatch({ type: 'SET_TASKS', raw }), []);

  const createTask = useCallback(async (input) => {
    try {
      const created = await apiCreate({ userId, ...input });
      dispatch({ type: 'UPSERT', task: C.normalizeTask(created) });
      emit({ type: 'TASK_CREATED', task: C.normalizeTask(created) });
      return C.CREATE_RESULT.SUCCESS;
    } catch (e) {
      const result = C.classifyCreateError(e);
      if (result) return result;             // PRIORITY_EXISTS / INSUFFICIENT_TIME
      dispatch({ type: 'ERROR', error: e?.message || '작업 추가에 실패했어요.' });
      throw e;
    }
  }, [userId, emit]);

  const optimisticUpdateStatus = useCallback((taskId, status) => dispatch({ type: 'OPTIMISTIC', taskId, status }), []);
  const rollbackStatus = useCallback((taskId, previousStatus) => dispatch({ type: 'ROLLBACK', taskId, previousStatus }), []);

  /** 클릭 즉시 낙관적 전이 → PATCH → 성공 sync / 실패 rollback(스펙 ②). */
  const updateTaskStatus = useCallback(async (taskId, action, { onError } = {}) => {
    const prev = C.getStatus(tasksRef.current, taskId);
    const optimistic = C.optimisticStatusFor(prev, action);
    if (!optimistic) return prev;            // 불허 전이 무시(버튼이 애초에 안 떠야 정상)
    dispatch({ type: 'OPTIMISTIC', taskId, status: optimistic });
    try {
      const res = await apiUpdateStatus(taskId, action);
      const next = res?.status && C.STATUS[res.status] ? res.status : optimistic;
      dispatch({ type: 'OPTIMISTIC', taskId, status: next });
      emit({ type: 'TASK_STATUS_CHANGED', taskId: String(taskId), status: next });
      return next;
    } catch (e) {
      dispatch({ type: 'ROLLBACK', taskId, previousStatus: prev });
      onError?.(e);
      dispatch({ type: 'ERROR', error: '상태 변경에 실패했습니다.' });
      return prev;
    }
  }, [emit]);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  const value = useMemo(() => ({
    tasks: state.tasks,
    isLoading: state.isLoading,
    error: state.error,
    // 파생값(스펙 ③) — tasks 변경 시 자동 재계산
    isEmpty: C.deriveIsEmpty(state.tasks, state.isLoading),
    hasPriorityTask: C.deriveHasPriorityTask(state.tasks),
    priorityTask: C.derivePriorityTask(state.tasks),
    // actions
    fetchTasks, createTask, updateTaskStatus, optimisticUpdateStatus, rollbackStatus,
    syncTasks, clearError, subscribeChange,
  }), [state, fetchTasks, createTask, updateTaskStatus, optimisticUpdateStatus, rollbackStatus, syncTasks, clearError, subscribeChange]);

  return <TaskCtx.Provider value={value}>{children}</TaskCtx.Provider>;
}

export function useTaskStore() {
  const c = useContext(TaskCtx);
  if (!c) throw new Error('useTaskStore must be used within <TaskProvider>');
  return c;
}

// ── 파생값 selector 훅(필요한 값만 구독하는 컴포넌트용) ──────────────
export const useIsEmpty = () => useTaskStore().isEmpty;
export const useHasPriorityTask = () => useTaskStore().hasPriorityTask;
export const usePriorityTask = () => useTaskStore().priorityTask;
export function useTaskStatus(taskId) {
  const { tasks } = useTaskStore();
  return C.getStatus(tasks, taskId);
}
