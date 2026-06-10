/**
 * 가용시간/소요시간 API (mock/live 라우팅).
 * 백엔드 계약(alarm-system):
 *   POST   /api/tasks                      {title, estimated_duration(sec), ...} → 201 | 409 INSUFFICIENT_AVAILABLE_TIME
 *   PATCH  /api/tasks/:id/complete         {elapsed_time, completed_at} → {refunded_seconds, ...}
 *   GET    /api/users/:id/available-time   → {total_available, allocated, consumed, refunded, remaining, can_create_task, ...}
 *   PUT    /api/users/:id/available-time   {available_seconds, date} → {available_seconds, allocated}
 */
import client, { USE_MOCK, DEFAULT_USER_ID } from './client';
import { mockApi } from './mock';

/** 에러를 {status, code, message, remaining_seconds?, requested_seconds?, allocated_seconds?} 로 정규화. */
function normalizeError(e) {
  // live: axios interceptor 가 {status, message, raw}. 서버 본문(raw.response.data)에 code/extra 존재.
  const data = e?.raw?.response?.data;
  if (data?.error) {
    return { status: e.status ?? data.status, code: data.error, message: data.message ?? e.message, ...data };
  }
  if (e?.code) return e; // mock: 이미 정규화된 객체(remaining_seconds 등 포함)
  return { status: e?.status ?? 0, code: 'UNKNOWN', message: e?.message ?? '요청 실패' };
}

/** 가용시간 예산을 검증하며 작업 생성. 부족 시 409(code INSUFFICIENT_AVAILABLE_TIME) 를 던진다. */
export async function createTaskWithBudget(payload, userId = DEFAULT_USER_ID) {
  if (USE_MOCK) {
    try { return await mockApi.createTaskWithBudget({ userId, ...payload }); }
    catch (e) { throw normalizeError(e); }
  }
  try {
    const { data } = await client.post('/api/tasks', { userId, ...payload });
    return data;
  } catch (e) { throw normalizeError(e); }
}

/** 완료 + 조기완료 환급. {refunded_seconds} 반환. */
export async function completeTaskWithRefund(taskId, elapsedSeconds, userId = DEFAULT_USER_ID) {
  const body = { elapsed_time: Math.max(0, Math.round(elapsedSeconds)), completed_at: new Date().toISOString() };
  if (USE_MOCK) return mockApi.completeTaskWithRefund(taskId, body.elapsed_time);
  const { data } = await client.patch(`/api/tasks/${taskId}/complete`, body);
  return data;
}

export async function getAvailableTime(userId = DEFAULT_USER_ID) {
  if (USE_MOCK) return mockApi.getAvailableTime(userId);
  const { data } = await client.get(`/api/users/${userId}/available-time`);
  return data;
}

export async function setAvailableTime(seconds, userId = DEFAULT_USER_ID, date) {
  if (USE_MOCK) {
    try { return await mockApi.setAvailableTime(userId, seconds, date); }
    catch (e) { throw normalizeError(e); }
  }
  try {
    const { data } = await client.put(`/api/users/${userId}/available-time`, { available_seconds: seconds, date });
    return data;
  } catch (e) { throw normalizeError(e); }
}
