/**
 * 알림 메시지 생성 + 한국어 조사(이/가, 을/를) 자동 처리.
 *
 * 받침 판정: 한글 음절(U+AC00~U+D7A3)은 (코드 - 0xAC00) % 28 의 종성 인덱스가
 * 0이 아니면 받침이 있다. 한글이 아닌 끝글자(숫자/영문)는 발음 기준 휴리스틱을 적용한다.
 */

import { sanitizeTitle } from '../lib/sanitize';

export type NotificationType = 'OVERDUE_1DAY' | 'OVERDUE_2DAY' | 'DELETE_CONFIRM' | 'INFO';

/** 끝 글자에 받침(종성)이 있는지 판정. */
export function hasBatchim(word: string): boolean {
  if (!word) return false;
  const ch = word[word.length - 1];
  const code = ch.charCodeAt(0);

  // 한글 음절: 종성 인덱스 != 0 이면 받침 있음
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0;
  }

  // 숫자: 한국어 발음 끝소리 기준 (0영,1일,3삼,6육,7칠,8팔 → 받침 / 2이,4사,5오,9구 → 무받침)
  if (ch >= '0' && ch <= '9') {
    return ['0', '1', '3', '6', '7', '8'].includes(ch);
  }

  // 그 외(영문 등): 받침 없음으로 간주(가/를). 자연스러운 기본값.
  return false;
}

/** 주격 조사 이/가 */
export function subjectParticle(word: string): string {
  return hasBatchim(word) ? '이' : '가';
}

/** 목적격 조사 을/를 */
export function objectParticle(word: string): string {
  return hasBatchim(word) ? '을' : '를';
}

/**
 * 밀린 일수에 따른 알림 메시지 문자열.
 *  - 1일  → "{title}이(가) 하루 미뤄졌습니다."  (조사 자동)
 *  - 2일  → "{title}이(가) 이틀 지났습니다."    (조사 자동)
 *  - 3일+ → "{title}을(를) 투두리스트에서 없앨까요?" (조사 자동)
 *  - 그 외(0 이하) → 빈 문자열(알림 없음)
 */
export function generateNotificationMessage(taskTitle: string, overdueDays: number): string {
  // 저장형 XSS 방어: 메시지에 박히는 제목을 입력 시점에 sanitize(defense-in-depth).
  const title = sanitizeTitle(taskTitle);
  if (overdueDays === 1) {
    return `${title}${subjectParticle(title)} 하루 미뤄졌습니다.`;
  }
  if (overdueDays === 2) {
    return `${title}${subjectParticle(title)} 이틀 지났습니다.`;
  }
  if (overdueDays >= 3) {
    return `${title}${objectParticle(title)} 투두리스트에서 없앨까요?`;
  }
  return '';
}

/** 밀린 일수 → 알림 타입(ENUM). 1일/2일/3일+ 구분, 그 외는 INFO. */
export function notificationTypeFor(overdueDays: number): NotificationType {
  if (overdueDays >= 3) return 'DELETE_CONFIRM';
  if (overdueDays === 2) return 'OVERDUE_2DAY';
  if (overdueDays === 1) return 'OVERDUE_1DAY';
  return 'INFO';
}

export interface BuiltNotification {
  message: string;
  type: NotificationType;
}

/** 메시지 + 타입을 함께. 알림 대상이 아니면(0 이하) null. */
export function buildOverdueNotification(taskTitle: string, overdueDays: number): BuiltNotification | null {
  if (overdueDays < 1) return null;
  return { message: generateNotificationMessage(taskTitle, overdueDays), type: notificationTypeFor(overdueDays) };
}
