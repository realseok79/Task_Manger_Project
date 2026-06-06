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
        return explain(task, profile).total();
    }

    /**
     * 점수를 요소별 기여분으로 분해한다(설명가능성). 각 요소를 0~1로 정규화한 뒤 가중치를 적용.
     * 정규화로 세 요소가 동일 스케일(0~1)에서 가중치만큼 경쟁하며, W1+W2+W3=1.0 전제와 일치한다.
     */
    @Override
    public ScoreBreakdown explain(Task task, UserProfile profile) {
        if (task == null || profile == null) {
            return new ScoreBreakdown(0.0, 0.0, 0.0, 0.0);
        }
        double importanceNorm = clampUnit(task.getStarRating() / MAX_STAR_RATING);
        // 마감 있으면 시간 기반, 없으면 방치(aging) 기반 긴급도 → 무마감 작업이 0으로 가라앉지 않음
        double urgencyNorm = urgencyEvaluator.factor(task); // null-safe, 0~1, 단일 진실
        double delayNorm = clampUnit(task.getDelayCount() / DELAY_PENALTY_CAP);

        double importance = profile.getW1() * importanceNorm;
        double urgency = profile.getW2() * urgencyNorm;
        double delayPenalty = profile.getW3() * delayNorm;
        double total = Math.max(0.0, importance + urgency - delayPenalty); // 하한선 0.0

        return new ScoreBreakdown(importance, urgency, delayPenalty, total);
    }

    private static double clampUnit(double value) {
        return Math.max(0.0, Math.min(1.0, value));
    }
}
