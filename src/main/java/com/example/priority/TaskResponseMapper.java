package com.example.priority;

import org.springframework.stereotype.Component;

@Component
public class TaskResponseMapper {

    private final UrgencyEvaluator urgencyEvaluator;

    public TaskResponseMapper(UrgencyEvaluator urgencyEvaluator) {
        this.urgencyEvaluator = urgencyEvaluator;
    }

    public TaskResponse toResponse(Task task, double score) {
        if (task == null) {
            return null;
        }

        // urgencyLevel을 점수 공식과 동일한 긴급도(UrgencyEvaluator)에서 산출한다(단일 진실).
        // 기존엔 매퍼가 절대 임계값(60/180분)으로 따로 계산해 점수의 긴급도와 어긋났다.
        String urgencyLevel = urgencyEvaluator.level(task.getDueDate());

        boolean isZombie = task.getDelayCount() >= 5;

        // priorityScore 소수점 2자리 반올림
        double roundedScore = Math.round(score * 100.0) / 100.0;

        return new TaskResponse(
                task.getId(),
                task.getTitle(),
                task.getCategory(),
                roundedScore,
                false, // isExploration 기본값 false (이후 ExplorationService에서 변경 가능)
                urgencyLevel,
                isZombie
        );
    }
}
