package com.teamsigma.taskmanager.controller;

import com.teamsigma.taskmanager.dto.UserActivityLogResponse;
import com.teamsigma.taskmanager.service.TaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/**
 * 유저 행동 로그 조회 API (엔진 파트 연동용).
 * 엔진(이진석)이 매일 자정 학습 표본을 끌어가는 진입점이다.
 */
@Tag(name = "Log API", description = "유저 행동 로그 조회(엔진 학습 데이터 소스)")
@RestController
@RequestMapping("/api/logs")
@RequiredArgsConstructor
public class LogController {

    private final TaskService taskService;

    // ⑤ GET /api/logs/user/{userId} — 유저 행동 로그 조회
    @Operation(summary = "유저 행동 로그 조회",
            description = "해당 유저의 행동 로그(행동 + 그 시점 컨텍스트 + 태스크 특성)를 최신순으로 반환한다.")
    @ApiResponse(responseCode = "200", description = "조회 성공",
            content = @Content(schema = @Schema(implementation = UserActivityLogResponse.class)))
    @GetMapping("/user/{userId}")
    public List<UserActivityLogResponse> getUserLogs(
            @Parameter(description = "유저 ID", example = "1") @PathVariable Long userId) {
        return taskService.getUserActivityLogs(userId).stream()
                .map(UserActivityLogResponse::from)
                .toList();
    }
}
