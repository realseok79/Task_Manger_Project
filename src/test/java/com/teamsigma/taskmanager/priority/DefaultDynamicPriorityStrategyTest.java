package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.User;
import com.teamsigma.taskmanager.domain.UserProfile;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("DefaultDynamicPriorityStrategy - 정규화된 점수")
class DefaultDynamicPriorityStrategyTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 7, 12, 0);

    private DefaultDynamicPriorityStrategy strategy;
    private final User user = User.builder().email("test@sigma.com").nickname("test").build();

    @BeforeEach
    void setUp() {
        Clock fixed = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        strategy = new DefaultDynamicPriorityStrategy(new UrgencyEvaluator(fixed));
    }

    private Task task(int importance, LocalDateTime deadline, int delayCount) {
        Task t = Task.builder()
                .user(user).title("t").estimatedMinutes(30).requiredEnergy(EnergyLevel.LOW)
                .deadline(deadline).importance(importance).category("DEV").build();
        for (int i = 0; i < delayCount; i++) {
            t.snooze();
        }
        return t;
    }

    @Test
    @DisplayName("정규화: 마감 60분·중요도 3·연기 2 (W=0.5/0.3/0.2) → 0.42")
    void normalized() {
        double score = strategy.calculate(task(3, NOW.plusMinutes(60), 2), new UserProfile(1L, 0.5, 0.3, 0.2));
        assertEquals(0.42, score, 0.0001);
    }

    @Test
    @DisplayName("Overdue - 마감 경과는 긴급도 최대(1.0) → 0.52")
    void overdueMaxUrgency() {
        double score = strategy.calculate(task(3, NOW.minusMinutes(30), 2), new UserProfile(1L, 0.5, 0.3, 0.2));
        assertEquals(0.52, score, 0.0001);
    }

    @Test
    @DisplayName("지연 페널티가 커서 음수면 하한선 0.0")
    void clampsToZero() {
        double score = strategy.calculate(task(1, NOW.plusMinutes(300), 50), new UserProfile(1L, 0.5, 0.3, 0.2));
        assertEquals(0.0, score, 0.0001);
    }

    @Test
    @DisplayName("마감 null이어도 NPE 없이 긴급도 0 → 0.4")
    void nullDeadlineSafe() {
        double score = strategy.calculate(task(4, null, 0), new UserProfile(1L, 0.5, 0.3, 0.2));
        assertEquals(0.4, score, 0.0001);
    }

    @Test
    @DisplayName("마감 없는 묵은 일 - 연기가 쌓여도 패널티로 가라앉지 않고 aging으로 표면화된다")
    void noDeadlineStaleSurfacesInsteadOfSinking() {
        UserProfile profile = new UserProfile(1L, 0.5, 0.3, 0.2);
        double fresh = strategy.calculate(task(3, null, 0), profile);   // 0.3 + 0
        double stale = strategy.calculate(task(3, null, 4), profile);   // 0.3 + aging(4)*0.3, 패널티 없음
        assertTrue(stale > fresh, "묵은 일(연기 4회)이 갓 만든 일보다 위로 와야 한다");
        assertEquals(0.3 + (4.0 / 9.0) * 0.3, stale, 0.0001);
    }

    @Test
    @DisplayName("핵심 개선 - 긴급도가 중요도와 경쟁(임박 저중요 > 먼 고중요)")
    void urgencyCompetes() {
        UserProfile urgencyDriven = new UserProfile(1L, 0.2, 0.7, 0.1);
        double imminentLow = strategy.calculate(task(2, NOW.plusMinutes(10), 0), urgencyDriven);
        double farHigh = strategy.calculate(task(4, NOW.plusMinutes(2000), 0), urgencyDriven);
        assertTrue(imminentLow > farHigh);
    }
}
