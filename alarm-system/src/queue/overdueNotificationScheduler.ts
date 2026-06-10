import { Pool } from 'pg';
import { buildOverdueNotification } from '../notifications/messages';
import { computeOverdueDays, toServiceDate } from '../notifications/overdue';
import { NotificationDispatcher } from '../realtime/notificationDispatcher';

/** 매일 00:05 (자정 + 5분 버퍼). BullMQ 반복 잡 cron 패턴. */
export const OVERDUE_CRON = '5 0 * * *';
export const OVERDUE_QUEUE_NAME = 'overdue-notifications';
export const OVERDUE_JOB_NAME = 'overdue-scan';
const BATCH_SIZE = 500; // 100만 사용자 확장 대비 keyset 페이지네이션 배치 크기

export interface ScanResult {
  serviceDate: string;
  scanned: number;
  created: number;
  skipped: number; // 알림 대상 아님 또는 이미 오늘 생성됨(멱등)
  failed: number;
}

/**
 * 밀린 Task 알림 자정 배치의 "핵심 로직".
 *
 * BullMQ 등 인프라 의존을 분리하기 위해 이 파일은 큐를 import 하지 않는다(단위 테스트 용이).
 * 스케줄링(반복 잡 등록)은 registerOverdueSchedule.ts 가 담당한다.
 *
 * 멱등성:
 *  - overdue_days 를 deadline 에서 "계산"(증분 아님) → 같은 날 몇 번 돌려도 결과 동일.
 *  - notifications(task_id, service_date) UNIQUE + ON CONFLICT DO NOTHING → 중복 생성/중복 push 없음.
 * 회복탄력성:
 *  - keyset 페이지네이션으로 대량 처리, 한 건 실패가 전체 배치를 멈추지 않는다(per-task try/catch).
 */
export class OverdueNotificationScheduler {
  /**
   * @param timeZone 일수/service_date 계산 기준 TZ. 기본은 NOTIF_TIMEZONE env(없으면 Asia/Seoul).
   *   사용자별 TZ가 모델링되면 유저 단위로 넘겨 호출하면 된다(T3/T4).
   */
  constructor(
    private dbPool: Pool,
    private dispatcher?: NotificationDispatcher,
    private timeZone: string = process.env.NOTIF_TIMEZONE || 'Asia/Seoul'
  ) {}

  /**
   * now 를 주입받아 결정론적/테스트 가능.
   * 미완료(deadline 과거) Task 를 훑어 밀린 일수 알림을 멱등 upsert 하고, 새로 생긴 것만 실시간 push.
   */
  async runDailyScan(now: Date = new Date()): Promise<ScanResult> {
    const serviceDate = toServiceDate(now, this.timeZone);

    let cursor = 0;
    let scanned = 0;
    let created = 0;
    let skipped = 0;
    let failed = 0;

    // keyset 페이지네이션: task_id 오름차순으로 전진(인서트가 조건을 바꾸지 않으므로 안전)
    for (;;) {
      const { rows } = await this.dbPool.query(
        `SELECT task_id, user_id, title, deadline
           FROM tasks
          WHERE status NOT IN ('COMPLETED', 'ARCHIVED')
            AND deadline IS NOT NULL
            AND deadline < $1
            AND task_id > $2
          ORDER BY task_id ASC
          LIMIT $3`,
        // 코스 필터는 "현재 시각 이전"으로 넓게 잡고, 정확한 밀린 일수는 TZ 기준 computeOverdueDays 가 판정한다.
        [now.toISOString(), cursor, BATCH_SIZE]
      );

      if (rows.length === 0) break;

      for (const task of rows) {
        cursor = task.task_id;
        scanned++;
        try {
          const overdueDays = computeOverdueDays(task.deadline, now, this.timeZone);
          const built = buildOverdueNotification(task.title, overdueDays);
          if (!built) {
            skipped++;
            continue;
          }

          // 멱등 upsert (Query D): (task_id, service_date) 충돌 시 메시지/일수만 갱신,
          // 읽음/닫음 상태는 보존. (xmax = 0) 이면 이번에 새로 "삽입"된 행 → 그때만 push.
          const upserted = await this.dbPool.query(
            `INSERT INTO notifications (task_id, user_id, type, overdue_days, message, service_date)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (task_id, service_date) DO UPDATE
               SET type = EXCLUDED.type,
                   overdue_days = EXCLUDED.overdue_days,
                   message = EXCLUDED.message
             RETURNING id, task_id, user_id, type, overdue_days, message, created_at, (xmax = 0) AS inserted`,
            [task.task_id, task.user_id, built.type, overdueDays, built.message, serviceDate]
          );

          const n = upserted.rows[0];
          if (n?.inserted) {
            created++;
            // 새로 생성된 알림만 실시간 전달(중복 토스트 방지)
            await this.dispatcher?.dispatch(task.user_id, {
              notification_id: n.id,
              task_id: n.task_id,
              user_id: n.user_id,
              type: n.type,
              overdue_days: n.overdue_days,
              message: n.message,
              created_at: new Date(n.created_at).toISOString(),
            });
          } else {
            skipped++; // 이미 오늘 생성됨(갱신만)
          }
        } catch (error) {
          failed++;
          // 한 건 실패가 전체 배치를 중단시키지 않는다
          console.error(`[OverdueScheduler] task ${task.task_id} failed:`, error);
        }
      }

      if (rows.length < BATCH_SIZE) break;
    }

    return { serviceDate, scanned, created, skipped, failed };
  }
}
