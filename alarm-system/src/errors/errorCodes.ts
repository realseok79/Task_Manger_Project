/**
 * 도메인 에러 정의 — HTTP status + 안정적 error code + 사용자 메시지(+부가 데이터).
 * 라우터는 AppError 를 catch 하여 { error, message, ...extra } 로 직렬화한다.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return { status: this.status, error: this.code, message: this.message, ...this.extra };
  }
}

// 소요시간 제약: 최소 1분(60s) ~ 최대 23시간 59분(86340s)
export const MIN_DURATION_SEC = 60;
export const MAX_DURATION_SEC = 86_340;

export const Errors = {
  durationRequired: () =>
    new AppError(400, 'DURATION_REQUIRED', '소요시간을 설정해주세요 (최소 1분)'),

  durationOutOfRange: () =>
    new AppError(
      400,
      'DURATION_OUT_OF_RANGE',
      '소요시간은 최소 1분(60초)에서 최대 23시간 59분(86340초) 사이여야 합니다.'
    ),

  insufficientAvailableTime: (remainingSeconds: number, requestedSeconds: number) =>
    new AppError(409, 'INSUFFICIENT_AVAILABLE_TIME', '당신에게 남은 가용시간이 부족합니다', {
      remaining_seconds: remainingSeconds,
      requested_seconds: requestedSeconds,
    }),

  availableBelowAllocated: (allocatedSeconds: number) =>
    new AppError(
      400,
      'AVAILABLE_BELOW_ALLOCATED',
      '이미 할당된 작업 시간보다 작게 설정할 수 없습니다.',
      { allocated_seconds: allocatedSeconds }
    ),

  invalidElapsed: () =>
    new AppError(400, 'INVALID_ELAPSED', 'elapsed_time 은 0 이상의 정수(초)여야 합니다.'),

  invalidAvailable: () =>
    new AppError(400, 'INVALID_AVAILABLE', 'available_seconds 는 0 이상의 정수(초)여야 합니다.'),

  taskNotFound: () => new AppError(404, 'TASK_NOT_FOUND', '작업을 찾을 수 없습니다.'),

  forbidden: () => new AppError(403, 'FORBIDDEN', '권한이 없습니다.'),

  priorityTaskExists: (existing: { id: number; title: string }) =>
    new AppError(409, 'PRIORITY_TASK_EXISTS', '최우선 과제가 이미 존재합니다!!', { existing_task: existing }),

  invalidTransition: (message: string) =>
    new AppError(400, 'INVALID_TRANSITION', message),

  validation: (message: string) => new AppError(400, 'VALIDATION', message),
};
