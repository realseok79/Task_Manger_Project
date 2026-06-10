/**
 * In-memory mock backend.
 * Expert 6: Backend Integration Lead
 */

const now = new Date();
const inDays = (d) => new Date(now.getTime() + d * 86400000).toISOString();

// ---- Seed data (Korean, matching the reference screens) -------------------
let TASKS = [
  {
    taskId: 1,
    title: '2024년 2분기 경영 지표 분석 및 리포트 작성',
    description: '핵심 KPI를 정리하고 경영진 보고용 요약 리포트를 작성합니다.',
    estimatedMinutes: 90,
    deadline: inDays(2),
    requiredEnergy: 'HIGH',
    importance: 5,
    status: 'PENDING',
    delayCount: 0,
    createdAt: inDays(-3),
    category: '업무',
    isPriority: true,
  },
  {
    taskId: 2,
    title: '마케팅 캠페인 시안 리뷰',
    description: '신규 캠페인 시안을 검토하고 피드백을 정리합니다.',
    estimatedMinutes: 60,
    deadline: inDays(1),
    requiredEnergy: 'MEDIUM',
    importance: 3,
    status: 'PENDING',
    delayCount: 0,
    createdAt: inDays(-1),
    category: '디자인',
    scheduledTime: '오후 3시',
  },
  {
    taskId: 3,
    title: '개인 사이드 프로젝트 코드 클린업',
    description: '리팩터링과 미사용 코드 정리를 진행합니다.',
    estimatedMinutes: 120,
    deadline: inDays(4),
    requiredEnergy: 'HIGH',
    importance: 2,
    status: 'PENDING',
    delayCount: 5, // 좀비 임계치
    createdAt: inDays(-9),
    category: '개인',
    delayedFrom: '월요일',
  },
  {
    taskId: 4,
    title: '정기 구독 서비스 결제 수단 갱신',
    description: '만료 예정 카드 정보를 갱신합니다.',
    estimatedMinutes: 15,
    deadline: inDays(6),
    requiredEnergy: 'LOW',
    importance: 2,
    status: 'PENDING',
    delayCount: 0,
    createdAt: inDays(-2),
    category: '개인',
  },
  {
    taskId: 5,
    title: '신규 채용 최종 면접 진행',
    description: '백엔드 시니어 포지션 최종 후보 면접 및 평가표 작성.',
    estimatedMinutes: 60,
    deadline: inDays(1),
    requiredEnergy: 'HIGH',
    importance: 4,
    status: 'PENDING',
    delayCount: 0,
    createdAt: inDays(-1),
    category: '인사',
    scheduledTime: '오전 11시',
  },
  {
    taskId: 6,
    title: '보안 패치 긴급 배포 검토',
    description: '취약점 핫픽스 PR 리뷰 후 운영 배포 승인.',
    estimatedMinutes: 45,
    deadline: inDays(0),
    requiredEnergy: 'MEDIUM',
    importance: 5,
    status: 'PENDING',
    delayCount: 0,
    createdAt: inDays(-1),
    category: '개발',
  },
];

// Completed history view models
const COMPLETED = [
  { taskId: 101, title: 'Q2 분기별 성과 보고서 초안 작성', category: '문서', completedAt: '오후 4:30', date: '2024-05-24' },
  { taskId: 102, title: '디자인 시스템 컬러 토큰 검토 및 업데이트', category: '디자인', completedAt: '오후 2:15', date: '2024-05-24' },
  { taskId: 103, title: '팀 주간 스탠드업 회의 참석', category: '회의', completedAt: '오전 10:00', date: '2024-05-23' },
  { taskId: 104, title: '서버 사이드 렌더링 최적화 리서치', category: '개발', completedAt: '오전 09:45', date: '2024-05-23' },
  { taskId: 105, title: '신규 온보딩 프로세스 가이드 정리', category: '인사', completedAt: '오전 09:12', date: '2024-05-23' },
];

// 밀린 Task 알림(notifications) 시드
let NOTIFICATIONS = [
  {
    id: 'n-1', task_id: 2, type: 'OVERDUE_1DAY', overdue_days: 1,
    message: '마케팅 캠페인 시안 리뷰가 하루 미뤄졌습니다.',
    is_read: false, is_dismissed: false, action_taken: 'NONE',
    service_date: now.toISOString().slice(0, 10), created_at: inDays(0),
  },
  {
    id: 'n-2', task_id: 3, type: 'OVERDUE_2DAY', overdue_days: 2,
    message: '개인 사이드 프로젝트 코드 클린업이 이틀 지났습니다.',
    is_read: false, is_dismissed: false, action_taken: 'NONE',
    service_date: now.toISOString().slice(0, 10), created_at: inDays(0),
  },
  {
    id: 'n-3', task_id: 4, type: 'DELETE_CONFIRM', overdue_days: 4,
    message: '정기 구독 서비스 결제 수단 갱신을 투두리스트에서 없앨까요?',
    is_read: false, is_dismissed: false, action_taken: 'NONE',
    service_date: now.toISOString().slice(0, 10), created_at: inDays(0),
  },
];

const ENERGY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const latency = (ms = 280) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));
let nextId = 1000;

// 가용시간(초) — 오늘 설정값 + 조기완료 환급 원장
let AVAILABLE_SECONDS = 6 * 3600;
let REFUNDS = [];
const estSecondsOf = (t) => t.estimatedDuration ?? (t.estimatedMinutes || 0) * 60;
const allocatedSeconds = () =>
  TASKS.filter((t) => t.status === 'PENDING').reduce((a, t) => a + estSecondsOf(t), 0);

// Priority weights, started "drifted" (as if the nightly learner boosted 중요도)
// so the Settings → reset action visibly returns them to the 0.5/0.3/0.2 baseline.
let WEIGHTS = { w1: 0.72, w2: 0.17, w3: 0.11 };

// ---- Mock operations (same signatures the real api/tasks.js exposes) ------
export const mockApi = {
  async getTasks(_userId, energy, minutes) {
    await latency();
    const cap = ENERGY_RANK[energy] ?? 3;
    return clone(
      TASKS.filter(
        (t) =>
          t.status === 'PENDING' &&
          ENERGY_RANK[t.requiredEnergy] <= cap &&
          t.estimatedMinutes <= minutes
      ).sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    );
  },

  async getAllPending(_userId) {
    await latency(200);
    return clone(TASKS.filter((t) => t.status === 'PENDING'));
  },

  async createTask(data) {
    await latency(220);
    const created = {
      taskId: ++nextId,
      title: data.title,
      description: data.description ?? '',
      estimatedMinutes: data.estimatedMinutes ?? 30,
      deadline: data.deadline ?? inDays(3),
      requiredEnergy: data.requiredEnergy ?? 'MEDIUM',
      importance: data.importance ?? 3,
      status: 'PENDING',
      delayCount: 0,
      createdAt: new Date().toISOString(),
      category: data.category ?? '업무',
    };
    TASKS = [...TASKS, created];
    return clone(created);
  },

  async updateTaskStatus(taskId, action) {
    await latency(180);
    // 표시상태 전이(START/PAUSE/RESUME/FINISH) → 표시 status 반환(TaskStore 가 sync 에 사용)
    const DISPLAY = { START: 'ACTIVE', PAUSE: 'PAUSED', RESUME: 'ACTIVE', FINISH: 'COMPLETED' };
    const same = (a, b) => String(a) === String(b);
    TASKS = TASKS.map((t) => {
      if (!same(t.taskId, taskId)) return t;
      if (action === 'COMPLETE' || action === 'FINISH') return { ...t, status: 'COMPLETED' };
      if (action === 'ARCHIVE') return { ...t, status: 'ARCHIVED' };
      if (action === 'RESTORE') return { ...t, status: 'PENDING' }; // undo archive
      if (action === 'SNOOZE') return { ...t, delayCount: t.delayCount + 1 };
      return t;
    });
    if (DISPLAY[action]) return { ok: true, taskId, status: DISPLAY[action] };
    return { ok: true };
  },

  async getZombieTasks(_userId) {
    await latency(200);
    const zombieTasks = TASKS.filter((t) => t.status === 'PENDING' && t.delayCount >= 5).map((t) => ({
      taskId: t.taskId,
      title: t.title,
      delayCount: t.delayCount,
      estimatedMinutes: t.estimatedMinutes,
      requiredEnergy: t.requiredEnergy,
      importance: t.importance,
      deadline: t.deadline,
    }));
    return { zombieTasks: clone(zombieTasks), explorationModeFlag: false };
  },

  async getCompletedTasks(_userId, _filter) {
    await latency(240);
    return clone(COMPLETED);
  },

  async getArchivedTasks(_userId) {
    await latency(200);
    return clone(TASKS.filter((t) => t.status === 'ARCHIVED'));
  },

  async deleteTask(taskId) {
    await latency(160);
    TASKS = TASKS.filter((t) => t.taskId !== taskId);
    return { ok: true };
  },

  // Re-insert an exact task (undo of a permanent delete).
  async recreateTask(task) {
    await latency(160);
    if (!TASKS.some((t) => t.taskId === task.taskId)) TASKS = [...TASKS, task];
    return clone(task);
  },

  // ---- Notifications (밀린 Task 알림) ----
  async getNotifications(_userId, unreadOnly = false, { cursor = null, limit = 50 } = {}) {
    await latency(180);
    const all = NOTIFICATIONS
      .filter((n) => !n.is_dismissed && (!unreadOnly || !n.is_read))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const start = cursor ? all.filter((n) => new Date(n.created_at) < new Date(cursor)) : all;
    const page = start.slice(0, limit);
    const unreadCount = NOTIFICATIONS.filter((n) => !n.is_dismissed && !n.is_read).length;
    const nextCursor = page.length === limit && page.length < start.length ? page[page.length - 1].created_at : null;
    return { notifications: clone(page), unreadCount, nextCursor };
  },

  async markNotificationRead(id) {
    await latency(120);
    NOTIFICATIONS = NOTIFICATIONS.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n));
    return { ok: true };
  },

  async dismissNotification(id) {
    await latency(120);
    NOTIFICATIONS = NOTIFICATIONS.map((n) => (n.id === id ? { ...n, is_dismissed: true } : n));
    return { ok: true };
  },

  async resolveDeleteConfirm(taskId, action) {
    await latency(160);
    NOTIFICATIONS = NOTIFICATIONS.map((n) =>
      n.task_id === taskId && !n.is_dismissed
        ? { ...n, is_dismissed: true, action_taken: action === 'COMPLETE' ? 'COMPLETED' : 'DELETED' }
        : n
    );
    TASKS = TASKS.map((t) =>
      t.taskId === taskId ? { ...t, status: action === 'COMPLETE' ? 'COMPLETED' : 'ARCHIVED' } : t
    );
    return { ok: true };
  },

  // ---- 가용시간 / 소요시간 ----
  async getAvailableTime(_userId) {
    await latency(120);
    const allocated = allocatedSeconds();
    const consumed = 0;
    const refunded = REFUNDS.reduce((a, b) => a + b, 0);
    const total = AVAILABLE_SECONDS;
    const remaining = total - allocated - consumed;
    return {
      total_available: total,
      allocated,
      consumed,
      refunded,
      remaining,
      can_create_task: remaining > 0,
      tasks_breakdown: TASKS.filter((t) => t.status === 'PENDING').map((t) => ({
        task_id: t.taskId, title: t.title, estimated_duration: estSecondsOf(t), status: t.status,
      })),
    };
  },

  async createTaskWithBudget(data) {
    await latency(200);
    const dur = Number(data.estimated_duration);
    const remaining = AVAILABLE_SECONDS - allocatedSeconds();
    if (dur > remaining) {
      throw {
        status: 409, code: 'INSUFFICIENT_AVAILABLE_TIME', message: '당신에게 남은 가용시간이 부족합니다',
        remaining_seconds: remaining, requested_seconds: dur,
      };
    }
    // 최우선 과제 단일성 2차 검증(서버측)
    if (data.isPriority &&
        TASKS.some((t) => (t.isPriority || t.importance >= 5) && t.status !== 'COMPLETED' && t.status !== 'ARCHIVED')) {
      throw { status: 409, code: 'PRIORITY_EXISTS', message: '최우선 과제가 이미 존재합니다!!' };
    }
    const created = {
      taskId: ++nextId, title: data.title, description: data.description ?? '',
      estimatedMinutes: Math.round(dur / 60), estimatedDuration: dur,
      deadline: data.deadline ?? inDays(3), requiredEnergy: data.requiredEnergy ?? 'MEDIUM',
      importance: data.importance ?? 3, status: 'PENDING', delayCount: 0,
      isPriority: Boolean(data.isPriority),
      createdAt: new Date().toISOString(), category: data.category ?? '업무',
    };
    TASKS = [created, ...TASKS];
    return clone(created);
  },

  async completeTaskWithRefund(taskId, elapsedSeconds) {
    await latency(160);
    const t = TASKS.find((x) => x.taskId === taskId);
    const estSec = t ? estSecondsOf(t) : 0;
    const refund = Math.max(0, estSec - elapsedSeconds);
    if (refund > 0) REFUNDS.push(refund);
    TASKS = TASKS.map((x) => (x.taskId === taskId ? { ...x, status: 'COMPLETED' } : x));
    return { task_id: taskId, status: 'COMPLETED', elapsed_time: elapsedSeconds, refunded_seconds: refund };
  },

  async setAvailableTime(_userId, seconds, _date) {
    await latency(120);
    const allocated = allocatedSeconds();
    if (seconds < allocated) {
      throw { status: 400, code: 'AVAILABLE_BELOW_ALLOCATED', message: '이미 할당된 작업 시간보다 작게 설정할 수 없습니다.', allocated_seconds: allocated };
    }
    AVAILABLE_SECONDS = seconds;
    return { available_seconds: seconds, allocated };
  },

  // ---- Priority weights ---------------------------------------------------
  async getWeights(userId = 1) {
    await latency(160);
    return clone({ userId, ...WEIGHTS });
  },

  async resetWeights(userId = 1) {
    await latency(200);
    WEIGHTS = { w1: 0.5, w2: 0.3, w3: 0.2 };
    return clone({ userId, ...WEIGHTS });
>>>>>>> main
  },
};
