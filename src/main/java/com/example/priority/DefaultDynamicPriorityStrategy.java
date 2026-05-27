package com.example.priority;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

public class DefaultDynamicPriorityStrategy implements PriorityStrategy {

    private static final double K = 10.0;

    @Override
    public double calculate(Task task, UserProfile profile) {
        if (task == null || profile == null) {
            return 0.0;
        }

        // dt는 마감까지 남은 분(분). 음수면 overdue
        long dt = ChronoUnit.MINUTES.between(LocalDateTime.now(), task.getDueDate());

        // overdue(dt < 0)일 때 분모가 0이 되거나(dt = -10) 음수가 되어 스코어가 역전되는 현상을 방지하기 위해,
        // dt가 음수인 경우 0으로 보정(클램핑)하여 계산합니다.
        // 이를 통해 마감이 지난 작업은 마감 정시(dt=0)의 최고 긴급도 점수 가중치(W2 / 10.0)를 유지하게 됩니다.
        double safeDt = Math.max(dt, 0.0);

        double starRatingPart = task.getStarRating() * profile.getW1();
        double urgencyPart = profile.getW2() / (safeDt + K);
        double delayPart = task.getDelayCount() * profile.getW3();

        double score = starRatingPart + urgencyPart - delayPart;

        // 점수 계산 후 하한선 0.0 처리 (음수 방지)
        return Math.max(0.0, score);
    }
}
