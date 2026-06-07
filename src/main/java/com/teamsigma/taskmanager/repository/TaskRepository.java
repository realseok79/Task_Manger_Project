package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.TaskStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;

public interface TaskRepository extends JpaRepository<Task, Long> {
    @Query("""
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status IN ('PENDING', 'SNOOZED')
              AND t.estimatedMinutes <= :availableMinutes
              AND (
                  CASE t.requiredEnergy
                      WHEN 'LOW'    THEN 0
                      WHEN 'MEDIUM' THEN 1
                      WHEN 'HIGH'   THEN 2
                  END
              ) <= (
                  CASE :#{#currentEnergyLevel.name()}
                      WHEN 'LOW'    THEN 0
                      WHEN 'MEDIUM' THEN 1
                      WHEN 'HIGH'   THEN 2
                  END
              )
            ORDER BY t.deadline ASC NULLS LAST
            """)
    List<Task> findAvailableTasksWithHardConstraint(
            @Param("userId") Long userId,
            @Param("currentEnergyLevel") EnergyLevel currentEnergyLevel,
            @Param("availableMinutes") int availableMinutes
    );

    List<Task> findByUserIdAndStatus(Long userId, TaskStatus status);

    // 완료 기록 조회용: 특정 상태(COMPLETED)를 갱신 시각 역순으로.
    List<Task> findByUserIdAndStatusOrderByUpdatedAtDesc(Long userId, TaskStatus status);

    // 우선순위 정렬 입력용: 여러 상태(PENDING/SNOOZED)를 한 번에 조회.
    List<Task> findByUserIdAndStatusIn(Long userId, Collection<TaskStatus> statuses);

    @Query("""
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'SNOOZED'
              AND t.delayCount >= 5
            ORDER BY t.delayCount DESC
            """)
    List<Task> findZombieTasksByUserId(@Param("userId") Long userId);

    @Query("""
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'PENDING'
              AND t.deadline IS NOT NULL
              AND t.deadline BETWEEN CURRENT_TIMESTAMP
                                 AND (CURRENT_TIMESTAMP + 1 HOUR)
            ORDER BY t.deadline ASC
            """)
    List<Task> findUrgentTasksDueWithinOneHour(@Param("userId") Long userId);

    long countByUserId(Long userId);
    long countByUserIdAndStatus(Long userId, TaskStatus status);
}
