import { Queue, Job } from 'bullmq';
import { Task } from '../types/alarm';

export class AlarmScheduler {
  private alarmQueue: Queue;

  constructor(alarmQueue: Queue) {
    this.alarmQueue = alarmQueue;
  }

  /**
   * Schedules a delayed job for a task's 5-minute remaining alarm.
   * Ensures idempotency: Cancels any existing job for the same task before scheduling.
   * Retries up to 3 times with exponential backoff (1s, 2s, 4s) if enqueuing fails.
   */
  public async scheduleAlarm(task: Task): Promise<void> {
    const jobId = this.getJobId(task.task_id);

    // Calculate delay: (deadline - 5 minutes) - current_time
    const deadlineMs = new Date(task.deadline).getTime();
    const targetMs = deadlineMs - 5 * 60 * 1000; // 5 minutes (300,000ms) before deadline
    const delay = targetMs - Date.now();

    // If deadline is already in the past or less than 5 minutes away,
    // we can either trigger the alarm immediately (delay = 0) or choose to skip it.
    // In this implementation, if it's within 5 minutes but still in the future, we fire immediately.
    // If it's already past the deadline, we skip it.
    if (deadlineMs <= Date.now()) {
      console.log(`[Scheduler] Skipping alarm for task ${task.task_id} as deadline is in the past.`);
      await this.cancelAlarm(task.task_id);
      return;
    }

    const finalDelay = Math.max(0, delay);

    // Cancel existing alarm if any
    await this.cancelAlarm(task.task_id);

    // Enqueue with retry and exponential backoff (1s, 2s, 4s)
    let attempt = 0;
    const maxRetries = 3;
    const backoffTimes = [1000, 2000, 4000];

    while (attempt <= maxRetries) {
      try {
        await this.alarmQueue.add(
          'trigger-alarm',
          {
            task_id: task.task_id,
            user_id: task.user_id,
            title: task.title,
            deadline: task.deadline,
            is_deferred: task.is_deferred,
            deferred_count: task.deferred_count,
          },
          {
            jobId,
            delay: finalDelay,
            removeOnComplete: true,
            removeOnFail: true,
          }
        );
        console.log(`[Scheduler] Successfully scheduled alarm job ${jobId} with delay ${finalDelay}ms`);
        return;
      } catch (error) {
        attempt++;
        if (attempt > maxRetries) {
          console.error(`[Scheduler] Failed to enqueue job ${jobId} after ${maxRetries} retries:`, error);
          throw error;
        }
        const waitTime = backoffTimes[attempt - 1];
        console.warn(`[Scheduler] Enqueue failed for job ${jobId}. Retrying in ${waitTime}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Cancels a scheduled alarm job for a given task ID.
   */
  public async cancelAlarm(taskId: number): Promise<void> {
    const jobId = this.getJobId(taskId);
    try {
      const job = await this.alarmQueue.getJob(jobId);
      if (job) {
        await job.remove();
        console.log(`[Scheduler] Removed existing alarm job ${jobId}`);
      }
    } catch (error) {
      console.error(`[Scheduler] Error removing job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Generates a unique, deterministic job ID for a task to guarantee idempotency.
   */
  private getJobId(taskId: number): string {
    return `alarm:task:${taskId}`;
  }
}
