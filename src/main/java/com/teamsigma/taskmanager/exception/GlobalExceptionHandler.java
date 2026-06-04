package com.teamsigma.taskmanager.exception;

import com.teamsigma.taskmanager.dto.ErrorResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 전역 예외 처리기.
 *
 * 왜 한 곳에 모으나: 컨트롤러마다 try/catch 를 흩뿌리면 에러 응답 포맷이 제각각이 된다.
 * 여기서 예외 → HTTP 상태 + 통일된 ErrorResponse 매핑을 단일 책임으로 관리한다.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 리소스 없음 → 404. */
    @ExceptionHandler(TaskNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleTaskNotFound(TaskNotFoundException e) {
        // 비즈니스상 흔히 발생할 수 있는 케이스라 스택트레이스 없이 메시지만 남긴다(로그 노이즈 방지).
        log.warn("[404] {}", e.getMessage());
        return build(HttpStatus.NOT_FOUND, e.getMessage());
    }

    /** @Valid 검증 실패 → 400. 첫 번째 위반 필드 메시지를 대표로 노출한다. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        // 여러 필드가 동시에 틀려도 사용자에겐 한 번에 하나씩 안내하는 편이 친절하다.
        FieldError fieldError = e.getBindingResult().getFieldError();
        String message = (fieldError != null)
                ? fieldError.getDefaultMessage()
                : "요청 값이 유효하지 않습니다.";
        return build(HttpStatus.BAD_REQUEST, message);
    }

    /** 잘못된 인자(도메인 규칙 위반 등) → 400. */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(IllegalArgumentException e) {
        return build(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    /** 예상치 못한 예외 → 500. 내부 메시지를 그대로 노출하지 않고 스택만 서버 로그에 남긴다(정보 노출 방지). */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception e) {
        log.error("[500] 처리되지 않은 예외", e);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "서버 내부 오류가 발생했습니다.");
    }

    private ResponseEntity<ErrorResponse> build(HttpStatus status, String message) {
        // status.name() 으로 "BAD_REQUEST" 같은 enum 명칭을 그대로 error 필드에 채워 포맷을 통일.
        return ResponseEntity.status(status)
                .body(ErrorResponse.of(status.value(), status.name(), message));
    }
}
