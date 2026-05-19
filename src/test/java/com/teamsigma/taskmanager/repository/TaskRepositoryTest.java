package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import java.time.LocalDateTime;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@DisplayName("TaskRepository Hard Constraint 쿼리 테스트")
class TaskRepositoryTest {
    @Autowired
    private TestEntityManager em;
    @Autowired
    private TaskRepository taskRepository;
    private User user;

    @BeforeEach
    void setUp() {
        user = em.persist(User.builder().email("jungwoo@sigma.com").nickname("박정우").build());
        em.flush();
    }

    @Nested
    @DisplayName("findAvailableTasksWithHardConstraint — Hard Constraint 필터링")
    class HardConstraintFilterTest {
        @Test
        @DisplayName("정상 케이스: 에너지·시간 조건을 모두 충족하는 Task만 반환")
        void returnsOnlyAffordableTasks() {
            Task affordable = saveTask("가벼운 일지 작성", 20, EnergyLevel.LOW, 3);
            Task tooLong = saveTask("대규모 리팩토링", 120, EnergyLevel.LOW, 5);
            Task tooHeavy = saveTask("복잡한 설계", 30, EnergyLevel.HIGH, 5);
            em.flush(); em.clear();

            List<Task> result = taskRepository.findAvailableTasksWithHardConstraint(user.getId(), EnergyLevel.LOW, 60);
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getTitle()).isEqualTo("가벼운 일지 작성");
        }
    }

    @Nested
    @DisplayName("findZombieTasksByUserId — 좀비 태스크 감지")
    class ZombieTaskTest {
        @Test
        @DisplayName("정상 케이스: delayCount >= 5 이고 SNOOZED인 Task만 반환")
        void returnsZombieTasksOnly() {
            Task zombie = saveTaskWithSnoozes(5);
            Task normal = saveTask("일반 태스크", 30, EnergyLevel.LOW, 3);
            em.flush(); em.clear();

            List<Task> result = taskRepository.findZombieTasksByUserId(user.getId());
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getDelayCount()).isGreaterThanOrEqualTo(5);
        }
    }

    @Nested
    @DisplayName("findUrgentTasksDueWithinOneHour — 긴급 마감 태스크")
    class UrgentTaskTest {
        @Test
        @DisplayName("정상 케이스: 1시간 이내 마감 PENDING Task만 반환")
        void returnsUrgentPendingTasks() {
            saveTaskWithDeadline("긴급", LocalDateTime.now().plusMinutes(30));
            saveTaskWithDeadline("여유", LocalDateTime.now().plusHours(3));
            em.flush(); em.clear();

            List<Task> result = taskRepository.findUrgentTasksDueWithinOneHour(user.getId());
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getTitle()).isEqualTo("긴급");
        }
    }

    private Task saveTask(String title, int minutes, EnergyLevel energy, int importance) {
        return em.persist(Task.builder().user(user).title(title).estimatedMinutes(minutes).requiredEnergy(energy).importance(importance).build());
    }

    private Task saveTaskWithSnoozes(int snoozeCount) {
        Task task = em.persist(Task.builder().user(user).title("좀비 후보").estimatedMinutes(30).requiredEnergy(EnergyLevel.LOW).importance(3).build());
        for (int i = 0; i < snoozeCount; i++) task.snooze();
        return em.persist(task);
    }

    private Task saveTaskWithDeadline(String title, LocalDateTime deadline) {
        return em.persist(Task.builder().user(user).title(title).estimatedMinutes(30).requiredEnergy(EnergyLevel.LOW).importance(3).deadline(deadline).build());
    }
}
