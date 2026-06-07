package com.teamsigma.taskmanager.dto;

import com.teamsigma.taskmanager.domain.Task;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/**
 * 완료 기록 전용 응답 DTO. 완료 화면에 필요한 최소 필드만 노출한다.
 * completedAt 은 별도 컬럼이 없으므로 상태가 COMPLETED 로 바뀐 시점인 updatedAt 을 사용한다.
 */
@Schema(description = "완료된 Task 기록")
public record CompletedTaskResponse(
        @Schema(example = "101") Long taskId,
        @Schema(example = "기말 보고서 작성") String title,
        @Schema(description = "카테고리", example = "DEFAULT") String category,
        @Schema(description = "완료 시각", example = "2026-05-18T09:00:00") LocalDateTime completedAt
) {
    public static CompletedTaskResponse from(Task task) {
        return new CompletedTaskResponse(
                task.getId(),
                task.getTitle(),
                task.getCategory(),
                task.getUpdatedAt()
        );
    }
}
