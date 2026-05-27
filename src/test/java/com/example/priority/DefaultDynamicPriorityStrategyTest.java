package com.example.priority;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DefaultDynamicPriorityStrategyTest {

    private final DefaultDynamicPriorityStrategy strategy = new DefaultDynamicPriorityStrategy();

    @Test
    @DisplayName("정상 케이스 - 마감까지 60분 남은 경우 정확한 우선순위 점수를 계산한다")
    void calculate_NormalCase_60MinutesLeft() {
        // Given
        // ChronoUnit.MINUTES.between(LocalDateTime.now(), task.getDueDate()) 계산 시
        // 계산 시점의 미세한 시간차로 인해 59분이 반환되는 것을 방지하기 위해 5초의 여유를 추가합니다.
        LocalDateTime dueDate = LocalDateTime.now().plusMinutes(60).plusSeconds(5);
        Task task = new Task(dueDate, 3, 2); // starRating=3, delayCount=2
        UserProfile profile = new UserProfile(1L, 2.0, 100.0, 1.5); // W1=2.0, W2=100.0, W3=1.5

        // Expected Score Calculation:
        // dt = 60
        // score = (3 * 2.0) + (100.0 / (60 + 10.0)) - (2 * 1.5)
        //       = 6.0 + (100.0 / 70.0) - 3.0
        //       = 6.0 + 1.4285714285714286 - 3.0
        //       = 4.428571428571429
        double expectedScore = (3 * 2.0) + (100.0 / (60.0 + 10.0)) - (2 * 1.5);

        // When
        double actualScore = strategy.calculate(task, profile);

        // Then
        assertEquals(expectedScore, actualScore, 0.0001);
    }

    @Test
    @DisplayName("Overdue 케이스 - 마감이 30분 지난 경우 안전하게 dt를 0으로 보정하여 계산한다")
    void calculate_OverdueCase_30MinutesOverdue() {
        // Given
        // 마감이 지난 상태(dt = -30분)
        LocalDateTime dueDate = LocalDateTime.now().minusMinutes(30);
        Task task = new Task(dueDate, 3, 2); // starRating=3, delayCount=2
        UserProfile profile = new UserProfile(1L, 2.0, 100.0, 1.5); // W1=2.0, W2=100.0, W3=1.5

        // Expected Score Calculation:
        // dt < 0 이므로 safeDt = 0.0
        // score = (3 * 2.0) + (100.0 / (0 + 10.0)) - (2 * 1.5)
        //       = 6.0 + 10.0 - 3.0
        //       = 13.0
        double expectedScore = (3 * 2.0) + (100.0 / (0.0 + 10.0)) - (2 * 1.5);

        // When
        double actualScore = strategy.calculate(task, profile);

        // Then
        assertEquals(expectedScore, actualScore, 0.0001);
    }

    @Test
    @DisplayName("DelayCount가 높은 경우 - 마이너스 점수가 나오는 상황에서 하한선 0.0이 적용된다")
    void calculate_HighDelayCount_ShouldClampToZero() {
        // Given
        LocalDateTime dueDate = LocalDateTime.now().plusMinutes(60).plusSeconds(5);
        // 지연 횟수가 매우 높아 공식 상 음수가 나오는 태스크 생성
        Task task = new Task(dueDate, 1, 50); // starRating=1, delayCount=50
        UserProfile profile = new UserProfile(1L, 1.0, 10.0, 2.0); // W1=1.0, W2=10.0, W3=2.0

        // Expected Score Calculation:
        // dt = 60
        // rawScore = (1 * 1.0) + (10.0 / 70.0) - (50 * 2.0)
        //          = 1.0 + 0.142857 - 100.0
        //          = -98.857143
        // Clamped to 0.0

        // When
        double actualScore = strategy.calculate(task, profile);

        // Then
        assertEquals(0.0, actualScore, 0.0001);
    }
}
