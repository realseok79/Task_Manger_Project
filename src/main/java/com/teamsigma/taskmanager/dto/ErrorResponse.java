package com.teamsigma.taskmanager.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Clock;
import java.time.LocalDateTime;

/**
 * 전역 에러 응답 포맷. 모든 4xx/5xx 응답은 이 구조로 통일한다(프론트가 단일 파서로 처리하도록).
 * record 사용 이유: 불변 응답 객체이며 보일러플레이트(getter/생성자)가 필요 없다.
 */
@Schema(description = "표준 에러 응답")
public record ErrorResponse(
        @Schema(description = "HTTP 상태 코드", example = "400")
        int status,
        @Schema(description = "HTTP 상태 명칭", example = "BAD_REQUEST")
        String error,
        @Schema(description = "사람이 읽을 수 있는 에러 메시지", example = "importance는 1 이상 5 이하의 정수여야 합니다.")
        String message,
        @Schema(description = "에러 발생 시각", example = "2026-05-18T12:00:00")
        LocalDateTime timestamp
) {
    /**
     * 팩토리. timestamp 는 주입된 Clock 으로 생성한다(LocalDateTime.now() 직접 호출 금지).
     * 테스트에서 고정 Clock 으로 교체하면 timestamp 검증이 가능해진다.
     */
    public static ErrorResponse of(int status, String error, String message, Clock clock) {
        return new ErrorResponse(status, error, message, LocalDateTime.now(clock));
    }
}
