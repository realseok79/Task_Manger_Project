/**
 * 밀린 일수(overdue_days) 계산 유틸 — 타임존 인식(T3/T4).
 *
 * 명세 공식: floor((오늘 00:00 - due_date) / 86400) 의 "달력 일수" 버전.
 * timeZone 을 주면 해당 TZ 의 달력 날짜로 계산한다(서버 UTC vs 사용자 KST 불일치/ DST 안전).
 * timeZone 미지정 시에는 서버 로컬 자정 기준(하위 호환).
 *
 * (실제 tasks 컬럼명은 due_date 가 아니라 deadline 이라 그 값을 넘긴다.)
 */

/** Intl 로 특정 TZ 의 'YYYY-MM-DD' 키를 얻는다(시각/DST 영향 없이 날짜만). */
function dateKeyInTZ(date: Date, timeZone: string): string {
  // en-CA 로케일은 YYYY-MM-DD 형식을 보장한다.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** 'YYYY-MM-DD' → epoch day number(UTC 기준 일 단위). 두 날짜 키의 차이를 일수로 만든다. */
function epochDayFromKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** 서버 로컬 자정(ms) — timeZone 미지정 시 폴백. */
function localMidnightMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * 밀린 일수. 오늘 마감(아직 안 지남)=0, 어제=1, 그제=2 ...
 * @param timeZone IANA TZ(예: 'Asia/Seoul'). 주면 그 TZ 달력 기준으로 계산(권장).
 */
export function computeOverdueDays(deadlineIso: string | Date, now: Date = new Date(), timeZone?: string): number {
  const deadline = deadlineIso instanceof Date ? deadlineIso : new Date(deadlineIso);
  if (timeZone) {
    return epochDayFromKey(dateKeyInTZ(now, timeZone)) - epochDayFromKey(dateKeyInTZ(deadline, timeZone));
  }
  return Math.floor((localMidnightMs(now) - localMidnightMs(deadline)) / 86_400_000);
}

/** 배치 기준일(YYYY-MM-DD). timeZone 주면 그 TZ 의 오늘 날짜(멱등 키 service_date). */
export function toServiceDate(now: Date = new Date(), timeZone?: string): string {
  if (timeZone) return dateKeyInTZ(now, timeZone);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
