package com.teamsigma.taskmanager.service;

import com.teamsigma.taskmanager.domain.*;
import com.teamsigma.taskmanager.dto.TaskCreateRequest;
import com.teamsigma.taskmanager.dto.TaskStatusUpdateRequest;
import com.teamsigma.taskmanager.event.TaskActionEvent;
import com.teamsigma.taskmanager.exception.TaskNotFoundException;
import com.teamsigma.taskmanager.repository.TaskRepository;
import com.teamsigma.taskmanager.repository.UserActivityLogRepository;
import com.teamsigma.taskmanager.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@RequiredArgsConstructor
@SuppressWarnings("null") // JPA 레거시 타입과 Eclipse null 분석기 불일치 — 런타임에는 안전
public class TaskService {
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final UserActivityLogRepository activityLogRepository;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Task 생성. 소유 유저를 영속 상태로 로딩한 뒤 연관관계를 맺는다.
     * 존재하지 않는 userId면 400(IllegalArgumentException)으로 처리되도록 한다.
     */
    @Transactional
    public Task createTask(TaskCreateRequest request) {
        User user = userRepository.findById(request.userId())
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 User입니다. userId=" + request.userId()));
        Task task = Task.builder()
                .user(user)
                .title(request.title())
                .description(request.description())
                .estimatedMinutes(request.estimatedMinutes())
                .deadline(request.deadline())
                .requiredEnergy(request.requiredEnergy())
                .importance(request.importance())
                .category(request.category() != null ? request.category() : "DEFAULT")
                .build();
        return taskRepository.save(task);
    }

    /**
     * API 액션(COMPLETE/SNOOZE/ARCHIVE)을 도메인 행동으로 라우팅.
     * 컨트롤러에 분기 로직이 흩어지지 않도록 단일 진입점으로 모은다.
     */
    @Transactional
    public void changeStatus(Long taskId, TaskStatusUpdateRequest request) {
        switch (request.action()) {
            case COMPLETE -> completeTask(taskId, request.energyLevel(), request.availableMinutes());
            case SNOOZE   -> snoozeTask(taskId, request.energyLevel(), request.availableMinutes());
            case ARCHIVE  -> archiveTask(taskId, request.energyLevel(), request.availableMinutes());
        }
    }

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

    /** 단건 조회. 없으면 404(TaskNotFoundException). */
    @Transactional(readOnly = true)
    public Task getTask(Long taskId) {
        return findTaskOrThrow(taskId);
    }

    /** 우선순위 정렬용: 유저의 미완료(PENDING/SNOOZED) 태스크 목록. */
    @Transactional(readOnly = true)
    public List<Task> getActiveTasks(Long userId) {
        return taskRepository.findByUserIdAndStatusIn(userId, List.of(TaskStatus.PENDING, TaskStatus.SNOOZED));
    }

    /** 완료 기록 조회: COMPLETED 상태만, 완료(갱신) 시각 역순. */
    @Transactional(readOnly = true)
    public List<Task> getCompletedTasks(Long userId) {
        return taskRepository.findByUserIdAndStatusOrderByUpdatedAtDesc(userId, TaskStatus.COMPLETED);
    }

    @Transactional(readOnly = true)
    public List<Task> getZombieTasks(Long userId) {
        return taskRepository.findZombieTasksByUserId(userId);
    }

    /** 엔진 파트 연동용: 유저 행동 로그를 최신순으로 조회. */
    @Transactional(readOnly = true)
    public List<UserActivityLog> getUserActivityLogs(Long userId) {
        return activityLogRepository.findByUserIdOrderByLoggedAtDesc(userId);
    }

    /** 유저 행동 로그를 최신순으로 페이지 조회(신규 페이징 엔드포인트용). */
    @Transactional(readOnly = true)
    public Page<UserActivityLog> getUserActivityLogs(Long userId, Pageable pageable) {
        return activityLogRepository.findByUserIdOrderByLoggedAtDesc(userId, pageable);
    }

    public double getCompletionRate(Long userId) {
        long total = taskRepository.countByUserId(userId);
        if (total == 0) return 0.0;
        long completed = taskRepository.countByUserIdAndStatus(userId, TaskStatus.COMPLETED);
        return (double) completed / total * 100.0;
    }

    private Task findTaskOrThrow(Long taskId) {
        // 없는 리소스는 404로 매핑되어야 하므로 IllegalArgumentException(400)이 아닌 전용 예외를 던진다.
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new TaskNotFoundException(taskId));
    }

    private void publishEvent(Task task, ActionType actionType, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        eventPublisher.publishEvent(new TaskActionEvent(this, task, actionType, currentEnergy, currentAvailableMinutes));
    }
}
