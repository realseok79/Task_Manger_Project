/**
 * useTasks — task list state with optimistic updates + debounced refetch.
 * Expert 6: Backend Integration Lead
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAllPending,
  createTask as apiCreate,
  completeTask as apiComplete,
  snoozeTask as apiSnooze,
  archiveTask as apiArchive,
  restoreTask as apiRestore,
} from '../api/tasks';
import { DEFAULT_USER_ID } from '../api/client';

export function useTasks(energyLevel, timeAvailable, userId = DEFAULT_USER_ID) {
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const data = await getAllPending(userId);
      setTasks(data);
    } catch (e) {
      setError(e.message || '작업을 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Initial load + debounced refetch when energy/time context changes.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchTasks, 300);
    return () => clearTimeout(debounceRef.current);
  }, [energyLevel, timeAvailable, fetchTasks]);

  const minutes = Math.round((timeAvailable ?? 1) * 60);

  // Optimistic mutation helper: apply locally, call API, roll back on failure.
  const mutate = useCallback(
    async (optimistic, apiCall) => {
      const snapshot = tasks;
      setTasks(optimistic(snapshot));
      try {
        await apiCall();
      } catch (e) {
        setTasks(snapshot); // rollback
        setError(e.message || '변경에 실패했어요. 다시 시도해 주세요.');
      }
    },
    [tasks]
  );

  const completeTask = useCallback(
    (taskId) =>
      mutate(
        (list) => list.filter((t) => t.taskId !== taskId),
        () => apiComplete(taskId, energyLevel, minutes)
      ),
    [mutate, energyLevel, minutes]
  );

  const snoozeTask = useCallback(
    (taskId) =>
      mutate(
        (list) => list.map((t) => (t.taskId === taskId ? { ...t, delayCount: t.delayCount + 1 } : t)),
        () => apiSnooze(taskId, energyLevel, minutes)
      ),
    [mutate, energyLevel, minutes]
  );

  // Archive removes the task but hands the caller a snapshot so it can offer undo.
  const archiveTask = useCallback(
    (taskId, onArchived) => {
      onArchived?.(tasks.find((t) => t.taskId === taskId));
      return mutate(
        (list) => list.filter((t) => t.taskId !== taskId),
        () => apiArchive(taskId, energyLevel, minutes)
      );
    },
    [mutate, energyLevel, minutes, tasks]
  );

  // Restore a previously archived task (undo) — re-insert + set back to PENDING.
  const restoreTask = useCallback(
    (task) => {
      if (!task) return;
      setTasks((list) => (list.some((t) => t.taskId === task.taskId) ? list : [...list, { ...task, status: 'PENDING' }]));
      apiRestore(task.taskId, energyLevel, minutes).catch(() => {});
    },
    [energyLevel, minutes]
  );

  const addTask = useCallback(
    async (partial) => {
      const optimistic = {
        taskId: `tmp-${Date.now()}`,
        title: partial.title,
        description: partial.description ?? '',
        estimatedMinutes: partial.estimatedMinutes ?? 30,
        deadline: partial.deadline ?? null,
        requiredEnergy: partial.requiredEnergy ?? 'MEDIUM',
        importance: partial.importance ?? 3,
        status: 'PENDING',
        delayCount: 0,
        category: partial.category ?? '업무',
      };
      setTasks((list) => [...list, optimistic]);
      try {
        const created = await apiCreate({ userId, ...partial });
        setTasks((list) => list.map((t) => (t.taskId === optimistic.taskId ? created : t)));
      } catch (e) {
        setTasks((list) => list.filter((t) => t.taskId !== optimistic.taskId));
        setError(e.message || '작업 추가에 실패했어요.');
      }
    },
    [userId]
  );

  return { tasks, isLoading, error, refetch: fetchTasks, completeTask, snoozeTask, archiveTask, restoreTask, addTask, clearError: () => setError(null) };
}
