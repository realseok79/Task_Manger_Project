package com.teamsigma.taskmanager.exception;

/**
 * 존재하지 않는 Task 조회/변경 시 던지는 예외.
 *
 * 왜 별도 타입인가: "잘못된 입력값(400)"과 "리소스 없음(404)"은 HTTP 의미가 다르다.
 * IllegalArgumentException(=400)과 구분해야 핸들러에서 정확한 상태코드로 매핑할 수 있다.
 */
public class TaskNotFoundException extends RuntimeException {
    public TaskNotFoundException(Long taskId) {
        super("존재하지 않는 Task입니다. taskId=" + taskId);
    }
}
