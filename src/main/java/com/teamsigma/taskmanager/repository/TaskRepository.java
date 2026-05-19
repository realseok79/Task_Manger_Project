package com.teamsigma.taskmanager.repository;

import com.teamsigma.taskmanager.domain.EnergyLevel;
import com.teamsigma.taskmanager.domain.Task;
import com.teamsigma.taskmanager.domain.TaskStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface TaskRepository extends JpaRepository<Task, Long> {
    @Query("""
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'PENDING'
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
            """)
    List<Task> findAvailableTasksWithHardConstraint(
            @Param("userId") Long userId,
            @Param("currentEnergyLevel") EnergyLevel currentEnergyLevel,
            @Param("availableMinutes") int availableMinutes
    );

    List<Task> findByUserIdAndStatus(Long userId, TaskStatus status);

    @Query("""
            SELECT t FROM Task t
            WHERE t.user.id = :userId
              AND t.status = 'SNOOZED'
              AND t.delayCount >= 5
            ORDER BY t.delayCount DESC
            """)
    List<Task> findZombieTasksByUserId(@Param("userId") Long userId);
}
