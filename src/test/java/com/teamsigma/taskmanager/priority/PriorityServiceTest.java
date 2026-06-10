package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.ActionType;
import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.User;
import com.teamsigma.taskmanager.domain.UserActivityLog;
import com.teamsigma.taskmanager.domain.UserProfile;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import com.teamsigma.taskmanager.repository.UserProfileRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
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
    private User user;

    @BeforeEach
    void setUp() {
        priorityStrategy = mock(PriorityStrategy.class);
        userProfileRepository = mock(UserProfileRepository.class);
        userActivityLogRepository = mock(UserActivityLogRepository.class);
        mockRandom = mock(Random.class);

        ExplorationService explorationService = new ExplorationService(userActivityLogRepository);
        explorationService.setRandom(mockRandom);
        TaskResponseMapper taskResponseMapper = new TaskResponseMapper(new UrgencyEvaluator(Clock.systemDefaultZone()));
        priorityService = new PriorityService(priorityStrategy, userProfileRepository, explorationService, taskResponseMapper);
        user = User.builder().email("jungwoo@sigma.com").nickname("박정우").build();
    }

    @Test
    @DisplayName("탐색 모드 활성화(확률 5% 미만): 1순위는 사용자의 진짜 최우선이 지키고, 가장 적게 완료한 카테고리 작업은 점수 위조 없이 2순위로 승격된다")
    void getPrioritizedTasks_ExplorationActivated() {
        // Given
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 1.0, 1.0, 1.0);
        when(userProfileRepository.findById(userId)).thenReturn(Optional.of(profile));

        // Random nextDouble < 0.05 로 설정하여 탐색 모드 활성화 강제
        when(mockRandom.nextDouble()).thenReturn(0.03);

        LocalDateTime now = LocalDateTime.now();
        Task taskTop = Task.builder()
                .user(user).title("top").estimatedMinutes(60).requiredEnergy(EnergyLevel.MEDIUM)
                .deadline(now.plusDays(10)).importance(3).category("DEV").build();
        Task taskMid = Task.builder()
                .user(user).title("mid").estimatedMinutes(60).requiredEnergy(EnergyLevel.MEDIUM)
                .deadline(now.plusDays(10)).importance(3).category("DEV").build();
        Task taskNeglected = Task.builder()
                .user(user).title("neglected").estimatedMinutes(60).requiredEnergy(EnergyLevel.MEDIUM)
                .deadline(now.plusDays(10)).importance(3).category("DOCS").build();

        List<Task> tasks = List.of(taskTop, taskMid, taskNeglected);

        // 점수: top(10) > mid(8) > neglected(3)
        when(priorityStrategy.calculate(taskTop, profile)).thenReturn(10.0);
        when(priorityStrategy.calculate(taskMid, profile)).thenReturn(8.0);
        when(priorityStrategy.calculate(taskNeglected, profile)).thenReturn(3.0);

        // 최근 30일 완료 로그: DEV 다수, DOCS 1건 (DOCS가 최소 완료 카테고리)
        List<UserActivityLog> completedLogs = List.of(
                new UserActivityLog(userId, "COMPLETED", "DEV", 3, 30, now.minusDays(5)),
                new UserActivityLog(userId, "COMPLETED", "DEV", 3, 30, now.minusDays(4)),
                new UserActivityLog(userId, "COMPLETED", "DEV", 3, 30, now.minusDays(3)),
                new UserActivityLog(userId, "COMPLETED", "DOCS", 3, 30, now.minusDays(10))
        );
        when(userActivityLogRepository.findByUserIdAndLoggedAtAfterAndActionType(
                eq(userId), any(LocalDateTime.class), eq(ActionType.COMPLETED))
        ).thenReturn(completedLogs);

        // When
        List<ScoredTaskResponse> result = priorityService.getPrioritizedTasks(userId, tasks);

        // Then
        assertEquals(3, result.size());

        // 1순위는 진짜 최우선(top, 점수 10) — 탐색이 갈아치우지 않음
        assertEquals("top", result.get(0).getTitle());
        assertEquals(10.0, result.get(0).getScore(), 0.0001);
        assertFalse(result.get(0).isExploration());

        // 2순위로 탐색 픽(DOCS)이 승격 — 점수는 원래 3.0 그대로(위조 없음), 더 높은 점수의 mid보다 위
        ScoredTaskResponse second = result.get(1);
        assertEquals("DOCS", second.getCategory());
        assertEquals(3.0, second.getScore(), 0.0001);
        assertTrue(second.isExploration());

        // mid는 3순위로 밀림
        assertEquals("mid", result.get(2).getTitle());
        assertFalse(result.get(2).isExploration());
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
        Task taskA = Task.builder()
                .user(user)
                .title("taskA")
                .estimatedMinutes(60)
                .requiredEnergy(EnergyLevel.MEDIUM)
                .deadline(now.plusDays(10))
                .importance(3)
                .category("DEV")
                .build();
        Task taskB = Task.builder()
                .user(user)
                .title("taskB")
                .estimatedMinutes(60)
                .requiredEnergy(EnergyLevel.MEDIUM)
                .deadline(now.plusDays(10))
                .importance(3)
                .category("DOCS")
                .build();

        List<Task> tasks = List.of(taskA, taskB);

        // 기본 우선순위 스코어 세팅 (A가 10.0점, B가 5.0점)
        when(priorityStrategy.calculate(taskA, profile)).thenReturn(10.0);
        when(priorityStrategy.calculate(taskB, profile)).thenReturn(5.0);

        // When
        List<ScoredTaskResponse> result = priorityService.getPrioritizedTasks(userId, tasks);

        // Then
        assertEquals(2, result.size());

        // 탐색 모드 비활성화이므로 높은 스코어순으로 정렬됨
        ScoredTaskResponse firstResponse = result.get(0);
        assertEquals("DEV", firstResponse.getCategory());
        assertEquals(10.0, firstResponse.getScore());
        assertFalse(firstResponse.isExploration());

        ScoredTaskResponse secondResponse = result.get(1);
        assertEquals("DOCS", secondResponse.getCategory());
        assertEquals(5.0, secondResponse.getScore());
        assertFalse(secondResponse.isExploration());
    }

    @Test
    @DisplayName("긴급 하드가드: 마감 임박(RED) 작업은 점수가 더 낮아도 비-RED 작업 위로 올라온다")
    void getPrioritizedTasks_RedTaskFloatsAboveHigherScoredNonRed() {
        // Given
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 0.5, 0.3, 0.2);
        when(userProfileRepository.findById(userId)).thenReturn(Optional.of(profile));

        // 탐색 비활성(>= 0.05)
        when(mockRandom.nextDouble()).thenReturn(0.9);

        LocalDateTime now = LocalDateTime.now();
        // 30분 뒤 마감 → RED, 중요도 낮음
        Task redTask = Task.builder()
                .user(user)
                .title("긴급-저중요")
                .estimatedMinutes(30)
                .requiredEnergy(EnergyLevel.MEDIUM)
                .deadline(now.plusMinutes(30))
                .importance(2)
                .category("DEV")
                .build();
        // 7일 뒤 마감 → GREEN, 중요도 높음
        Task greenTask = Task.builder()
                .user(user)
                .title("중요-여유")
                .estimatedMinutes(60)
                .requiredEnergy(EnergyLevel.MEDIUM)
                .deadline(now.plusDays(7))
                .importance(5)
                .category("DOCS")
                .build();

        // 입력 순서: green이 먼저(점수도 더 높음) — 그래도 red가 위로 와야 함
        List<Task> tasks = List.of(greenTask, redTask);
        when(priorityStrategy.calculate(greenTask, profile)).thenReturn(0.50);
        when(priorityStrategy.calculate(redTask, profile)).thenReturn(0.48);

        // When
        List<ScoredTaskResponse> result = priorityService.getPrioritizedTasks(userId, tasks);

        // Then
        assertEquals(2, result.size());
        assertEquals("RED", result.get(0).getUrgencyLevel());
        assertEquals("긴급-저중요", result.get(0).getTitle());
        assertEquals("중요-여유", result.get(1).getTitle());
    }

    @Test
    @DisplayName("RED 밴드 안에서는 점수가 높은 작업이 먼저 온다 (밴드 내부는 점수 우선)")
    void getPrioritizedTasks_withinRedBand_higherScoreFirst() {
        // Given
        Long userId = 1L;
        UserProfile profile = new UserProfile(userId, 0.5, 0.3, 0.2);
        when(userProfileRepository.findById(userId)).thenReturn(Optional.of(profile));
        when(mockRandom.nextDouble()).thenReturn(0.9);

        LocalDateTime now = LocalDateTime.now();
        Task redLow = Task.builder()
                .user(user)
                .title("red-low")
                .estimatedMinutes(30)
                .requiredEnergy(EnergyLevel.MEDIUM)
                .deadline(now.plusMinutes(20))
                .importance(2)
                .category("A")
                .build();
        Task redHigh = Task.builder()
                .user(user)
                .title("red-high")
                .estimatedMinutes(30)
                .requiredEnergy(EnergyLevel.MEDIUM)
                .deadline(now.plusMinutes(40))
                .importance(5)
                .category("B")
                .build();

        List<Task> tasks = List.of(redLow, redHigh);
        when(priorityStrategy.calculate(redLow, profile)).thenReturn(0.40);
        when(priorityStrategy.calculate(redHigh, profile)).thenReturn(0.70);

        // When
        List<ScoredTaskResponse> result = priorityService.getPrioritizedTasks(userId, tasks);

        // Then — 둘 다 RED이므로 점수 높은 red-high가 먼저
        assertEquals("red-high", result.get(0).getTitle());
        assertEquals("red-low", result.get(1).getTitle());
    }
}
