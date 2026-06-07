package com.teamsigma.taskmanager.dto;

import com.teamsigma.taskmanager.domain.DeadlineStatus;
import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.TaskStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/**
 * Task 단건/목록 응답 DTO.
 *
 * 엔티티를 직접 반환하지 않는 이유: (1) user 같은 지연로딩 연관관계의 직렬화 사고 방지,
 * (2) 내부 스키마 변경이 곧바로 API 계약 변경이 되는 결합을 끊기 위함.
 */
@Schema(description = "Task 응답")
public record TaskResponse(
        @Schema(example = "101") Long taskId,
        @Schema(example = "기말 보고서 작성") String title,
        @Schema(example = "3장까지 초안 작성") String description,
        @Schema(example = "120") int estimatedMinutes,
        @Schema(example = "2026-06-01T23:59:00") LocalDateTime deadline,
        @Schema(example = "HIGH") EnergyLevel requiredEnergy,
        @Schema(example = "5") int importance,
        @Schema(example = "PENDING") TaskStatus status,
        @Schema(example = "0") int delayCount,
        @Schema(description = "카테고리", example = "DEFAULT") String category,
        @Schema(description = "마감 임박도(배지/카운트다운 표현용)", example = "NORMAL") DeadlineStatus deadlineStatus,
        @Schema(example = "2026-05-18T09:00:00") LocalDateTime createdAt
) {
    public static TaskResponse from(Task task) {
        return new TaskResponse(
                task.getId(),
                task.getTitle(),
                task.getDescription(),
                task.getEstimatedMinutes(),
                task.getDeadline(),
                task.getRequiredEnergy(),
                task.getImportance(),
                task.getStatus(),
                task.getDelayCount(),
                task.getCategory(),
                task.getDeadlineStatus(),
                task.getCreatedAt()
        );
    }
}
