package com.example.priority;

/**
 * 우선순위 점수의 요소별 기여분(설명가능성).
 * total = max(0, importance + urgency - delayPenalty).
 */
public record ScoreBreakdown(double importance, double urgency, double delayPenalty, double total) {
}
