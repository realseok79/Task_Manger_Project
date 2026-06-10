/**
 * User-scoped API: priority weights (view + manual reset).
 * Mirrors api/tasks.js conventions: each call routes to the mock
 * (VITE_USE_MOCK=true) or the live Spring Boot backend.
 *
 * Weight shape: { userId, w1, w2, w3 } where w1/w2/w3 = 중요도/긴급도/지연 (sum 1.0).
 */
import client, { USE_MOCK, DEFAULT_USER_ID } from './client';
import { mockApi } from './mock';

/** GET the user's current priority weights. */
export async function getWeights(userId = DEFAULT_USER_ID) {
  if (USE_MOCK) return mockApi.getWeights(userId);
  const { data } = await client.get(`/api/users/${userId}/weights`);
  return data;
}

/** Reset the user's priority weights to defaults (0.5/0.3/0.2). Returns the new weights. */
export async function resetWeights(userId = DEFAULT_USER_ID) {
  if (USE_MOCK) return mockApi.resetWeights(userId);
  const { data } = await client.post(`/api/users/${userId}/weights/reset`);
  return data;
}
