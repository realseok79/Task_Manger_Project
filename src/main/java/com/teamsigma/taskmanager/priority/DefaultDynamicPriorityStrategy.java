package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.UserProfile;
import org.springframework.stereotype.Component;

@Component
public class DefaultDynamicPriorityStrategy implements PriorityStrategy {

    static final double MAX_IMPORTANCE = 5.0;
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
     * 점수를 요소별 기여분으로 분해(설명가능성). 각 요소를 0~1로 정규화 후 가중치 적용.
     * 기존 공식은 중요도와 긴급도(W2/(dt+10))의 스케일이 달라 긴급도가 사실상 무시됐고
     * W1+W2+W3=1.0 전제와도 어긋났다. 정규화로 세 요소가 동일 스케일에서 가중치만큼 경쟁한다.
     */
    @Override
    public ScoreBreakdown explain(Task task, UserProfile profile) {
        if (task == null || profile == null) {
            return new ScoreBreakdown(0.0, 0.0, 0.0, 0.0);
        }
        double importanceNorm = clampUnit(task.getImportance() / MAX_IMPORTANCE);
        // 마감 있으면 시간 기반, 없으면 방치(aging) 기반 → 무마감 작업이 0으로 가라앉지 않음
        double urgencyNorm = urgencyEvaluator.factor(task);
        // 지연 패널티는 마감 있는 작업에만. 마감 없는 작업은 delayCount가 이미 긴급도(aging)로
        // 양(+)으로 반영되므로, 패널티로 다시 빼면 이중 계상되어 묵은 일이 가라앉는다(UI '묵은 일 표면화'와 모순).
        double delayNorm = task.getDeadline() != null
                ? clampUnit(task.getDelayCount() / DELAY_PENALTY_CAP)
                : 0.0;

        double importance = profile.getW1() * importanceNorm;
        double urgency = profile.getW2() * urgencyNorm;
        double delayPenalty = profile.getW3() * delayNorm;
        double total = Math.max(0.0, importance + urgency - delayPenalty);

        return new ScoreBreakdown(importance, urgency, delayPenalty, total);
    }

    private static double clampUnit(double value) {
        return Math.max(0.0, Math.min(1.0, value));
    }
}
