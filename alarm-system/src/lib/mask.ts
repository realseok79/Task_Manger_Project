/**
 * 로그용 PII 마스킹 — 배치/에러 로그, Slack 알림에 user_id·Task 제목 원문이 남지 않게 한다.
 * (OWASP A09: Security Logging & Monitoring Failures / 개인정보 최소화)
 */

/** 1 → '*', 42 → '4*', 12345 → '1***5' */
export function maskUserId(userId: number | string): string {
  const s = String(userId);
  if (s.length <= 1) return '*';
  if (s.length === 2) return `${s[0]}*`;
  return `${s[0]}${'*'.repeat(s.length - 2)}${s[s.length - 1]}`;
}

/** '기말 보고서' → '기…(5자)'. 제목 원문 대신 첫 글자 + 길이만 남긴다. */
export function maskTitle(title: string | null | undefined): string {
  if (!title) return '∅';
  const t = String(title);
  return `${t[0]}…(${t.length}자)`;
}

/** 로그 한 줄로 합치기 편한 헬퍼. */
export function maskedTaskRef(userId: number | string, title?: string | null): string {
  return `user=${maskUserId(userId)} task="${maskTitle(title)}"`;
}
