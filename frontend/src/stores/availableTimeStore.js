/**
 * AvailableTimeStore (Zustand) — 가용시간 단일 진실 원천.
 * 설치: npm i zustand   (현재 프로젝트 미설치 → 산출물. Context 버전은 context/AvailableTimeContext.jsx)
 *
 * recalculate 는 5가지 이벤트(set/create/delete/earlyCompletion/midnight)에서만. 파생값은 selector 로만 노출.
 */
import { create } from 'zustand';
import * as A from '../lib/availability';

export const useAvailableTimeStore = create((set, get) => ({
  totalAvailable: 0,
  allocated: 0,
  refunded: 0,

  // ── 5 events ──
  setAvailable: (seconds) => set((s) => A.onSetAvailable(s, seconds)),          // ①
  createTask: (estimatedDuration) => set((s) => A.onCreateTask(s, estimatedDuration)), // ②
  deleteTask: (estimatedDuration) => set((s) => A.onDeleteTask(s, estimatedDuration)), // ③
  applyEarlyCompletion: (refundSeconds) => set((s) => A.onEarlyCompletion(s, refundSeconds)), // ④
  midnightReset: (totalAvailable = 0) => set(() => A.onMidnightReset(totalAvailable)), // ⑤

  // ── 파생 getter (명령형 사용용) ──
  remaining: () => A.computeRemaining(get()),
  insufficiencyLevel: () => A.insufficiencyLevel(A.computeRemaining(get()), get().totalAvailable),
  isInsufficient: (duration) => A.isInsufficient(A.computeRemaining(get()), duration),
}));

/** 컴포넌트 구독용 셀렉터: 파생 스냅샷(remaining/insufficiencyLevel/isInsufficient)만 노출. */
export const selectAvailability = (s) =>
  A.deriveAvailability({ totalAvailable: s.totalAvailable, allocated: s.allocated, refunded: s.refunded });
