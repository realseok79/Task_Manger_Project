package com.teamsigma.taskmanager.dto;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 좀비 태스크 조회 응답 (GET /api/tasks/zombie).
 *
 * explorationModeFlag를 응답에 포함시키는 이유: 프론트/엔진 파트와의 계약을 "지금" 확정하기 위함.
 * 데이터 파이프라인 파트는 이 필드를 항상 false로 채워 내려주고, 추후 AdaptiveWeightEngine(이진석)이
 * 좀비 누적 패턴을 보고 탐색 모드 여부를 채우도록 한다. (스키마를 미리 박아두면 나중에 깨지는 연동을 방지)
 */
@Schema(description = "좀비 태스크 목록 + 탐색 모드 플래그")
public record ZombieTaskResponse(
        @Schema(description = "delayCount >= 5 인 좀비 태스크 목록")
        List<ZombieTaskItem> zombieTasks,

        @Schema(description = "엔진 탐색 모드 플래그(엔진 파트가 채움). 파이프라인은 기본 false 반환", example = "false")
        boolean explorationModeFlag
) {
    /** Task 목록 → 응답으로 매핑. 플래그는 파이프라인 단계에서 항상 false. */
    public static ZombieTaskResponse from(List<Task> zombies) {
        List<ZombieTaskItem> items = zombies.stream()
                .map(ZombieTaskItem::from)
                .toList();
        return new ZombieTaskResponse(items, false);
    }

    @Schema(description = "좀비 태스크 단건")
    public record ZombieTaskItem(
            @Schema(example = "101") Long taskId,
            @Schema(example = "기말 보고서 작성") String title,
            @Schema(example = "7") int delayCount,
            @Schema(example = "120") int estimatedMinutes,
            @Schema(example = "HIGH") EnergyLevel requiredEnergy,
            @Schema(example = "5") int importance,
            @Schema(example = "2026-06-01T23:59:00") LocalDateTime deadline
    ) {
        public static ZombieTaskItem from(Task task) {
            return new ZombieTaskItem(
                    task.getId(),
                    task.getTitle(),
                    task.getDelayCount(),
                    task.getEstimatedMinutes(),
                    task.getRequiredEnergy(),
                    task.getImportance(),
                    task.getDeadline()
            );
        }
    }
}
