package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.User;
import com.teamsigma.taskmanager.domain.UserProfile;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DefaultDynamicPriorityStrategyTest {

    private final Instant fixedInstant = Instant.parse("2026-06-07T12:00:00Z");
    private final Clock clock = Clock.fixed(fixedInstant, ZoneId.systemDefault());
    private final UrgencyEvaluator urgencyEvaluator = new UrgencyEvaluator(clock);
    private final DefaultDynamicPriorityStrategy strategy = new DefaultDynamicPriorityStrategy(urgencyEvaluator);

    @Test
    @DisplayName("정상 케이스 - 마감까지 60분 남은 경우 정확한 우선순위 점수를 계산한다")
    void calculate_NormalCase_60MinutesLeft() {
        // Given
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime deadline = now.plusMinutes(60);
        User user = User.builder().email("test@sigma.com").nickname("test").build();
        Task task = Task.builder()
                .user(user)
                .title("test")
                .estimatedMinutes(30)
                .requiredEnergy(EnergyLevel.LOW)
                .deadline(deadline)
                .importance(3)
                .category("DEV")
                .build();
        task.snooze();
        task.snooze(); // delayCount = 2

        UserProfile profile = new UserProfile(1L, 2.0, 100.0, 1.5); // W1=2.0, W2=100.0, W3=1.5

        // Expected Score Calculation:
        // importanceNorm = 3 / 5.0 = 0.6 -> importance = 2.0 * 0.6 = 1.2
        // urgencyNorm = 120.0 / (60.0 + 120.0) = 120 / 180 = 2.0/3.0
        // urgency = 100.0 * (2.0/3.0) = 66.66666666666667
        // delayNorm = 2.0 / 5.0 = 0.4 -> delayPenalty = 1.5 * 0.4 = 0.6
        // total = 1.2 + 66.66666666666667 - 0.6 = 67.26666666666667
        double expectedScore = (2.0 * 0.6) + (100.0 * (120.0 / (60.0 + 120.0))) - (1.5 * 0.4);

        // When
        double actualScore = strategy.calculate(task, profile);

        // Then
        assertEquals(expectedScore, actualScore, 0.0001);
    }

    @Test
    @DisplayName("Overdue 케이스 - 마감이 30분 지난 경우 안전하게 dt를 0으로 보정하여 계산한다")
    void calculate_OverdueCase_30MinutesOverdue() {
        // Given
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime deadline = now.minusMinutes(30);
        User user = User.builder().email("test@sigma.com").nickname("test").build();
        Task task = Task.builder()
                .user(user)
                .title("test")
                .estimatedMinutes(30)
                .requiredEnergy(EnergyLevel.LOW)
                .deadline(deadline)
                .importance(3)
                .category("DEV")
                .build();
        task.snooze();
        task.snooze(); // delayCount = 2

        UserProfile profile = new UserProfile(1L, 2.0, 100.0, 1.5); // W1=2.0, W2=100.0, W3=1.5

        // Expected Score Calculation:
        // importanceNorm = 3 / 5.0 = 0.6 -> importance = 2.0 * 0.6 = 1.2
        // dt = -30. safeDt = 0.0
        // urgencyNorm = 120.0 / (0.0 + 120.0) = 1.0 -> urgency = 100.0 * 1.0 = 100.0
        // delayNorm = 2.0 / 5.0 = 0.4 -> delayPenalty = 1.5 * 0.4 = 0.6
        // total = 1.2 + 100.0 - 0.6 = 100.6
        double expectedScore = (2.0 * 0.6) + (100.0 * 1.0) - (1.5 * 0.4);

        // When
        double actualScore = strategy.calculate(task, profile);

        // Then
        assertEquals(expectedScore, actualScore, 0.0001);
    }

    @Test
    @DisplayName("DelayCount가 높은 경우 - 마이너스 점수가 나오는 상황에서 하한선 0.0이 적용된다")
    void calculate_HighDelayCount_ShouldClampToZero() {
        // Given
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime deadline = now.plusMinutes(60);
        User user = User.builder().email("test@sigma.com").nickname("test").build();
        Task task = Task.builder()
                .user(user)
                .title("test")
                .estimatedMinutes(30)
                .requiredEnergy(EnergyLevel.LOW)
                .deadline(deadline)
                .importance(1)
                .category("DEV")
                .build();
        for (int i = 0; i < 10; i++) {
            task.snooze();
        } // delayCount = 10

        UserProfile profile = new UserProfile(1L, 1.0, 0.5, 5.0); // W1=1.0, W2=0.5, W3=5.0

        // Expected Score Calculation:
        // importanceNorm = 1.0 / 5.0 = 0.2 -> importance = 1.0 * 0.2 = 0.2
        // urgencyNorm = 120.0 / (60.0 + 120.0) = 2.0 / 3.0 -> urgency = 0.5 * (2.0 / 3.0) = 0.333333
        // delayNorm = clampUnit(10.0 / 5.0) = 1.0 -> delayPenalty = 5.0 * 1.0 = 5.0
        // total = 0.2 + 0.333333 - 5.0 = -4.466666 -> clamped to 0.0

        // When
        double actualScore = strategy.calculate(task, profile);

        // Then
        assertEquals(0.0, actualScore, 0.0001);
    }
}
