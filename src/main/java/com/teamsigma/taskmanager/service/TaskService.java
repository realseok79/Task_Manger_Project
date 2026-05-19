package com.teamsigma.taskmanager.service;

import com.teamsigma.taskmanager.domain.*;
import com.teamsigma.taskmanager.event.TaskActionEvent;
import com.teamsigma.taskmanager.repository.TaskRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@RequiredArgsConstructor
public class TaskService {
    private final TaskRepository taskRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public void completeTask(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        task.complete();
        publishEvent(task, ActionType.COMPLETED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional
    public void snoozeTask(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        task.snooze();
        publishEvent(task, ActionType.SNOOZED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional
    public void archiveTask(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        task.archive();
        publishEvent(task, ActionType.ARCHIVED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional
    public void rejectArchive(Long taskId, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        Task task = findTaskOrThrow(taskId);
        publishEvent(task, ActionType.ARCHIVE_REJECTED, currentEnergy, currentAvailableMinutes);
    }

    @Transactional(readOnly = true)
    public List<Task> getAvailableTasks(Long userId, EnergyLevel currentEnergy, int availableMinutes) {
        return taskRepository.findAvailableTasksWithHardConstraint(userId, currentEnergy, availableMinutes);
    }

    @Transactional(readOnly = true)
    public List<Task> getZombieTasks(Long userId) {
        return taskRepository.findZombieTasksByUserId(userId);
    }

    public double getCompletionRate(Long userId) {
        long total = taskRepository.countByUserId(userId);
        if (total == 0) return 0.0;
        long completed = taskRepository.countByUserIdAndStatus(userId, TaskStatus.COMPLETED);
        return (double) completed / total * 100.0;
    }

    private Task findTaskOrThrow(Long taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 Task입니다. taskId=" + taskId));
    }

    private void publishEvent(Task task, ActionType actionType, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        eventPublisher.publishEvent(new TaskActionEvent(this, task, actionType, currentEnergy, currentAvailableMinutes));
    }
}
