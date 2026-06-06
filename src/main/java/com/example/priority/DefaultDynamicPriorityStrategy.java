package com.example.priority;

import org.springframework.stereotype.Component;

@Component
public class DefaultDynamicPriorityStrategy implements PriorityStrategy {

    static final double MAX_STAR_RATING = 5.0;
    /** delayCount가 이 값 이상이면 지연 페널티 최대(1.0). 좀비 임계값과 동일. */
    static final double DELAY_PENALTY_CAP = 5.0;

    private final UrgencyEvaluator urgencyEvaluator;

    public DefaultDynamicPriorityStrategy(UrgencyEvaluator urgencyEvaluator) {
        this.urgencyEvaluator = urgencyEvaluator;
    }

    @Override
    public double calculate(Task task, UserProfile profile) {
        if (task == null || profile == null) {
            return 0.0;
        }

        // 각 요소를 0~1로 정규화한 뒤 가중치를 적용한다.
        // 기존 공식은 중요도(starRating*W1)와 긴급도(W2/(dt+K))의 스케일이 크게 달라
        // 긴급도가 사실상 무시됐고, W1+W2+W3=1.0을 전제하는 AdaptiveWeightEngine과도 어긋났다.
        // 정규화로 세 요소가 동일 스케일(0~1)에서 가중치만큼 경쟁하게 만든다.
        double importanceNorm = clampUnit(task.getStarRating() / MAX_STAR_RATING);
        // 마감 있으면 시간 기반, 없으면 방치(aging) 기반 긴급도 → 무마감 작업이 0으로 가라앉지 않음
        double urgencyNorm = urgencyEvaluator.factor(task); // null-safe, 0~1, 단일 진실
        double delayNorm = clampUnit(task.getDelayCount() / DELAY_PENALTY_CAP);

        double score = profile.getW1() * importanceNorm
                     + profile.getW2() * urgencyNorm
                     - profile.getW3() * delayNorm;

        // 하한선 0.0 (음수 방지)
        return Math.max(0.0, score);
    }

    private static double clampUnit(double value) {
        return Math.max(0.0, Math.min(1.0, value));
    }
}
