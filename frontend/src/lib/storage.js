/**
 * localStorage 영속 계층. API 연동과 무관하게 동작하도록 클라이언트 상태를 백업한다.
 * 모든 접근은 try/catch 로 감싸 SSR/프라이빗 모드/쿼터 초과에도 앱이 죽지 않게 한다.
 */

export const STORAGE_KEYS = {
  settings: 'sigma_settings',
  completed: 'sigma_completed',
  runtime: 'sigma_task_runtime',
};

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 무시: 저장 실패해도 인메모리 상태로 계속 동작 */
  }
}

// ---- Settings --------------------------------------------------------------
export const DEFAULT_SETTINGS = {
  username: '적응형 할 일',
  notifyStart: true,
  notifyDeadline: true,
  theme: 'dark', // 'dark' | 'light'
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJSON(STORAGE_KEYS.settings, {}) };
}

export function saveSettings(settings) {
  writeJSON(STORAGE_KEYS.settings, settings);
}

// ---- Completed (history) ---------------------------------------------------
/** 로컬에서 '끝내기'로 완료된 작업 기록. HistoryPage가 백엔드 결과와 병합해 보여준다. */
export function loadCompleted() {
  const list = readJSON(STORAGE_KEYS.completed, []);
  return Array.isArray(list) ? list : [];
}

export function appendCompleted(entry) {
  const list = loadCompleted();
  // 같은 taskId 재완료 시 최신 것으로 교체
  const next = [entry, ...list.filter((i) => i.taskId !== entry.taskId)];
  writeJSON(STORAGE_KEYS.completed, next);
  return next;
}

export function clearCompleted() {
  writeJSON(STORAGE_KEYS.completed, []);
}
