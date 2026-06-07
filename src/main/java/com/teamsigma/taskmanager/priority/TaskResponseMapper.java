package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.Task;
import org.springframework.stereotype.Component;

import java.util.OptionalLong;

/**
 * Task → 스코어링 TaskResponse 매핑. urgencyLevel(단일 진실)·reason(설명가능성)·stuckLevel(비수치심 정체등급)을 채운다.
 */
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
        double rounded = Math.round(score * 100.0) / 100.0;
        TaskResponse response = new TaskResponse(task, rounded);
        response.setUrgencyLevel(urgencyEvaluator.level(task));
        response.setReason(buildReason(task));
        response.setStuckLevel(stuckLevel(task.getDelayCount()));
        return response;
    }

    /** 정체 등급(비수치심): NONE/AGING/STUCK/STALLED. 이진 isZombie 보완. */
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

    private String buildReason(Task task) {
        StringBuilder sb = new StringBuilder();
        OptionalLong minutes = urgencyEvaluator.minutesUntilDeadline(task.getDeadline());
        if (minutes.isEmpty()) {
            sb.append("마감 없음");
        } else {
            long m = minutes.getAsLong();
            sb.append(m < 0 ? "마감 " + (-m) + "분 지남" : "마감까지 " + m + "분");
        }
        // 비수치심 프레이밍: "연기" 대신 "묵은 일(N회 보류)"
        if (task.getDelayCount() >= 5) {
            sb.append(" · 묵은 일(").append(task.getDelayCount()).append("회 보류)");
        }
        if (task.getImportance() >= 4) {
            sb.append(" · 중요도 높음");
        }
        return sb.toString();
    }
}
