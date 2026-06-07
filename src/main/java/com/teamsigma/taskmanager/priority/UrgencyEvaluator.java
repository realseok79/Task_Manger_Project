package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.Task;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.OptionalLong;

/**
 * 마감 긴급도의 단일 진실(single source of truth).
 *
 * 점수 공식({@link DefaultDynamicPriorityStrategy})과 응답 색상({@link TaskResponseMapper})이
 * 동일 기준의 긴급도를 쓰도록 0~1 정규화 factor와 색 등급 level을 한 곳에서 계산한다.
 * 마감이 없으면 방치(aging) 기반으로 계산해 무마감 작업이 0으로 가라앉지 않게 한다.
 */
@Component
public class UrgencyEvaluator {

    static final double HALF_LIFE_MINUTES = 120.0;
    static final double RED_THRESHOLD = 0.66;
    static final double YELLOW_THRESHOLD = 0.33;
    /** 마감 없는 작업의 방치 긴급도가 0.5가 되는 delayCount. */
    static final double AGING_HALF_LIFE = 5.0;

    static final String RED = "RED";
    static final String YELLOW = "YELLOW";
    static final String GREEN = "GREEN";
    static final String NONE = "NONE";
    static final String STALE = "STALE";

    private final Clock clock;

    public UrgencyEvaluator(Clock clock) {
        this.clock = clock;
    }

    public OptionalLong minutesUntilDeadline(LocalDateTime deadline) {
        if (deadline == null) {
            return OptionalLong.empty();
        }
        return OptionalLong.of(ChronoUnit.MINUTES.between(LocalDateTime.now(clock), deadline));
    }

    /** 0.0(여유/마감없음) ~ 1.0(임박/경과) 정규화 긴급도. */
    public double factor(LocalDateTime deadline) {
        OptionalLong minutes = minutesUntilDeadline(deadline);
        if (minutes.isEmpty()) {
            return 0.0;
        }
        double safe = Math.max(minutes.getAsLong(), 0.0);
        return HALF_LIFE_MINUTES / (safe + HALF_LIFE_MINUTES);
    }

    public String level(LocalDateTime deadline) {
        if (deadline == null) {
            return NONE;
        }
        double f = factor(deadline);
        if (f >= RED_THRESHOLD) {
            return RED;
        }
        if (f >= YELLOW_THRESHOLD) {
            return YELLOW;
        }
        return GREEN;
    }

    // ── Task 단일 진입점 (마감 있으면 시간, 없으면 방치) ──────────────

    public double factor(Task task) {
        if (task.getDeadline() != null) {
            return factor(task.getDeadline());
        }
        return agingFactor(task.getDelayCount());
    }

    public String level(Task task) {
        if (task.getDeadline() != null) {
            return level(task.getDeadline());
        }
        return agingFactor(task.getDelayCount()) >= YELLOW_THRESHOLD ? STALE : NONE;
    }

    /** 마감 없는 작업의 방치 긴급도: 연기 횟수가 쌓일수록 0 → 1. */
    public double agingFactor(int delayCount) {
        if (delayCount <= 0) {
            return 0.0;
        }
        return delayCount / (delayCount + AGING_HALF_LIFE);
    }
}
