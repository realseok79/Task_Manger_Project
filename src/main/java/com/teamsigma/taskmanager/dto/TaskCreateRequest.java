package com.teamsigma.taskmanager.dto;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;

/**
 * Task 생성 요청 DTO.
 *
 * 정량 스키마(예상 소요시간/마감일/요구 에너지/중요도)를 "필수"로 받기 위해 검증을 DTO에 박아둔다.
 * 컨트롤러 진입 시점(@Valid)에 거르므로, 잘못된 데이터가 서비스/DB까지 흘러가지 않는다.
 */
@Schema(description = "Task 생성 요청")
public record TaskCreateRequest(

        @Schema(description = "소유 유저 ID", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotNull(message = "userId는 필수입니다.")
        Long userId,

        @Schema(description = "할 일 제목", example = "기말 보고서 작성", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank(message = "title은 비어 있을 수 없습니다.")
        @Size(max = 255, message = "title은 255자 이하여야 합니다.")
        String title,

        @Schema(description = "상세 설명(선택)", example = "3장까지 초안 작성")
        @Size(max = 1000, message = "description은 1000자 이하여야 합니다.")
        String description,

        @Schema(description = "예상 소요 시간(분)", example = "120", requiredMode = Schema.RequiredMode.REQUIRED)
        @Min(value = 1, message = "estimatedMinutes는 1 이상이어야 합니다.")
        int estimatedMinutes,

        @Schema(description = "마감 일시(선택, 미래여야 함)", example = "2026-06-01T23:59:00")
        @Future(message = "deadline은 현재 이후 시각이어야 합니다.")
        LocalDateTime deadline,

        @Schema(description = "요구 에너지 레벨", example = "HIGH", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotNull(message = "requiredEnergy는 필수입니다.")
        EnergyLevel requiredEnergy,

        @Schema(description = "중요도(1~5)", example = "5", requiredMode = Schema.RequiredMode.REQUIRED)
        @Min(value = 1, message = "importance는 1 이상 5 이하의 정수여야 합니다.")
        @Max(value = 5, message = "importance는 1 이상 5 이하의 정수여야 합니다.")
        int importance,

        @Schema(description = "카테고리 (선택, 미입력 시 DEFAULT)", example = "업무")
        @Size(max = 100, message = "카테고리는 100자를 초과할 수 없습니다.")
        String category   // nullable, 선택 입력
) {
}
