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

        TaskResponse response = new TaskResponse(
                task.getId(),
                task.getTitle(),
                task.getCategory(),
                roundedScore,
                false, // isExploration 기본값 false (이후 ExplorationService에서 변경 가능)
                urgencyLevel,
                isZombie,
                reason
        );
        response.setStuckLevel(stuckLevel(task.getDelayCount()));
        return response;
    }

    /**
     * 정체 등급(비수치심): 미룸 횟수를 비난조가 아닌 중립적 단계로 표현해, 이진 isZombie를 보완한다.
     * 페널티 자체는 strategy에서 상한이 걸려 무한히 누적 처벌하지 않는다(과처벌 방지).
     */
    static String stuckLevel(int delayCount) {
        if (delayCount >= 8) {
            return "STALLED";
        }
        if (delayCount >= 5) {
            return "STUCK";
        }
        if (delayCount >= 3) {
            return "AGING";
        }
        return "NONE";
    }

    /** 이 작업이 왜 이 순위/긴급도인지 사람이 읽을 사유를 조합한다(마감 → 정체 → 중요도 순). */
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

        // 비수치심 프레이밍: "연기"(비난조) 대신 "묵은 일(N회 보류)"로 중립적으로 표현
        if (task.getDelayCount() >= 5) {
            sb.append(" · 묵은 일(").append(task.getDelayCount()).append("회 보류)");
        }
        if (task.getStarRating() >= 4) {
            sb.append(" · 중요도 높음");
        }
        return sb.toString();
    }
}
