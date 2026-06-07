package com.teamsigma.taskmanager.controller;

import com.teamsigma.taskmanager.dto.CompletionRateResponse;
import com.teamsigma.taskmanager.service.TaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 유저 단위 집계 API.
 */
@Tag(name = "User API", description = "유저 단위 집계(완료율 등)")
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final TaskService taskService;

    // GET /api/users/{userId}/completion-rate — 완료율 조회
    @Operation(summary = "유저 완료율 조회",
            description = "유저의 전체 Task 대비 COMPLETED 비율(0.0~1.0)을 반환한다.")
    @ApiResponse(responseCode = "200", description = "조회 성공",
            content = @Content(schema = @Schema(implementation = CompletionRateResponse.class)))
    @GetMapping("/{userId}/completion-rate")
    public CompletionRateResponse getCompletionRate(
            @Parameter(description = "유저 ID", example = "1") @PathVariable Long userId) {
        // 서비스의 getCompletionRate()는 백분율(0~100)을 반환하므로 0.0~1.0 비율로 변환해 노출한다.
        double rate = taskService.getCompletionRate(userId) / 100.0;
        return new CompletionRateResponse(userId, rate);
    }
}
