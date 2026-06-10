import {
  hasBatchim,
  subjectParticle,
  objectParticle,
  generateNotificationMessage,
  notificationTypeFor,
  buildOverdueNotification,
} from '../src/notifications/messages';
import { computeOverdueDays, toServiceDate } from '../src/notifications/overdue';
import { OverdueNotificationScheduler } from '../src/queue/overdueNotificationScheduler';

describe('Overdue Notification System', () => {
  // =========================================================================
  // 1. 한국어 조사 처리
  // =========================================================================
  describe('Korean particle (조사) handling', () => {
    it('detects 받침 on Hangul / digits correctly', () => {
      expect(hasBatchim('운동')).toBe(true);   // 동 → ㅇ 받침
      expect(hasBatchim('보고서')).toBe(false); // 서 → 무받침
      expect(hasBatchim('책')).toBe(true);     // 책 → ㄱ 받침
      expect(hasBatchim('사과')).toBe(false);   // 과 → 무받침
      expect(hasBatchim('1')).toBe(true);      // 일 → ㄹ
      expect(hasBatchim('2')).toBe(false);     // 이 → 무받침
    });

    it('picks 이/가 and 을/를 by 받침', () => {
      expect(subjectParticle('운동')).toBe('이');
      expect(subjectParticle('보고서')).toBe('가');
      expect(objectParticle('책')).toBe('을');
      expect(objectParticle('사과')).toBe('를');
    });
  });

  // =========================================================================
  // 2. generateNotificationMessage
  // =========================================================================
  describe('generateNotificationMessage', () => {
    it('1일 → 하루 미뤄짐 (주격 조사 자동)', () => {
      expect(generateNotificationMessage('운동', 1)).toBe('운동이 하루 미뤄졌습니다.');
      expect(generateNotificationMessage('보고서', 1)).toBe('보고서가 하루 미뤄졌습니다.');
    });

    it('2일 → 이틀 지남', () => {
      expect(generateNotificationMessage('운동', 2)).toBe('운동이 이틀 지났습니다.');
    });

    it('3일+ → 삭제 확인 (목적격 조사 자동)', () => {
      expect(generateNotificationMessage('책', 3)).toBe('책을 투두리스트에서 없앨까요?');
      expect(generateNotificationMessage('사과', 5)).toBe('사과를 투두리스트에서 없앨까요?');
    });

    it('0 이하 → 빈 문자열(알림 없음)', () => {
      expect(generateNotificationMessage('운동', 0)).toBe('');
    });

    it('notificationTypeFor / buildOverdueNotification', () => {
      expect(notificationTypeFor(1)).toBe('OVERDUE_1DAY');
      expect(notificationTypeFor(2)).toBe('OVERDUE_2DAY');
      expect(notificationTypeFor(3)).toBe('DELETE_CONFIRM');
      expect(notificationTypeFor(0)).toBe('INFO');
      expect(buildOverdueNotification('운동', 0)).toBeNull();
      expect(buildOverdueNotification('책', 3)).toEqual({
        message: '책을 투두리스트에서 없앨까요?',
        type: 'DELETE_CONFIRM',
      });
    });
  });

  // =========================================================================
  // 3. computeOverdueDays (달력 일수)
  // =========================================================================
  describe('computeOverdueDays', () => {
    const now = new Date(2026, 5, 8, 0, 5, 0); // 2026-06-08 00:05 (자정+5분)

    it('어제 마감 = 1일, 그제 = 2일, 5일 전 = 5일', () => {
      expect(computeOverdueDays(new Date(2026, 5, 7, 23, 0), now)).toBe(1);
      expect(computeOverdueDays(new Date(2026, 5, 6, 9, 0), now)).toBe(2);
      expect(computeOverdueDays(new Date(2026, 5, 3, 12, 0), now)).toBe(5);
    });

    it('오늘 마감(아직 안 지남) = 0', () => {
      expect(computeOverdueDays(new Date(2026, 5, 8, 9, 0), now)).toBe(0);
    });

    it('toServiceDate → YYYY-MM-DD', () => {
      expect(toServiceDate(now)).toBe('2026-06-08');
    });
  });

  // =========================================================================
  // 4. 스케줄러 멱등성 & 회복탄력성
  // =========================================================================
  describe('OverdueNotificationScheduler.runDailyScan', () => {
    const now = new Date(2026, 5, 8, 0, 5, 0);
    const twoDaysAgo = new Date(2026, 5, 6, 9, 0);
    const task = { task_id: 101, user_id: 1, title: '운동', deadline: twoDaysAgo };
    const notifRow = {
      id: 'uuid-1',
      task_id: 101,
      user_id: 1,
      type: 'OVERDUE_2DAY',
      overdue_days: 2,
      message: '운동이 이틀 지났습니다.',
      created_at: now,
      inserted: true, // (xmax = 0) → 신규 삽입
    };

    let dbPoolMock: { query: jest.Mock };
    let dispatcherMock: { dispatch: jest.Mock; emitUnreadCount: jest.Mock };

    beforeEach(() => {
      jest.clearAllMocks();
      dbPoolMock = { query: jest.fn() };
      dispatcherMock = { dispatch: jest.fn().mockResolvedValue(undefined), emitUnreadCount: jest.fn() };
    });

    it('새 밀린 Task → 알림 1건 생성 + 실시간 push 1회', async () => {
      dbPoolMock.query
        .mockResolvedValueOnce({ rows: [task] } as any)      // SELECT tasks
        .mockResolvedValueOnce({ rows: [notifRow] } as any); // INSERT ... RETURNING (created)

      const scheduler = new OverdueNotificationScheduler(dbPoolMock as any, dispatcherMock as any);
      const result = await scheduler.runDailyScan(now);

      expect(result).toMatchObject({ scanned: 1, created: 1, skipped: 0, failed: 0 });
      expect(dispatcherMock.dispatch).toHaveBeenCalledTimes(1);
      expect(dispatcherMock.dispatch).toHaveBeenCalledWith(1, expect.objectContaining({ task_id: 101, overdue_days: 2 }));
    });

    it('멱등성: 같은 날 재실행 → ON CONFLICT DO UPDATE(inserted=false) → 중복 생성/푸시 없음', async () => {
      dbPoolMock.query
        .mockResolvedValueOnce({ rows: [task] } as any)                        // SELECT tasks
        .mockResolvedValueOnce({ rows: [{ ...notifRow, inserted: false }] } as any); // UPSERT → 갱신만

      const scheduler = new OverdueNotificationScheduler(dbPoolMock as any, dispatcherMock as any);
      const result = await scheduler.runDailyScan(now);

      expect(result).toMatchObject({ scanned: 1, created: 0, skipped: 1 });
      expect(dispatcherMock.dispatch).not.toHaveBeenCalled();
    });

    it('회복탄력성: 한 건 실패해도 배치는 계속 진행한다', async () => {
      const task2 = { task_id: 102, user_id: 2, title: '책', deadline: new Date(2026, 5, 4) }; // 4일 전 → 3일+
      dbPoolMock.query
        .mockResolvedValueOnce({ rows: [task, task2] } as any) // SELECT tasks
        .mockRejectedValueOnce(new Error('insert failed'))      // UPSERT task → 실패
        .mockResolvedValueOnce({ rows: [{ ...notifRow, id: 'uuid-2', task_id: 102, user_id: 2, inserted: true }] } as any); // UPSERT task2 → 성공

      const scheduler = new OverdueNotificationScheduler(dbPoolMock as any, dispatcherMock as any);
      const result = await scheduler.runDailyScan(now);

      expect(result).toMatchObject({ scanned: 2, created: 1, failed: 1 });
      expect(dispatcherMock.dispatch).toHaveBeenCalledTimes(1);
    });
  });
});
