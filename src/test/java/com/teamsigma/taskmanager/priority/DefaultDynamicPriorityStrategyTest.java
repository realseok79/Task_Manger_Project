package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.User;
import com.teamsigma.taskmanager.domain.UserProfile;
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
        LocalDateTime deadline = LocalDateTime.now().plusMinutes(60).plusSeconds(5);
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
        task.snooze(); // delayCount becomes 2

        UserProfile profile = new UserProfile(1L, 2.0, 100.0, 1.5); // W1=2.0, W2=100.0, W3=1.5

        // Expected Score Calculation:
        // dt = 60
        // score = (3 * 2.0) + (100.0 / (60 + 10.0)) - (2 * 1.5)
        //       = 6.0 + (100.0 / 70.0) - 3.0
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
        LocalDateTime deadline = LocalDateTime.now().minusMinutes(30);
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
        LocalDateTime deadline = LocalDateTime.now().plusMinutes(60).plusSeconds(5);
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
        for (int i = 0; i < 50; i++) {
            task.snooze();
        }

        UserProfile profile = new UserProfile(1L, 1.0, 10.0, 2.0); // W1=1.0, W2=10.0, W3=2.0

        // When
        double actualScore = strategy.calculate(task, profile);

        // Then
        assertEquals(0.0, actualScore, 0.0001);
    }
}
