/**
 * TaskStore (Zustand) — Task 목록 + 표시상태 오버레이 단일 진실 원천.
 * 설치: npm i zustand   (현재 프로젝트 미설치 → 산출물. 실제 동작판은 context/TaskContext.jsx)
 *
 * 모든 상태 로직은 lib/taskStoreCore 순수 함수에 위임(node 검증 가능). 낙관적 업데이트로
 * 버튼 클릭 즉시 UI 가 반응하고, 서버 실패 시 rollback + toast 로 복구한다(스펙 ②).
 */
import { create } from 'zustand';
import * as C from '../lib/taskStoreCore';
import {
  getAllPending,
  createTask as apiCreate,
  updateTaskStatus as apiUpdateStatus,
} from '../api/tasks';
import { DEFAULT_USER_ID } from '../api/client';

export const useTaskStore = create((set, get) => ({
  tasks: [],
  isLoading: true,
  error: null,
  userId: DEFAULT_USER_ID,

  // ── Queries ──
  getTask: (taskId) => get().tasks.find((t) => t.id === String(taskId)) ?? null,

  // ── Actions ──
  fetchTasks: async (/* date */) => {
    set({ isLoading: true, error: null });
    try {
      const raw = await getAllPending(get().userId);
      set({ tasks: C.normalizeList(raw), isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e?.message || '작업을 불러오지 못했어요.' });
    }
  },

  /** 생성. 결과 코드('SUCCESS'|'PRIORITY_EXISTS'|'INSUFFICIENT_TIME') 반환(스펙 createTask). */
  createTask: async (input) => {
    try {
      const created = await apiCreate({ userId: get().userId, ...input });
      set((s) => ({ tasks: C.upsertTask(s.tasks, C.normalizeTask(created)) }));
      return C.CREATE_RESULT.SUCCESS;
    } catch (e) {
      const result = C.classifyCreateError(e);
      if (result) return result;
      set({ error: e?.message || '작업 추가에 실패했어요.' });
      throw e;
    }
  },

  // 낙관적 업데이트(스펙 ②)
  optimisticUpdateStatus: (taskId, newStatus) =>
    set((s) => ({ tasks: C.applyOptimisticStatus(s.tasks, taskId, newStatus) })),
  rollbackStatus: (taskId, previousStatus) =>
    set((s) => ({ tasks: C.applyRollbackStatus(s.tasks, taskId, previousStatus) })),

  /** 클릭 즉시 낙관적 전이 → PATCH → 성공 sync / 실패 rollback. onError 로 toast 연결. */
  updateTaskStatus: async (taskId, action, { onError } = {}) => {
    const prev = C.getStatus(get().tasks, taskId);
    const optimistic = C.optimisticStatusFor(prev, action);
    if (!optimistic) return prev; // 불허 전이는 무시(버튼이 애초에 안 떠야 정상)
    get().optimisticUpdateStatus(taskId, optimistic);
    try {
      const res = await apiUpdateStatus(taskId, action);
      const next = res?.status && C.STATUS[res.status] ? res.status : optimistic;
      get().optimisticUpdateStatus(taskId, next); // 서버 최종값으로 sync
      return next;
    } catch (e) {
      get().rollbackStatus(taskId, prev);
      onError?.(e);
      set({ error: '상태 변경에 실패했습니다.' });
      return prev;
    }
  },

  // 외부(폴링/BroadcastChannel)에서 받은 목록 반영
  syncTasks: (raw) => set({ tasks: C.normalizeList(raw), isLoading: false }),
  clearError: () => set({ error: null }),
}));

// ── 파생 상태 selector(스펙 ③: tasks 변경 시 자동 재계산) ─────────────
export const selectIsEmpty = (s) => C.deriveIsEmpty(s.tasks, s.isLoading);
export const selectHasPriorityTask = (s) => C.deriveHasPriorityTask(s.tasks);
export const selectPriorityTask = (s) => C.derivePriorityTask(s.tasks);
export const selectTaskStatus = (taskId) => (s) => C.getStatus(s.tasks, taskId);

/* 사용 예(컴포넌트는 필요한 파생값만 구독 → 최소 리렌더):
 *   const isEmpty = useTaskStore(selectIsEmpty);
 *   const hasPriority = useTaskStore(selectHasPriorityTask);
 *   const status = useTaskStore(selectTaskStatus(taskId));
 */
