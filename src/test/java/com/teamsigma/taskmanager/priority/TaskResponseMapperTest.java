package com.teamsigma.taskmanager.priority;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;

@DisplayName("TaskResponseMapper - 긴급도/사유/정체등급")
class TaskResponseMapperTest {

    private static final LocalDateTime BASE = LocalDateTime.of(2026, 5, 27, 10, 0);

    private TaskResponseMapper mapper;
    private final User user = User.builder().email("u@sigma.com").nickname("u").build();

    @BeforeEach
    void setUp() {
        Clock fixed = Clock.fixed(BASE.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        mapper = new TaskResponseMapper(new UrgencyEvaluator(fixed));
    }

    private Task task(LocalDateTime deadline, int importance, int delayCount) {
        Task t = Task.builder()
                .user(user).title("t").estimatedMinutes(30).requiredEnergy(EnergyLevel.LOW)
                .deadline(deadline).importance(importance).category("DEV").build();
        for (int i = 0; i < delayCount; i++) {
            t.snooze();
        }
        return t;
    }

    @Test
    @DisplayName("urgencyLevel: 경과/임박=RED, 중간=YELLOW, 여유=GREEN")
    void urgencyLevels() {
        assertEquals("RED", mapper.toResponse(task(BASE.minusMinutes(10), 3, 0), 1.0).getUrgencyLevel());
        assertEquals("RED", mapper.toResponse(task(BASE.plusMinutes(30), 3, 0), 1.0).getUrgencyLevel());   // 120/150=0.8
        assertEquals("YELLOW", mapper.toResponse(task(BASE.plusMinutes(120), 3, 0), 1.0).getUrgencyLevel());// 0.5
        assertEquals("GREEN", mapper.toResponse(task(BASE.plusMinutes(600), 3, 0), 1.0).getUrgencyLevel()); // 0.167
    }

    @Test
    @DisplayName("마감 없는 작업: 방치 0=NONE, 방치 5=STALE")
    void noDeadlineNoneToStale() {
        assertEquals("NONE", mapper.toResponse(task(null, 3, 0), 1.0).getUrgencyLevel());
        assertEquals("STALE", mapper.toResponse(task(null, 3, 5), 1.0).getUrgencyLevel()); // aging 0.5
    }

    @Test
    @DisplayName("reason: 마감·정체(비수치심)·중요도 조합")
    void reason() {
        assertEquals("마감까지 30분 · 중요도 높음", mapper.toResponse(task(BASE.plusMinutes(30), 5, 0), 1.0).getReason());
        assertEquals("마감 10분 지남 · 묵은 일(6회 보류)", mapper.toResponse(task(BASE.minusMinutes(10), 3, 6), 1.0).getReason());
        assertEquals("마감 없음", mapper.toResponse(task(null, 3, 0), 1.0).getReason());
    }

    @Test
    @DisplayName("stuckLevel: NONE→AGING→STUCK→STALLED")
    void stuckLevels() {
        assertEquals("NONE", mapper.toResponse(task(BASE.plusDays(1), 3, 2), 1.0).getStuckLevel());
        assertEquals("AGING", mapper.toResponse(task(BASE.plusDays(1), 3, 3), 1.0).getStuckLevel());
        assertEquals("STUCK", mapper.toResponse(task(BASE.plusDays(1), 3, 5), 1.0).getStuckLevel());
        assertEquals("STALLED", mapper.toResponse(task(BASE.plusDays(1), 3, 8), 1.0).getStuckLevel());
    }
}
