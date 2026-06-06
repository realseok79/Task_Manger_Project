package com.example.priority;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ExplorationServiceTest {

    // 결정론 검증을 위해 시계를 2026-06-06T12:00에 고정한다.
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 6, 12, 0);

    private UserActivityLogRepository userActivityLogRepository;
    private Random mockRandom;
    private ExplorationService explorationService;

    @BeforeEach
    void setUp() {
        userActivityLogRepository = mock(UserActivityLogRepository.class);
        mockRandom = mock(Random.class);
        Clock fixedClock = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        explorationService = new ExplorationService(userActivityLogRepository, mockRandom, fixedClock);
    }

    @Test
    @DisplayName("로그가 없는 경우의 탐색 모드 방어 테스트 - completedLogs가 비어있을 때, 5% 확률을 통과하더라도 탐색 모드가 비활성화되고 isExploration이 항상 false가 되는지 검증")
    void applyExplorationMode_NoLogs_Bypassed() {
        // Given
        Long userId = 1L;
        Task taskA = new Task(101L, "Task A", "DEV", NOW.plusMinutes(60), 3, 0);
        Task taskB = new Task(102L, "Task B", "DOCS", NOW.plusMinutes(60), 3, 0);

        List<TaskResponse> responses = List.of(
                new TaskResponse(taskA, 10.0),
                new TaskResponse(taskB, 5.0)
        );

        // 5% 확률 통과 강제
        when(mockRandom.nextDouble()).thenReturn(0.03);

        // 완료 로그가 전혀 없음 (비어있는 리스트 반환)
        when(userActivityLogRepository.findByUserIdAndTimestampAfterAndActivityType(
                eq(userId), any(LocalDateTime.class), eq("COMPLETED"))
        ).thenReturn(List.of());

        // When
        List<TaskResponse> result = explorationService.applyExplorationMode(userId, responses);

        // Then
        assertEquals(2, result.size());
        // 탐색이 중단되었으므로 모든 isExploration 플래그는 false여야 함
        assertFalse(result.get(0).isExploration());
        assertFalse(result.get(1).isExploration());
        // 점수와 정렬도 그대로 유지됨
        assertEquals(101L, result.get(0).getTaskId());
        assertEquals(10.0, result.get(0).getPriorityScore());
        assertEquals(102L, result.get(1).getTaskId());
        assertEquals(5.0, result.get(1).getPriorityScore());
    }

    @Test
    @DisplayName("탐색 조회 시점은 주입된 Clock 기준 정확히 30일 전이다 (결정론)")
    void usesInjectedClockFor30DayWindow() {
        // Given: 탐색 활성화 + DEV 완료 로그 1건
        Long userId = 1L;
        when(mockRandom.nextDouble()).thenReturn(0.01);
        when(userActivityLogRepository.findByUserIdAndTimestampAfterAndActivityType(
                eq(userId), any(LocalDateTime.class), eq("COMPLETED"))
        ).thenReturn(List.of(new UserActivityLog(userId, "COMPLETED", "DEV", 3, 30, NOW.minusDays(5))));

        List<TaskResponse> responses = new ArrayList<>(List.of(
                new TaskResponse(new Task(101L, "T", "DEV", NOW.plusMinutes(60), 3, 0), 10.0)
        ));

        // When
        explorationService.applyExplorationMode(userId, responses);

        // Then: 조회 timestamp가 고정 시계 기준 NOW-30일과 정확히 일치
        ArgumentCaptor<LocalDateTime> since = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(userActivityLogRepository).findByUserIdAndTimestampAfterAndActivityType(
                eq(userId), since.capture(), eq("COMPLETED"));
        assertEquals(NOW.minusDays(30), since.getValue());
    }
}
