package com.teamsigma.taskmanager.dto;

import com.teamsigma.taskmanager.domain.ActionType;
import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.UserActivityLog;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/**
 * 유저 행동 로그 응답 (GET /api/logs/user/{userId}).
 *
 * 이 응답이 곧 엔진(이진석)의 학습 입력 스키마다. 따라서 "행동(actionType)"과
 * "그 시점의 컨텍스트(contextEnergy/availableMinutes)" + "태스크 특성(importance/estimatedMinutes/delayCount)"을
 * 한 레코드 안에 평탄하게 노출한다. (별도 조인 없이 한 행만으로 학습 표본이 완성되도록)
 */
@Schema(description = "유저 행동 로그(엔진 학습 표본)")
public record UserActivityLogResponse(
        @Schema(example = "5001") Long logId,
        @Schema(example = "1") Long userId,
        @Schema(example = "101") Long taskId,
        @Schema(description = "취한 행동", example = "SNOOZED") ActionType actionType,
        @Schema(description = "행동 시점의 에너지", example = "LOW") EnergyLevel contextEnergy,
        @Schema(description = "행동 시점 가용 시간(분)", example = "30") int contextAvailableMinutes,
        @Schema(description = "행동 시점 태스크 중요도", example = "5") int taskImportance,
        @Schema(description = "행동 시점 예상 소요(분)", example = "120") int taskEstimatedMinutes,
        @Schema(description = "행동 시점 누적 미룬 횟수", example = "7") int taskDelayCount,
        @Schema(example = "2026-05-18T00:00:00") LocalDateTime loggedAt
) {
    public static UserActivityLogResponse from(UserActivityLog log) {
        return new UserActivityLogResponse(
                log.getId(),
                log.getUserId(),
                log.getTaskId(),
                log.getActionType(),
                log.getContextEnergy(),
                log.getContextAvailableMinutes(),
                log.getTaskImportance(),
                log.getTaskEstimatedMinutes(),
                log.getTaskDelayCount(),
                log.getLoggedAt()
        );
    }
}
