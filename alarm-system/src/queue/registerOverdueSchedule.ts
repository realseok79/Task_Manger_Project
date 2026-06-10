import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import {
  OverdueNotificationScheduler,
  OVERDUE_CRON,
  OVERDUE_QUEUE_NAME,
  OVERDUE_JOB_NAME,
} from './overdueNotificationScheduler';

/**
 * BullMQ 반복(cron) 잡 + 워커 등록. (스케줄링은 job queue 방식)
 *
 * 인프라(BullMQ) 의존을 코어 로직에서 분리하기 위해 별도 파일로 둔다 — 테스트는 코어만 import.
 * 동일 cron 잡은 고정 jobId 로 단일화한다(중복 등록 방지).
 */
export function registerOverdueSchedule(
  scheduler: OverdueNotificationScheduler,
  connection: Redis
): { queue: Queue; worker: Worker } {
  const queue = new Queue(OVERDUE_QUEUE_NAME, { connection: connection as never });

  queue
    .add(OVERDUE_JOB_NAME, {}, {
      repeat: { pattern: OVERDUE_CRON },
      jobId: 'overdue-daily',
      removeOnComplete: true,
      removeOnFail: 100,
    })
    .then(() => console.log(`[OverdueScheduler] repeatable job registered (cron="${OVERDUE_CRON}")`))
    .catch((e) => console.error('[OverdueScheduler] failed to register repeatable job:', e));

  const worker = new Worker(
    OVERDUE_QUEUE_NAME,
    async () => {
      const result = await scheduler.runDailyScan(new Date());
      console.log('[OverdueScheduler] scan complete:', result);
      return result;
    },
    { connection: connection as never }
  );
  worker.on('failed', (_job, err) => console.error('[OverdueScheduler] job failed:', err));

  return { queue, worker };
}
