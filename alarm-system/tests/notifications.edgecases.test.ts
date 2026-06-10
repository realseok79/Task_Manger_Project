/**
 * 알림 시스템 엣지 케이스 — 실제 구현(overdue/messages/scheduler)에 대한 검증.
 * 시간은 runDailyScan(now)/computeOverdueDays(deadline, now) 주입으로 결정론적으로 제어한다.
 */
import { OverdueNotificationScheduler } from '../src/queue/overdueNotificationScheduler';
import { computeOverdueDays, toServiceDate } from '../src/notifications/overdue';
import { buildOverdueNotification, generateNotificationMessage } from '../src/notifications/messages';
import { buildNotificationsListQuery, nextCursorOf, DEFAULT_LIMIT } from '../src/notifications/queries';

describe('알림 시스템 엣지 케이스', () => {
  // ── ① 시간 경계 ──────────────────────────────────────────────
  describe('① 시간 경계', () => {
    const batchNow = new Date(2026, 5, 8, 0, 5, 0); // 2026-06-08 00:05 (자정+5분 배치)

    it('마감이 오늘 00:00 정각 → 아직 안 지남(overdue=0) → 알림 없음', () => {
      expect(computeOverdueDays(new Date(2026, 5, 8, 0, 0, 0), batchNow)).toBe(0);
      expect(buildOverdueNotification('보고서', 0)).toBeNull();
    });

    it('어제 23:59:59 마감 → 1일 → OVERDUE_1DAY', () => {
      expect(computeOverdueDays(new Date(2026, 5, 7, 23, 59, 59), batchNow)).toBe(1);
      expect(buildOverdueNotification('운동', 1)).toEqual({
        message: '운동이 하루 미뤄졌습니다.',
        type: 'OVERDUE_1DAY',
      });
    });

    it('서버 시간 역행: 마감이 미래 → overdue 음수 → 알림 생성 안 함(음수 차단)', () => {
      const days = computeOverdueDays(new Date(2026, 5, 10, 0, 0, 0), batchNow);
      expect(days).toBeLessThan(0);
      expect(buildOverdueNotification('미래작업', days)).toBeNull();
    });

    it('월 경계: 06-01 기준 05-30 마감 → 2일(달력 일수 정확)', () => {
      expect(computeOverdueDays(new Date(2026, 4, 30, 12, 0), new Date(2026, 5, 1, 0, 5))).toBe(2);
    });

    it('service_date(멱등 키)는 배치 시각의 로컬 날짜', () => {
      expect(toServiceDate(batchNow)).toBe('2026-06-08');
    });
  });

  // ── ③ 데이터 무결성: 스캔 필터(완료/기한없음 제외) ──────────────
  describe('③ 스캔 필터', () => {
    it('SELECT 는 미완료(COMPLETED/ARCHIVED 제외) + deadline 존재 + 과거만 본다', async () => {
      const dbPoolMock = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      const scheduler = new OverdueNotificationScheduler(dbPoolMock as any);
      await scheduler.runDailyScan(new Date(2026, 5, 8, 0, 5));

      const sql: string = dbPoolMock.query.mock.calls[0][0];
      expect(sql).toMatch(/status NOT IN \('COMPLETED', 'ARCHIVED'\)/); // 23:59:59 완료분 제외
      expect(sql).toMatch(/deadline IS NOT NULL/);                       // 기한 없는 할 일 제외
      expect(sql).toMatch(/deadline < \$1/);                             // 오늘 이전만
    });
  });

  // ── ① 자정 2번 발생 / 배치 재실행 → 멱등 ──────────────────────
  describe('① 멱등성(자정 중복/재실행)', () => {
    it('같은 service_date 로 두 번 실행 → 2번째는 inserted=false → 중복 push 없음', async () => {
      const task = { task_id: 1, user_id: 1, title: '운동', deadline: new Date(2026, 5, 6, 9, 0) };
      const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined), emitUnreadCount: jest.fn() };
      const dbPoolMock = { query: jest.fn() };
      const scheduler = new OverdueNotificationScheduler(dbPoolMock as any, dispatcher as any);
      const now = new Date(2026, 5, 8, 0, 5);

      // run #1 — 신규 삽입(inserted=true)
      dbPoolMock.query
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [{ id: 'a', task_id: 1, user_id: 1, type: 'OVERDUE_2DAY', overdue_days: 2, message: 'm', created_at: now, inserted: true }] });
      const r1 = await scheduler.runDailyScan(now);

      // run #2 — 같은 날 재실행, 충돌 갱신(inserted=false)
      dbPoolMock.query
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [{ id: 'a', inserted: false }] });
      const r2 = await scheduler.runDailyScan(now);

      expect(r1.created).toBe(1);
      expect(r2.created).toBe(0);
      expect(r2.skipped).toBe(1);
      expect(dispatcher.dispatch).toHaveBeenCalledTimes(1); // 중복 토스트 없음
    });
  });

  // ── ② 한국어 조사 경계 ────────────────────────────────────────
  describe('② 조사(이/가, 을/를) 경계', () => {
    it('받침 유무에 따라 자동 선택', () => {
      expect(generateNotificationMessage('보고서', 1)).toContain('보고서가'); // 무받침
      expect(generateNotificationMessage('운동', 1)).toContain('운동이');     // 받침
      expect(generateNotificationMessage('책', 3)).toContain('책을');         // 받침(목적격)
      expect(generateNotificationMessage('사과', 3)).toContain('사과를');     // 무받침(목적격)
    });
  });

  // ── ① TZ/DST 경계 (T3/T4) — 러너 TZ와 무관하도록 UTC 순간 + 명시 TZ 로 검증 ──
  describe('① TZ/DST 경계 (T3/T4)', () => {
    // 동일 순간: 마감 06-07 23:59 KST(=14:59Z), 지금 06-08 00:05 KST(=15:05Z)
    const deadlineKstYesterday = new Date('2026-06-07T14:59:00Z');
    const nowKstJustAfterMidnight = new Date('2026-06-07T15:05:00Z');

    it('KST 기준: 어제 마감 → 1일, service_date = 오늘(KST)', () => {
      expect(computeOverdueDays(deadlineKstYesterday, nowKstJustAfterMidnight, 'Asia/Seoul')).toBe(1);
      expect(toServiceDate(nowKstJustAfterMidnight, 'Asia/Seoul')).toBe('2026-06-08');
    });

    it('같은 순간을 UTC 로 계산하면 둘 다 06-07 → 0 (TZ 미적용 시 경계 오분류 = 버그 재현)', () => {
      expect(computeOverdueDays(deadlineKstYesterday, nowKstJustAfterMidnight, 'UTC')).toBe(0);
      expect(toServiceDate(nowKstJustAfterMidnight, 'UTC')).toBe('2026-06-07');
    });

    it('DST: America/New_York 봄 전환 주간에도 달력 일수 정확(2일)', () => {
      const deadline = new Date('2026-03-07T12:00:00-05:00'); // EST
      const now = new Date('2026-03-09T00:30:00-04:00');       // EDT(전환 후)
      expect(computeOverdueDays(deadline, now, 'America/New_York')).toBe(2);
    });

    it('스케줄러는 주입된 TZ 로 일수/service_date 를 계산한다', async () => {
      const task = { task_id: 7, user_id: 1, title: '운동', deadline: deadlineKstYesterday };
      const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined), emitUnreadCount: jest.fn() };
      const captured: any[] = [];
      const dbPoolMock = {
        query: jest.fn().mockImplementation((sql: string, params: any[]) => {
          if (sql.includes('SELECT')) return Promise.resolve({ rows: [task] });
          captured.push(params); // INSERT params
          return Promise.resolve({ rows: [{ id: 'x', task_id: 7, user_id: 1, type: 'OVERDUE_1DAY', overdue_days: 1, message: 'm', created_at: new Date(), inserted: true }] });
        }),
      };
      const scheduler = new OverdueNotificationScheduler(dbPoolMock as any, dispatcher as any, 'Asia/Seoul');
      await scheduler.runDailyScan(nowKstJustAfterMidnight);
      // INSERT params: [task_id, user_id, type, overdue_days, message, service_date]
      expect(captured[0][3]).toBe(1);            // overdue_days(KST)
      expect(captured[0][5]).toBe('2026-06-08'); // service_date(KST)
    });
  });

  // ── ④ 페이지네이션 (T15) — 키셋 커서 ──────────────────────────
  describe('④ 페이지네이션(T15)', () => {
    it('기본: limit=50, cursor 없음 → created_at 조건 없음', () => {
      const { sql, params, limit } = buildNotificationsListQuery({ userId: 1 });
      expect(limit).toBe(DEFAULT_LIMIT);
      expect(params).toEqual([1, 50]);
      expect(sql).not.toMatch(/created_at < /);
      expect(sql).toMatch(/ORDER BY created_at DESC/);
    });

    it('unread=true → is_read=FALSE 조건 추가', () => {
      const { sql } = buildNotificationsListQuery({ userId: 1, unreadOnly: true });
      expect(sql).toMatch(/is_read = FALSE/);
    });

    it('cursor 지정 → created_at < $n 키셋 조건 + 파라미터 순서', () => {
      const cur = '2026-06-08T00:00:00.000Z';
      const { sql, params } = buildNotificationsListQuery({ userId: 1, cursor: cur, limit: 20 });
      expect(sql).toMatch(/created_at < \$2/);
      expect(params).toEqual([1, cur, 20]);
    });

    it('limit 클램프: 999 → 100', () => {
      expect(buildNotificationsListQuery({ userId: 1, limit: 999 }).limit).toBe(100);
    });

    it('nextCursorOf: 가득 차면 마지막 created_at, 덜 차면 null', () => {
      const rows = [{ created_at: '2026-06-08T03:00:00.000Z' }, { created_at: '2026-06-08T02:00:00.000Z' }];
      expect(nextCursorOf(rows, 2)).toBe('2026-06-08T02:00:00.000Z'); // limit 만큼 채움 → 더 있음
      expect(nextCursorOf(rows, 5)).toBeNull();                       // 덜 채움 → 마지막 페이지
    });
  });
});
