package com.example.priority;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;

@Component
public class TaskResponseMapper {

    private final Clock clock;

    public TaskResponseMapper(Clock clock) {
        this.clock = clock;
    }

    public TaskResponse toResponse(Task task, double score) {
        if (task == null) {
            return null;
        }

        // 1. urgencyLevel 계산
        // dt = Duration.between(LocalDateTime.now(clock), task.getDueDate()).toMinutes()
        LocalDateTime now = LocalDateTime.now(clock);
        long dt = Duration.between(now, task.getDueDate()).toMinutes();
        String urgencyLevel;
        if (dt <= 60) {
            urgencyLevel = "RED";
        } else if (dt <= 180) {
            urgencyLevel = "YELLOW";
        } else {
            urgencyLevel = "GREEN";
        }

        // 2. isZombie 계산
        boolean isZombie = task.getDelayCount() >= 5;

        // 3. priorityScore 소수점 2자리 반올림
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
