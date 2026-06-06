package com.example.priority;

import org.springframework.stereotype.Component;

import java.util.OptionalLong;

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
        // 마감 있으면 시간 기반, 없으면 방치(aging) 기반(NONE/STALE).
        String urgencyLevel = urgencyEvaluator.level(task);

        boolean isZombie = task.getDelayCount() >= 5;

        // priorityScore 소수점 2자리 반올림
        double roundedScore = Math.round(score * 100.0) / 100.0;

        String reason = buildReason(task);

        return new TaskResponse(
                task.getId(),
                task.getTitle(),
                task.getCategory(),
                roundedScore,
                false, // isExploration 기본값 false (이후 ExplorationService에서 변경 가능)
                urgencyLevel,
                isZombie,
                reason
        );
    }

    /** 이 작업이 왜 이 순위/긴급도인지 사람이 읽을 사유를 조합한다(마감 → 연기 → 중요도 순). */
    private String buildReason(Task task) {
        StringBuilder sb = new StringBuilder();

        OptionalLong minutes = urgencyEvaluator.minutesUntilDeadline(task.getDueDate());
        if (minutes.isEmpty()) {
            sb.append("마감 없음");
        } else {
            long m = minutes.getAsLong();
            if (m < 0) {
                sb.append("마감 ").append(-m).append("분 지남");
            } else {
                sb.append("마감까지 ").append(m).append("분");
            }
        }

        if (task.getDelayCount() >= 5) {
            sb.append(" · ").append(task.getDelayCount()).append("회 연기");
        }
        if (task.getStarRating() >= 4) {
            sb.append(" · 중요도 높음");
        }
        return sb.toString();
    }
}
