/**
 * Task API surface + view-model mapping.
 * Expert 6: Backend Integration Lead
 *
 * Each function transparently routes to the mock (VITE_USE_MOCK=true) or the
 * live Spring Boot backend. The UI only ever consumes `toViewModel(...)` output
 * so the rest of the app is decoupled from the raw TaskResponse shape.
 */
import client, { USE_MOCK } from './client';
import { mockApi } from './mock';

const CATEGORY_TAGS = {
  업무: { label: '업무', category: 'work' },
  개인: { label: '개인', category: 'personal' },
  디자인: { label: '디자인', category: 'design' },
  문서: { label: '문서', category: 'document' },
  회의: { label: '회의', category: 'meeting' },
  개발: { label: '개발', category: 'dev' },
  인사: { label: '인사', category: 'hr' },
};

/** D-day label from an ISO deadline, e.g. "D-2" / "D-DAY" / "D+1". */
export function ddayLabel(deadlineIso) {
  if (!deadlineIso) return null;
  const ms = new Date(deadlineIso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  const days = Math.round(ms / 86400000);
  if (days === 0) return 'D-DAY';
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

const IMPORTANCE_LABEL = { 5: '매우 높음', 4: '높음', 3: '보통', 2: '낮음', 1: '매우 낮음' };

/**
 * Map a raw TaskResponse (+optional mock UI fields) to what the components want.
 * delayCount >= 5 => zombie. importance >= 5 (or isPriority) => priority.
 */
export function toViewModel(t) {
  const isZombie = t.delayCount >= 5;
  const isPriority = Boolean(t.isPriority) || t.importance >= 5;
  const tags = [];
  if (t.category && CATEGORY_TAGS[t.category]) tags.push(CATEGORY_TAGS[t.category]);
  const dday = ddayLabel(t.deadline);

  return {
    id: t.taskId,
    title: t.title,
    description: t.description || '',
    estimatedMinutes: t.estimatedMinutes,
    requiredEnergy: t.requiredEnergy,
    importance: t.importance,
    importanceLabel: IMPORTANCE_LABEL[t.importance] ?? '보통',
    status: t.status,
    delayCount: t.delayCount,
    tags,
    dday,
    scheduledTime: t.scheduledTime ?? null,
    delayedFrom: t.delayedFrom ?? null,
    variant: isZombie ? 'zombie' : isPriority ? 'priority' : 'default',
    isPriority,
    isZombie,
  };
}

// ---- CRUD --------------------------------------------------------------
export async function getTasks(userId, energy, minutes) {
  if (USE_MOCK) return mockApi.getTasks(userId, energy, minutes);
  const { data } = await client.get('/api/tasks', { params: { userId, energy, minutes } });
  return data;
}

/** Full PENDING list for the Today screen (mock convenience; live falls back
 *  to a wide getTasks call with max energy/time). */
export async function getAllPending(userId) {
  if (USE_MOCK) return mockApi.getAllPending(userId);
  const { data } = await client.get('/api/tasks', {
    params: { userId, energy: 'HIGH', minutes: 100000 },
  });
  return data;
}

export async function createTask(taskData) {
  if (USE_MOCK) return mockApi.createTask(taskData);
  const { data } = await client.post('/api/tasks', taskData);
  return data;
}

export async function updateTaskStatus(taskId, action, energyLevel, availableMinutes) {
  if (USE_MOCK) return mockApi.updateTaskStatus(taskId, action);
  const { data } = await client.patch(`/api/tasks/${taskId}/status`, {
    action,
    energyLevel,
    availableMinutes,
  });
  return data;
}

export const completeTask = (taskId, energy, minutes) =>
  updateTaskStatus(taskId, 'COMPLETE', energy, minutes);
export const snoozeTask = (taskId, energy, minutes) =>
  updateTaskStatus(taskId, 'SNOOZE', energy, minutes);
export const archiveTask = (taskId, energy, minutes) =>
  updateTaskStatus(taskId, 'ARCHIVE', energy, minutes);

export async function getZombieTasks(userId) {
  if (USE_MOCK) return mockApi.getZombieTasks(userId);
  const { data } = await client.get('/api/tasks/zombie', { params: { userId } });
  return data;
}

export async function getCompletedTasks(userId, filter) {
  if (USE_MOCK) return mockApi.getCompletedTasks(userId, filter);
  // Live: logs lack titles, so map best-effort. (Backend limitation noted.)
  const { data } = await client.get(`/api/logs/user/${userId}`, { params: { filter } });
  return data
    .filter((log) => log.actionType === 'COMPLETED')
    .map((log) => ({
      taskId: log.taskId,
      title: `작업 #${log.taskId}`,
      category: '업무',
      completedAt: new Date(log.loggedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      date: log.loggedAt.slice(0, 10),
    }));
}
