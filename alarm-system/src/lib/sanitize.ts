/**
 * 입력 sanitization — 저장형 XSS(OWASP A03: Injection) 방어.
 *
 * Task 제목이 알림 message 에 박혀 여러 클라이언트(React, 그리고 innerHTML 을 쓰는 레거시
 * AlarmManager 토스트)로 렌더된다. React 는 출력 시 자동 이스케이프하지만, innerHTML 경로와
 * 다른 소비자(이메일/푸시)를 위해 입력 시점에 HTML/제어문자를 제거하는 defense-in-depth 를 둔다.
 */

const MAX_TITLE_LEN = 255;
const HTML_TAGS = /<[^>]*>/g;
// 제어문자(C0 0x00-0x1F + DEL 0x7F): 로그 인젝션/CRLF, 화면 깨짐 방지 (리터럴 제어문자 회피 위해 RegExp 생성)
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
const ANGLE_BRACKETS = /[<>]/g;

export function sanitizeTitle(raw: unknown, maxLen: number = MAX_TITLE_LEN): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(HTML_TAGS, '')        // <script>...</script>, <img onerror=...> 등 태그 제거
    .replace(CONTROL_CHARS, '')
    .replace(ANGLE_BRACKETS, '')   // 잔여 꺾쇠 제거
    .trim()
    .slice(0, maxLen);
}
