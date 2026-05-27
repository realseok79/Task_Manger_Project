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
    private Clock fixedClock;
    private LocalDateTime baseTime;

    @BeforeEach
    void setUp() {
        // Base time: 2026-05-27T10:00:00
        baseTime = LocalDateTime.of(2026, 5, 27, 10, 0, 0);
        Instant instant = baseTime.atZone(ZoneId.systemDefault()).toInstant();
        fixedClock = Clock.fixed(instant, ZoneId.systemDefault());
        mapper = new TaskResponseMapper(fixedClock);
    }

    @Test
    @DisplayName("마감이 이미 지난 overdue 작업(dt < 0)은 urgencyLevel이 RED이다")
    void toResponse_Overdue_Red() {
        Task task = new Task(1L, "Overdue Task", "DEV", baseTime.minusMinutes(10), 3, 0);
        TaskResponse response = mapper.toResponse(task, 95.123);

        assertEquals("RED", response.getUrgencyLevel());
        assertEquals("Overdue Task", response.getTitle());
    }

    @Test
    @DisplayName("마감까지 1시간 이내(dt <= 60)인 작업은 urgencyLevel이 RED이다")
    void toResponse_Within60Minutes_Red() {
        Task task = new Task(1L, "Urgent Task", "DEV", baseTime.plusMinutes(60), 3, 0);
        TaskResponse response = mapper.toResponse(task, 95.123);

        assertEquals("RED", response.getUrgencyLevel());
    }

    @Test
    @DisplayName("마감까지 1시간 초과 3시간 이하(60 < dt <= 180)인 작업은 urgencyLevel이 YELLOW이다")
    void toResponse_Within180Minutes_Yellow() {
        Task task1 = new Task(1L, "Yellow Task 1", "DEV", baseTime.plusMinutes(61), 3, 0);
        TaskResponse response1 = mapper.toResponse(task1, 95.123);

        Task task2 = new Task(2L, "Yellow Task 2", "DEV", baseTime.plusMinutes(180), 3, 0);
        TaskResponse response2 = mapper.toResponse(task2, 95.123);

        assertEquals("YELLOW", response1.getUrgencyLevel());
        assertEquals("YELLOW", response2.getUrgencyLevel());
    }

    @Test
    @DisplayName("마감까지 3시간 초과(dt > 180)인 작업은 urgencyLevel이 GREEN이다")
    void toResponse_MoreThan180Minutes_Green() {
        Task task = new Task(1L, "Green Task", "DEV", baseTime.plusMinutes(181), 3, 0);
        TaskResponse response = mapper.toResponse(task, 95.123);

        assertEquals("GREEN", response.getUrgencyLevel());
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
}
