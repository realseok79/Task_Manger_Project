package com.teamsigma.taskmanager.domain;

/**
 * 마감 임박도. UI 배지/타이머 색상과 카운트다운 노출 여부를 가르는 표현용 상태다.
 *
 * - CRITICAL    : 60분 이내(또는 마감 초과) → 빨간 배지 + 카운트다운 타이머 노출
 * - WARNING     : 24시간 이내               → 노란 배지
 * - NORMAL      : 24시간 초과               → 초록 배지
 * - NO_DEADLINE : 마감 없음                 → 배지 없음("기한없음")
 */
public enum DeadlineStatus {
    CRITICAL, WARNING, NORMAL, NO_DEADLINE
}
