package com.teamsigma.taskmanager.controller;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.dto.*;
import com.teamsigma.taskmanager.service.TaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/**
 * Task 도메인 REST API.
 *
 * 설계 원칙: 컨트롤러는 (1) 요청 검증(@Valid), (2) 서비스 위임, (3) 엔티티→DTO 변환만 담당한다.
 * 비즈니스 규칙/트랜잭션은 모두 서비스에 둔다(컨트롤러는 얇게 유지).
 */
@Tag(name = "Task API", description = "할 일 생성·조회·상태변경·좀비 감지")
@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;

    // ① POST /api/tasks — Task 생성 (정량 스키마 필수 입력)
    @Operation(summary = "Task 생성", description = "예상 소요시간/마감/요구 에너지/중요도를 필수로 받아 Task를 생성한다.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "생성 성공",
                    content = @Content(schema = @Schema(implementation = TaskResponse.class))),
            @ApiResponse(responseCode = "400", description = "검증 실패(예: importance 범위 초과, 존재하지 않는 userId)",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TaskResponse create(@Valid @RequestBody TaskCreateRequest request) {
        return TaskResponse.from(taskService.createTask(request));
    }

    // ② GET /api/tasks?userId=&energy=&minutes= — 하드 컨스트레인트 필터링 조회
    @Operation(summary = "가용 Task 필터 조회",
            description = "userId의 PENDING Task 중 '요구 에너지 <= 현재 에너지' 이고 '예상 소요 <= 가용 시간'인 것만 마감 임박순으로 반환한다.")
    @ApiResponse(responseCode = "200", description = "조회 성공",
            content = @Content(schema = @Schema(implementation = TaskResponse.class)))
    @GetMapping
    public List<TaskResponse> getAvailable(
            @Parameter(description = "유저 ID", example = "1") @RequestParam Long userId,
            @Parameter(description = "현재 에너지 레벨", example = "LOW") @RequestParam EnergyLevel energy,
            @Parameter(description = "가용 시간(분)", example = "30") @RequestParam int minutes) {
        return taskService.getAvailableTasks(userId, energy, minutes).stream()
                .map(TaskResponse::from)
                .toList();
    }

    // ③ PATCH /api/tasks/{taskId}/status — 상태 변경 (COMPLETE / SNOOZE / ARCHIVE)
    @Operation(summary = "Task 상태 변경",
            description = "action(COMPLETE|SNOOZE|ARCHIVE)에 따라 상태를 바꾸고, 행동 시점 컨텍스트를 로그로 남긴다. " +
                    "ARCHIVE는 '방치/보관'(브리프의 IGNORED) 의미다.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "변경 성공"),
            @ApiResponse(responseCode = "400", description = "잘못된 요청 값",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "404", description = "존재하지 않는 Task",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    @PatchMapping("/{taskId}/status")
    public void changeStatus(
            @Parameter(description = "대상 Task ID", example = "101") @PathVariable Long taskId,
            @Valid @RequestBody TaskStatusUpdateRequest request) {
        // 멱등성/단순성을 위해 본문 없이 200만 반환한다(변경 결과는 후속 GET으로 확인).
        taskService.changeStatus(taskId, request);
    }

    // ④ GET /api/tasks/zombie?userId= — 좀비 태스크 조회
    @Operation(summary = "좀비 태스크 조회",
            description = "delayCount >= 5 인 미룬 태스크 목록 + explorationModeFlag(엔진 연동용, 기본 false)를 반환한다.")
    @ApiResponse(responseCode = "200", description = "조회 성공",
            content = @Content(schema = @Schema(implementation = ZombieTaskResponse.class)))
    @GetMapping("/zombie")
    public ZombieTaskResponse getZombies(
            @Parameter(description = "유저 ID", example = "1") @RequestParam Long userId) {
        List<Task> zombies = taskService.getZombieTasks(userId);
        return ZombieTaskResponse.from(zombies);
    }
}
