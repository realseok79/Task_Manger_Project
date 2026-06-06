package com.example.priority;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.*;

class TaskResponseMapperTest {

    private TaskResponseMapper mapper;
    private LocalDateTime baseTime;

    @BeforeEach
    void setUp() {
        // Base time: 2026-05-27T10:00:00
        baseTime = LocalDateTime.of(2026, 5, 27, 10, 0, 0);
        Instant instant = baseTime.atZone(ZoneId.systemDefault()).toInstant();
        Clock fixedClock = Clock.fixed(instant, ZoneId.systemDefault());
        // urgencyLevel은 점수와 동일한 UrgencyEvaluator(factor 기반)에서 산출된다.
        mapper = new TaskResponseMapper(new UrgencyEvaluator(fixedClock));
    }

    @Test
    @DisplayName("마감 경과 작업(factor=1.0)은 urgencyLevel이 RED이다")
    void toResponse_Overdue_Red() {
        Task task = new Task(1L, "Overdue Task", "DEV", baseTime.minusMinutes(10), 3, 0);
        TaskResponse response = mapper.toResponse(task, 95.123);

        assertEquals("RED", response.getUrgencyLevel());
        assertEquals("Overdue Task", response.getTitle());
    }

    @Test
    @DisplayName("마감 임박(30분 후, factor=0.8 ≥ 0.66)은 urgencyLevel이 RED이다")
    void toResponse_Imminent_Red() {
        // factor = 120/(30+120) = 0.8
        Task task = new Task(1L, "Urgent Task", "DEV", baseTime.plusMinutes(30), 3, 0);
        TaskResponse response = mapper.toResponse(task, 95.123);

        assertEquals("RED", response.getUrgencyLevel());
    }

    @Test
    @DisplayName("중간 임박(120분 후, factor=0.5)은 urgencyLevel이 YELLOW이다")
    void toResponse_Mid_Yellow() {
        // factor = 120/(120+120) = 0.5 (0.33 ≤ 0.5 < 0.66)
        Task task = new Task(1L, "Yellow Task", "DEV", baseTime.plusMinutes(120), 3, 0);
        TaskResponse response = mapper.toResponse(task, 95.123);

        assertEquals("YELLOW", response.getUrgencyLevel());
    }

    @Test
    @DisplayName("여유 있는 작업(600분 후, factor=0.167 < 0.33)은 urgencyLevel이 GREEN이다")
    void toResponse_Relaxed_Green() {
        // factor = 120/(600+120) = 0.167
        Task task = new Task(1L, "Green Task", "DEV", baseTime.plusMinutes(600), 3, 0);
        TaskResponse response = mapper.toResponse(task, 95.123);

        assertEquals("GREEN", response.getUrgencyLevel());
    }

    @Test
    @DisplayName("마감이 없는 작업은 urgencyLevel이 NONE이다 (GREEN으로 위장하지 않는다)")
    void toResponse_NoDeadline_None() {
        Task task = new Task(1L, "No Deadline Task", "DEV", null, 3, 0);
        TaskResponse response = mapper.toResponse(task, 95.123);

        assertEquals("NONE", response.getUrgencyLevel());
    }

    @Test
    @DisplayName("delayCount가 5 이상일 때 isZombie는 true이고, 5 미만일 때는 false이다")
    void toResponse_ZombieStatusCheck() {
        Task activeTask = new Task(1L, "Active Task", "DEV", baseTime.plusDays(1), 3, 4);
        Task zombieTask1 = new Task(2L, "Zombie Task 1", "DEV", baseTime.plusDays(1), 3, 5);
        Task zombieTask2 = new Task(3L, "Zombie Task 2", "DEV", baseTime.plusDays(1), 3, 6);

        assertFalse(mapper.toResponse(activeTask, 50.0).isZombie());
        assertTrue(mapper.toResponse(zombieTask1, 50.0).isZombie());
        assertTrue(mapper.toResponse(zombieTask2, 50.0).isZombie());
    }

    @Test
    @DisplayName("priorityScore는 소수점 2자리로 반올림된다")
    void toResponse_ScoreRounding() {
        Task task = new Task(1L, "Task", "DEV", baseTime.plusDays(1), 3, 0);

        assertEquals(87.44, mapper.toResponse(task, 87.436).getPriorityScore());
        assertEquals(87.43, mapper.toResponse(task, 87.434).getPriorityScore());
        assertEquals(87.40, mapper.toResponse(task, 87.4).getPriorityScore());
    }

    @Test
    @DisplayName("reason은 마감·연기·중요도를 조합해 사람이 읽을 수 있게 만든다")
    void toResponse_Reason() {
        // 마감 30분 후 + 중요도 5(>=4) → "마감까지 30분 · 중요도 높음"
        Task important = new Task(1L, "T", "DEV", baseTime.plusMinutes(30), 5, 0);
        assertEquals("마감까지 30분 · 중요도 높음", mapper.toResponse(important, 1.0).getReason());

        // 마감 10분 경과 + 6회 보류 → 비수치심 표현 "마감 10분 지남 · 묵은 일(6회 보류)"
        Task overdueZombie = new Task(2L, "T", "DEV", baseTime.minusMinutes(10), 3, 6);
        assertEquals("마감 10분 지남 · 묵은 일(6회 보류)", mapper.toResponse(overdueZombie, 1.0).getReason());

        // 마감 없음 → "마감 없음"
        Task noDeadline = new Task(3L, "T", "DEV", null, 3, 0);
        assertEquals("마감 없음", mapper.toResponse(noDeadline, 1.0).getReason());
    }

    @Test
    @DisplayName("마감 없는 작업이 여러 번 방치되면 urgencyLevel이 NONE→STALE로 승격된다")
    void toResponse_NoDeadline_Neglected_Stale() {
        // 방치 0 → aging 0 < 0.33 → NONE
        Task fresh = new Task(1L, "T", "DEV", null, 3, 0);
        assertEquals("NONE", mapper.toResponse(fresh, 1.0).getUrgencyLevel());

        // 방치 5 → aging 0.5 >= 0.33 → STALE
        Task neglected = new Task(2L, "T", "DEV", null, 3, 5);
        assertEquals("STALE", mapper.toResponse(neglected, 1.0).getUrgencyLevel());
    }

    @Test
    @DisplayName("stuckLevel은 미룸 횟수에 따라 NONE→AGING→STUCK→STALLED로 등급화된다")
    void toResponse_StuckLevel() {
        assertEquals("NONE", mapper.toResponse(new Task(1L, "T", "DEV", baseTime.plusDays(1), 3, 2), 1.0).getStuckLevel());
        assertEquals("AGING", mapper.toResponse(new Task(2L, "T", "DEV", baseTime.plusDays(1), 3, 3), 1.0).getStuckLevel());
        assertEquals("STUCK", mapper.toResponse(new Task(3L, "T", "DEV", baseTime.plusDays(1), 3, 5), 1.0).getStuckLevel());
        assertEquals("STALLED", mapper.toResponse(new Task(4L, "T", "DEV", baseTime.plusDays(1), 3, 8), 1.0).getStuckLevel());
    }
}
