/**
 * useTaskRuntime — 작업별 진행 상태(IDLE/RUNNING/PAUSED/COMPLETED)와 타이머를 관리.
 *
 * - 상태 맵은 localStorage('sigma_task_runtime')에 영속화되어 새로고침 후에도 유지된다.
 * - 동시 실행 제한: 한 작업을 시작/재시작하면 기존 RUNNING 작업은 자동으로 PAUSED 된다(방식 A).
 * - RUNNING 중에는 1초 간격으로 리렌더하여 경과 시간이 갱신된다. 언마운트 시 clearInterval.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RUN_STATUS,
  emptyEntry,
  startEntry,
  pauseEntry,
  resumeEntry,
  finishEntry,
} from '../lib/taskRuntime';
import { STORAGE_KEYS, readJSON, writeJSON } from '../lib/storage';

export function useTaskRuntime() {
  const [map, setMap] = useState(() => readJSON(STORAGE_KEYS.runtime, {}) ?? {});
  const [, forceTick] = useState(0);
  const mapRef = useRef(map);
  mapRef.current = map;

  // 영속화
  useEffect(() => {
    writeJSON(STORAGE_KEYS.runtime, map);
  }, [map]);

  // RUNNING 작업이 있을 때만 1초 타이머로 리렌더(경과 시간 표시 갱신).
  const hasRunning = Object.values(map).some((e) => e?.status === RUN_STATUS.RUNNING);
  useEffect(() => {
    if (!hasRunning) return undefined;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  const get = useCallback((taskId) => map[taskId] ?? emptyEntry(), [map]);

  // 다른 RUNNING 작업을 모두 PAUSED 로 접는다(동시 실행 제한).
  const pauseOthers = (draft, exceptId) => {
    for (const id of Object.keys(draft)) {
      if (id !== exceptId && draft[id]?.status === RUN_STATUS.RUNNING) {
        draft[id] = pauseEntry(draft[id]);
      }
    }
  };

  const start = useCallback((taskId) => {
    setMap((prev) => {
      const draft = { ...prev };
      pauseOthers(draft, taskId);
      // 시작은 항상 새 RUNNING 구간에서. 이전 엔트리가 COMPLETED 등 비-IDLE 이면
      // startEntry 가 no-op 이 되어 '시작' 버튼이 먹통이 되던 문제를 차단
      // (표시상태 IDLE ↔ 런타임 COMPLETED 불일치 해소).
      draft[taskId] = startEntry(emptyEntry());
      return draft;
    });
  }, []);

  const resume = useCallback((taskId) => {
    setMap((prev) => {
      const draft = { ...prev };
      pauseOthers(draft, taskId);
      const cur = draft[taskId];
      // PAUSED 면 경과를 이어서, 그 외(IDLE/COMPLETED/없음)는 새로 시작 →
      // '이어서 시작하기'도 어떤 상태에서든 항상 RUNNING 으로 진입(먹통 방지).
      draft[taskId] = cur && cur.status === RUN_STATUS.PAUSED ? resumeEntry(cur) : startEntry(emptyEntry());
      return draft;
    });
  }, []);

  const pause = useCallback((taskId) => {
    setMap((prev) => ({ ...prev, [taskId]: pauseEntry(prev[taskId] ?? emptyEntry()) }));
  }, []);

  /** 완료 처리. 최종 entry를 동기적으로 반환하여 호출부가 기록/백엔드 연동에 쓸 수 있게 한다. */
  const finish = useCallback((taskId) => {
    const fin = finishEntry(mapRef.current[taskId] ?? emptyEntry());
    setMap((prev) => ({ ...prev, [taskId]: fin }));
    return fin;
  }, []);

  /** 완료된 런타임 엔트리 정리(설정의 '완료 기록 초기화' 등에서 사용). */
  const clearCompleted = useCallback(() => {
    setMap((prev) => {
      const draft = {};
      for (const [id, e] of Object.entries(prev)) {
        if (e?.status !== RUN_STATUS.COMPLETED) draft[id] = e;
      }
      return draft;
    });
  }, []);

  return { get, start, pause, resume, finish, clearCompleted };
}
