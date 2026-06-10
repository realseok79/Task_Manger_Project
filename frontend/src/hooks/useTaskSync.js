/**
 * useTaskSync — Task 상태 동기화(스펙 ④).
 *  1) 30초 간격 폴링(낙관적 업데이트로 지연 체감 없음)
 *  2) 탭 포커스 복귀 시 즉시 refetch (Page Visibility API)
 *  3) 같은 사용자의 다른 탭과 BroadcastChannel 로 상태 전파
 *     이벤트: TASK_STATUS_CHANGED | TASK_CREATED | TASK_DELETED
 *
 * TaskProvider 안쪽에서 한 번 마운트한다(예: TodayTasksPage 최상단).
 */
import { useEffect, useRef } from 'react';
import { useTaskStore } from '../context/TaskContext';

const CHANNEL = 'sigma:tasks';
const POLL_MS = 30_000;

export function useTaskSync({ pollMs = POLL_MS, enabled = true } = {}) {
  const { fetchTasks, subscribeChange } = useTaskStore();
  const fetchRef = useRef(fetchTasks);
  fetchRef.current = fetchTasks;

  // 최초 1회 로드
  useEffect(() => { if (enabled) fetchRef.current(); }, [enabled]);

  // 1) 30초 폴링 (숨김 상태에서는 건너뛰어 무의미한 호출 방지)
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') fetchRef.current();
    }, pollMs);
    return () => clearInterval(id);
  }, [enabled, pollMs]);

  // 2) 탭 포커스 복귀 시 즉시 refetch
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    const onVis = () => { if (document.visibilityState === 'visible') fetchRef.current(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled]);

  // 3) BroadcastChannel: 로컬 변경 → post, 원격 이벤트 → refetch
  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === 'undefined') return undefined;
    const bc = new BroadcastChannel(CHANNEL);
    const unsub = subscribeChange((event) => bc.postMessage(event)); // 이 탭의 변경을 알림
    bc.onmessage = (e) => {
      const type = e?.data?.type;
      if (type === 'TASK_STATUS_CHANGED' || type === 'TASK_CREATED' || type === 'TASK_DELETED') {
        fetchRef.current(); // 권위 있는 목록으로 재동기화(낙관적 표류 방지)
      }
    };
    return () => { unsub(); bc.close(); };
  }, [enabled, subscribeChange]);
}
