package com.example.priority;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 가중치 변경 감사 로그.
 *
 * 자동 학습/리셋이 W1·W2·W3를 언제·왜·얼마나 바꿨는지 남겨, "왜 추천 순서가 달라졌나"를
 * 추적·되돌리기·디버깅할 수 있게 한다(거버넌스).
 */
@Entity
@Table(name = "weight_change_logs")
public class WeightChangeLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private double oldW1;
    private double oldW2;
    private double oldW3;
    private double newW1;
    private double newW2;
    private double newW3;
    /** 변경 사유: AVOIDER_BOOST / MASTER_RECOVER / RESET 등. */
    private String reason;
    private LocalDateTime changedAt;

    public WeightChangeLog() {
    }

    public WeightChangeLog(Long userId,
                           double oldW1, double oldW2, double oldW3,
                           double newW1, double newW2, double newW3,
                           String reason, LocalDateTime changedAt) {
        this.userId = userId;
        this.oldW1 = oldW1;
        this.oldW2 = oldW2;
        this.oldW3 = oldW3;
        this.newW1 = newW1;
        this.newW2 = newW2;
        this.newW3 = newW3;
        this.reason = reason;
        this.changedAt = changedAt;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public double getOldW1() {
        return oldW1;
    }

    public double getOldW2() {
        return oldW2;
    }

    public double getOldW3() {
        return oldW3;
    }

    public double getNewW1() {
        return newW1;
    }

    public double getNewW2() {
        return newW2;
    }

    public double getNewW3() {
        return newW3;
    }

    public String getReason() {
        return reason;
    }

    public LocalDateTime getChangedAt() {
        return changedAt;
    }
}
