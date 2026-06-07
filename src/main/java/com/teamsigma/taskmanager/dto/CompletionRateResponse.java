package com.teamsigma.taskmanager.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 유저 완료율 응답. completionRate 는 0.0~1.0 사이의 비율이다.
 */
@Schema(description = "유저 완료율")
public record CompletionRateResponse(
        @Schema(example = "1") Long userId,
        @Schema(description = "완료율(0.0~1.0)", example = "0.73") double completionRate
) {
}
