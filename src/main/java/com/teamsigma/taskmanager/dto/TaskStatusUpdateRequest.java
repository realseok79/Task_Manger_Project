package com.teamsigma.taskmanager.dto;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Task 상태 변경 요청 DTO.
 *
 * energyLevel/availableMinutes를 함께 받는 이유: 상태 변경 시점의 "유저 컨텍스트"를 스냅샷으로 남겨야
 * 엔진(이진석)이 "어떤 상황에서 미뤘는가"를 학습할 수 있다. 이 값들이 없으면 로그가 반쪽짜리가 된다.
 */
@Schema(description = "Task 상태 변경 요청")
public record TaskStatusUpdateRequest(

        @Schema(description = "수행 액션", example = "COMPLETE", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotNull(message = "action은 필수입니다. (COMPLETE | SNOOZE | ARCHIVE)")
        Action action,

        @Schema(description = "행동 시점의 유저 에너지 레벨", example = "LOW", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotNull(message = "energyLevel은 필수입니다.")
        EnergyLevel energyLevel,

        @Schema(description = "행동 시점의 가용 시간(분)", example = "30", requiredMode = Schema.RequiredMode.REQUIRED)
        @Min(value = 0, message = "availableMinutes는 0 이상이어야 합니다.")
        int availableMinutes
) {
    /**
     * API 레벨 액션.
     * 도메인 enum(TaskStatus/ActionType)을 그대로 노출하지 않고 액션 동사로 추상화한다.
     * - COMPLETE → 완료, SNOOZE → 미루기, ARCHIVE → 방치/보관(브리프상의 IGNORED 의미를 도메인의 ARCHIVED로 일원화)
     */
    public enum Action {
        COMPLETE, SNOOZE, ARCHIVE
    }
}
