package com.teamsigma.taskmanager.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "user_activity_logs",
    indexes = {
        @Index(name = "idx_log_user_action_time", columnList = "user_id, action_type, logged_at"),
        @Index(name = "idx_log_task", columnList = "task_id")
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserActivityLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false)
    private Long userId;
    @Column(name = "task_id", nullable = false)
    private Long taskId;
    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", nullable = false, length = 20)
    private ActionType actionType;
    @Enumerated(EnumType.STRING)
    @Column(name = "context_energy", nullable = false, length = 10)
    private EnergyLevel contextEnergy;
    @Column(name = "context_available_minutes", nullable = false)
    private int contextAvailableMinutes;
    @Column(name = "task_importance", nullable = false)
    private int taskImportance;
    @Column(name = "task_estimated_minutes", nullable = false)
    private int taskEstimatedMinutes;
    @Column(name = "task_delay_count", nullable = false)
    private int taskDelayCount;
    @Column(name = "category", nullable = false, length = 100)
    private String category;
    @CreationTimestamp
    @Column(name = "logged_at", nullable = false, updatable = false)
    private LocalDateTime loggedAt;

    @Builder
    private UserActivityLog(Long userId, Long taskId, ActionType actionType, EnergyLevel contextEnergy,
                            int contextAvailableMinutes, int taskImportance, int taskEstimatedMinutes, int taskDelayCount, String category) {
        this.userId = userId;
        this.taskId = taskId;
        this.actionType = actionType;
        this.contextEnergy = contextEnergy;
        this.contextAvailableMinutes = contextAvailableMinutes;
        this.taskImportance = taskImportance;
        this.taskEstimatedMinutes = taskEstimatedMinutes;
        this.taskDelayCount = taskDelayCount;
        this.category = category != null ? category : "DEFAULT";
    }

    public UserActivityLog(Long userId, String activityType, String category, int starRating, int estimatedTime, LocalDateTime timestamp) {
        this.userId = userId;
        this.taskId = 0L;
        this.actionType = ActionType.valueOf(activityType);
        this.contextEnergy = EnergyLevel.LOW;
        this.contextAvailableMinutes = 0;
        this.taskImportance = starRating;
        this.taskEstimatedMinutes = estimatedTime;
        this.taskDelayCount = 0;
        this.loggedAt = timestamp;
        this.category = category != null ? category : "DEFAULT";
    }

    public UserActivityLog(Long userId, String activityType, int starRating, int estimatedTime, LocalDateTime timestamp) {
        this(userId, activityType, "DEFAULT", starRating, estimatedTime, timestamp);
    }

    public static UserActivityLog snapshot(Task task, ActionType actionType, EnergyLevel currentEnergy, int currentAvailableMinutes) {
        return UserActivityLog.builder()
                .userId(task.getUser().getId())
                .taskId(task.getId())
                .actionType(actionType)
                .contextEnergy(currentEnergy)
                .contextAvailableMinutes(currentAvailableMinutes)
                .taskImportance(task.getImportance())
                .taskEstimatedMinutes(task.getEstimatedMinutes())
                .taskDelayCount(task.getDelayCount())
                .category(task.getCategory())
                .build();
    }

    public String getActivityType() {
        return actionType != null ? actionType.name() : null;
    }

    public int getStarRating() {
        return taskImportance;
    }

    public int getEstimatedTime() {
        return taskEstimatedMinutes;
    }

    public LocalDateTime getTimestamp() {
        return loggedAt;
    }
}
