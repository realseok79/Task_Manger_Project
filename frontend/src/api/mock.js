/**
 * In-memory mock backend.
 * Expert 6: Backend Integration Lead
 *
 * Mirrors the real Spring Boot contract exactly:
 *   TaskResponse { taskId, title, description, estimatedMinutes, deadline,
 *                  requiredEnergy, importance, status, delayCount, createdAt }
 *   ZombieTaskResponse { zombieTasks[], explorationModeFlag }
 *
 * It additionally carries a few UI-only fields (category, scheduledTime,
 * delayedFrom, isPriority) as a *superset*. The real API doesn't return those;
 * the view-model mapper (api/tasks.js) treats them as optional and degrades
 * gracefully when talking to the live backend.
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
    // UI-only
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
];

// Completed history view models (the live /api/logs endpoint omits titles, so
// the mock provides the richer shape the History screen renders).
const COMPLETED = [
  { taskId: 101, title: 'Q2 분기별 성과 보고서 초안 작성', category: '문서', completedAt: '오후 4:30', date: '2024-05-24' },
  { taskId: 102, title: '디자인 시스템 컬러 토큰 검토 및 업데이트', category: '디자인', completedAt: '오후 2:15', date: '2024-05-24' },
  { taskId: 103, title: '팀 주간 스탠드업 회의 참석', category: '회의', completedAt: '오전 10:00', date: '2024-05-23' },
  { taskId: 104, title: '서버 사이드 렌더링 최적화 리서치', category: '개발', completedAt: '오전 09:45', date: '2024-05-23' },
  { taskId: 105, title: '신규 온보딩 프로세스 가이드 정리', category: '인사', completedAt: '오전 09:12', date: '2024-05-23' },
];

const ENERGY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const latency = (ms = 280) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));
let nextId = 1000;

// ---- Mock operations (same signatures the real api/tasks.js exposes) ------
export const mockApi = {
  async getTasks(_userId, energy, minutes) {
    await latency();
    // Hard-constraint filter, mirroring the backend: requiredEnergy <= current
    // energy AND estimatedMinutes <= available minutes, PENDING only,
    // ordered by deadline ascending.
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

  // Today screen wants the full PENDING list regardless of the slider, so the
  // hard filter above doesn't hide the priority/zombie cards. The page uses
  // this; getTasks remains available to demo the real filtering endpoint.
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
    TASKS = TASKS.map((t) => {
      if (t.taskId !== taskId) return t;
      if (action === 'COMPLETE') return { ...t, status: 'COMPLETED' };
      if (action === 'ARCHIVE') return { ...t, status: 'ARCHIVED' };
      // SNOOZE: keep it visible in "today" but bump the delay counter so it can
      // graduate to a zombie at 5.
      if (action === 'SNOOZE') return { ...t, delayCount: t.delayCount + 1 };
      return t;
    });
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
};
