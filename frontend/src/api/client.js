/**
 * Axios client for the TeamSigma Spring Boot backend.
 * Expert 6: Backend Integration Lead
 *
 * Vite env vars (note: VITE_ prefix, not CRA's REACT_APP_):
 *   VITE_API_URL   — backend origin. Empty string => use Vite dev proxy (/api).
 *   VITE_USE_MOCK  — 'true' routes all calls to the in-memory mock instead.
 */
import axios from 'axios';

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
export const DEFAULT_USER_ID = Number(import.meta.env.VITE_DEFAULT_USER_ID ?? 1);

const isDev = import.meta.env.DEV;

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '', // '' -> same-origin -> dev proxy
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach the acting user and (dev) log the call.
client.interceptors.request.use((config) => {
  config.headers['X-User-Id'] = DEFAULT_USER_ID;
  if (isDev) {
    // eslint-disable-next-line no-console
    console.debug(`[api →] ${config.method?.toUpperCase()} ${config.url}`, config.params ?? config.data ?? '');
  }
  return config;
});

// Response interceptor: normalise errors into a predictable shape.
client.interceptors.response.use(
  (res) => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.debug(`[api ←] ${res.status} ${res.config.url}`, res.data);
    }
    return res;
  },
  (error) => {
    const status = error.response?.status;
    const messageByStatus = {
      400: '입력값을 다시 확인해 주세요.',
      404: '대상을 찾을 수 없습니다.',
      500: '서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    };
    const normalized = {
      status: status ?? 0,
      message:
        error.response?.data?.message ||
        messageByStatus[status] ||
        '네트워크 오류가 발생했습니다.',
      raw: error,
    };
    if (isDev) {
      // eslint-disable-next-line no-console
      console.error('[api ✗]', normalized.status, normalized.message);
    }
    return Promise.reject(normalized);
  }
);

export default client;
