package com.example.priority;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PriorityServiceTest {

    private PriorityStrategy priorityStrategy;
    private UserProfileRepository userProfileRepository;
    private UserActivityLogRepository userActivityLogRepository;
    private Random mockRandom;
    private PriorityService priorityService;

    @BeforeEach
    void setUp() {
        priorityStrategy = mock(PriorityStrategy.class);
        userProfileRepository = mock(UserProfileRepository.class);
        userActivityLogRepository = mock(UserActivityLogRepository.class);
        mockRandom = mock(Random.class);

        ExplorationService explorationService = new ExplorationService(userActivityLogRepository);
        explorationService.setRandom(mockRandom);
        priorityService = new PriorityService(priorityStrategy, userProfileRepository, explorationService);
    }

    @Test
    @DisplayName("탐색 모드가 활성화될 때 (확률 5% 미만), 가장 적게 완료한 카테고리 작업의 점수가 부스트되어 리스트 맨 앞에 오고 isExploration 플래그가 true가 된다")
    void getPrioritizedTasks_ExplorationActivated() {
        // Given
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 1.0, 1.0, 1.0);
        when(userProfileRepository.findById(userId)).thenReturn(Optional.of(profile));

        // Random nextDouble < 0.05 로 설정하여 탐색 모드 활성화 강제
        when(mockRandom.nextDouble()).thenReturn(0.03);

        LocalDateTime now = LocalDateTime.now();
        Task taskA = new Task(101L, "DEV", now.plusMinutes(60), 3, 0);
        Task taskB = new Task(102L, "DOCS", now.plusMinutes(60), 3, 0);

        List<Task> tasks = List.of(taskA, taskB);

        // 기본 우선순위 스코어 세팅 (A가 10.0점, B가 5.0점으로 A가 더 높은 상태)
        when(priorityStrategy.calculate(taskA, profile)).thenReturn(10.0);
        when(priorityStrategy.calculate(taskB, profile)).thenReturn(5.0);

        // 최근 30일간 완료된 로그 목록 세팅: DEV는 5번 완료, DOCS는 1번 완료 (DOCS가 최소 완료 카테고리)
        List<UserActivityLog> completedLogs = List.of(
                new UserActivityLog(userId, "COMPLETED", "DEV", 3, 30, now.minusDays(5)),
                new UserActivityLog(userId, "COMPLETED", "DEV", 3, 30, now.minusDays(4)),
                new UserActivityLog(userId, "COMPLETED", "DEV", 3, 30, now.minusDays(3)),
                new UserActivityLog(userId, "COMPLETED", "DEV", 3, 30, now.minusDays(2)),
                new UserActivityLog(userId, "COMPLETED", "DEV", 3, 30, now.minusDays(1)),
                new UserActivityLog(userId, "COMPLETED", "DOCS", 3, 30, now.minusDays(10))
        );
        when(userActivityLogRepository.findByUserIdAndTimestampAfterAndActivityType(
                eq(userId), any(LocalDateTime.class), eq("COMPLETED"))
        ).thenReturn(completedLogs);

        // When
        List<TaskResponse> result = priorityService.getPrioritizedTasks(userId, tasks);

        // Then
        assertEquals(2, result.size());

        // 최소 완료 카테고리인 DOCS 태스크(taskB, id 102)가 최고점(10.0) * 1.5 = 15.0 점을 얻어 1위로 정렬되어야 함
        TaskResponse firstResponse = result.get(0);
        assertEquals(102L, firstResponse.getTaskId());
        assertEquals("DOCS", firstResponse.getCategory());
        assertEquals(15.0, firstResponse.getScore(), 0.0001);
        assertTrue(firstResponse.isExploration()); // B는 탐색 대상이므로 true

        // DEV 태스크는 원래 점수 10.0점 유지하며 2위로 밀려남
        TaskResponse secondResponse = result.get(1);
        assertEquals(101L, secondResponse.getTaskId());
        assertEquals("DEV", secondResponse.getCategory());
        assertEquals(10.0, secondResponse.getScore(), 0.0001);
        assertFalse(secondResponse.isExploration()); // A는 탐색 모드가 미적용되어 false
    }

    @Test
    @DisplayName("탐색 모드가 활성화되지 않을 때 (확률 5% 이상), 원래 점수 순으로 정렬되고 모든 작업의 isExploration 플래그는 false이다")
    void getPrioritizedTasks_ExplorationNotActivated() {
        // Given
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 1.0, 1.0, 1.0);
        when(userProfileRepository.findById(userId)).thenReturn(Optional.of(profile));

        // Random nextDouble >= 0.05 로 설정하여 탐색 모드 비활성화
        when(mockRandom.nextDouble()).thenReturn(0.08);

        LocalDateTime now = LocalDateTime.now();
        Task taskA = new Task(101L, "DEV", now.plusMinutes(60), 3, 0);
        Task taskB = new Task(102L, "DOCS", now.plusMinutes(60), 3, 0);

        List<Task> tasks = List.of(taskA, taskB);

        // 기본 우선순위 스코어 세팅 (A가 10.0점, B가 5.0점)
        when(priorityStrategy.calculate(taskA, profile)).thenReturn(10.0);
        when(priorityStrategy.calculate(taskB, profile)).thenReturn(5.0);

        // When
        List<TaskResponse> result = priorityService.getPrioritizedTasks(userId, tasks);

        // Then
        assertEquals(2, result.size());

        // 탐색 모드 비활성화이므로 높은 스코어순으로 정렬됨
        TaskResponse firstResponse = result.get(0);
        assertEquals(101L, firstResponse.getTaskId());
        assertEquals(10.0, firstResponse.getScore());
        assertFalse(firstResponse.isExploration());

        TaskResponse secondResponse = result.get(1);
        assertEquals(102L, secondResponse.getTaskId());
        assertEquals(5.0, secondResponse.getScore());
        assertFalse(secondResponse.isExploration());
    }
}
