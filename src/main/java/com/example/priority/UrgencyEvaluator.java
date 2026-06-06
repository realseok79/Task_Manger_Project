package com.example.priority;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.OptionalLong;

/**
 * 마감 긴급도의 단일 진실(single source of truth).
 *
 * 점수 공식({@link DefaultDynamicPriorityStrategy})과 응답 색상({@link TaskResponseMapper})이
 * 서로 다른 기준으로 긴급도를 계산해 어긋나던 문제를 막기 위해, 0~1로 정규화된 긴급도(factor)와
 * 색 등급(level)을 한 곳에서 계산한다. 또한 주입된 {@link Clock}을 단일 시간원으로 사용해
 * 결정론적으로 테스트할 수 있다.
 *
 * <pre>
 *   factor(dt) = HALF_LIFE / (max(dt, 0) + HALF_LIFE)
 *     - 마감 정시/경과(dt &lt;= 0) → 1.0 (최대 긴급)
 *     - dt = HALF_LIFE          → 0.5
 *     - 마감 없음               → 0.0
 * </pre>
 */
@Component
public class UrgencyEvaluator {

    /** factor가 0.5가 되는 남은 시간(분). 이 시점에서 긴급도 절반. */
    static final double HALF_LIFE_MINUTES = 120.0;
    static final double RED_THRESHOLD = 0.66;
    static final double YELLOW_THRESHOLD = 0.33;
    /** 마감 없는 작업의 방치 긴급도가 0.5가 되는 delayCount(연기 횟수). */
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

    /** 마감까지 남은 분. 마감이 없으면 비어 있음(empty). */
    public OptionalLong minutesUntilDeadline(LocalDateTime dueDate) {
        if (dueDate == null) {
            return OptionalLong.empty();
        }
        return OptionalLong.of(ChronoUnit.MINUTES.between(LocalDateTime.now(clock), dueDate));
    }

    /** 0.0(여유/마감없음) ~ 1.0(임박/경과)로 정규화된 긴급도. */
    public double factor(LocalDateTime dueDate) {
        OptionalLong minutes = minutesUntilDeadline(dueDate);
        if (minutes.isEmpty()) {
            return 0.0;
        }
        double safe = Math.max(minutes.getAsLong(), 0.0);
        return HALF_LIFE_MINUTES / (safe + HALF_LIFE_MINUTES);
    }

    /** 색 등급(RED/YELLOW/GREEN/NONE). 점수의 긴급도(factor)와 동일 기준에서 파생된다. */
    public String level(LocalDateTime dueDate) {
        if (dueDate == null) {
            return NONE; // 마감 없는 작업을 GREEN(=안전)으로 위장하지 않는다.
        }
        double f = factor(dueDate);
        if (f >= RED_THRESHOLD) {
            return RED;
        }
        if (f >= YELLOW_THRESHOLD) {
            return YELLOW;
        }
        return GREEN;
    }

    // ── Task 기준 단일 진입점 (마감 있으면 시간, 없으면 방치) ──────────────

    /**
     * 작업의 긴급도(0~1). 마감이 있으면 시간 기반, 없으면 방치(aging) 기반으로 계산해
     * 마감 없는 작업이 영영 0으로 가라앉지 않게 한다(미루면 가라앉는 death-spiral 완화).
     */
    public double factor(Task task) {
        if (task.getDueDate() != null) {
            return factor(task.getDueDate());
        }
        return agingFactor(task.getDelayCount());
    }

    /** 색 등급. 마감 없는 작업은 방치가 누적되면 NONE → STALE로 승격(점수의 긴급도와 동일 기준). */
    public String level(Task task) {
        if (task.getDueDate() != null) {
            return level(task.getDueDate());
        }
        return agingFactor(task.getDelayCount()) >= YELLOW_THRESHOLD ? STALE : NONE;
    }

    /** 마감 없는 작업의 방치 긴급도: 연기 횟수가 쌓일수록 0 → 1로 증가(delayCount=AGING_HALF_LIFE에서 0.5). */
    public double agingFactor(int delayCount) {
        if (delayCount <= 0) {
            return 0.0;
        }
        return delayCount / (delayCount + AGING_HALF_LIFE);
    }
}
